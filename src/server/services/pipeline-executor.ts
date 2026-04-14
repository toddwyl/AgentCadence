import { v4 as uuidv4 } from 'uuid';
import type {
  AgentFeedItem,
  Pipeline,
  PipelineRunRecord,
  StageRunRecord,
  StepRunRecord,
  StepStatus,
  PipelineRunStatus,
  AgentStreamUiEvent,
} from '../../shared/types.js';
import { applyAgentStreamEvent } from '../../shared/agent-feed-merge.js';
import { DAGScheduler, ExecutionControl, SchedulerError } from './dag-scheduler.js';
import { stepResultDisplayOutput } from './tool-runner.js';
import { loadPipelines, savePipelines, loadProfile } from './store.js';
import { broadcast } from '../ws.js';
import { executePostActionsForRun } from './post-action-executor.js';

export interface TriggerResult {
  runId: string;
  success: boolean;
  error?: string;
}

/**
 * Run a pipeline triggered by a schedule, webhook, or other automated source.
 * Returns when the pipeline completes.
 */
export async function runPipelineForTrigger(
  pipeline: Pipeline,
  source: 'schedule' | 'webhook' | 'manual'
): Promise<TriggerResult> {
  const scheduler = new DAGScheduler();
  const control = new ExecutionControl();
  const profile = loadProfile();
  const startTime = Date.now();

  const runRecord: PipelineRunRecord = {
    id: uuidv4(),
    startedAt: new Date().toISOString(),
    status: 'running',
    stageRuns: pipeline.stages.map((stage): StageRunRecord => ({
      id: uuidv4(),
      stageID: stage.id,
      stageName: stage.name,
      stepRuns: stage.steps.map((step): StepRunRecord => ({
        id: uuidv4(),
        stepID: step.id,
        stepName: step.name,
        status: 'pending',
      })),
    })),
  };

  broadcast({
    type: 'pipeline_run_started',
    payload: { pipelineID: pipeline.id, runID: runRecord.id, source },
  });

  let finalStatus: PipelineRunStatus = 'completed';
  let finalError: string | undefined;

  try {
    const results = await scheduler.executePipeline(
      pipeline,
      profile,
      control,
      (stepID, status) => {
        broadcast({
          type: 'step_status_changed',
          payload: { pipelineID: pipeline.id, stepID, status },
        });
        updateRunRecordStep(runRecord, stepID, status);
      },
      (stepID, output) => {
        appendRunRecordStepRawOutput(runRecord, stepID, output);
        broadcast({
          type: 'step_output',
          payload: { pipelineID: pipeline.id, stepID, output },
        });
      },
      (stepID, event: AgentStreamUiEvent) => {
        appendRunRecordStepAgentEvent(runRecord, stepID, event);
        broadcast({
          type: 'agent_stream_event',
          payload: { pipelineID: pipeline.id, stepID, event, source },
        });
      },
      (stepID, retryRecords, failedAttempt, maxAttempts) => {
        broadcast({
          type: 'step_retry',
          payload: { pipelineID: pipeline.id, stepID, retryRecords, failedAttempt, maxAttempts },
        });
      }
    );

    for (const result of results) {
      updateRunRecordStepOutput(runRecord, result.stepID, stepResultDisplayOutput(result));
      ensureRunRecordRawOutput(runRecord, result.stepID, stepResultDisplayOutput(result));
    }
  } catch (err) {
    if (err instanceof SchedulerError) {
      finalStatus = err.code === 'CANCELLED' ? 'cancelled' : 'failed';
      finalError = err.message;
      if (err.failedResult) {
        updateRunRecordStepOutput(runRecord, err.failedResult.stepID, stepResultDisplayOutput(err.failedResult));
        ensureRunRecordRawOutput(runRecord, err.failedResult.stepID, stepResultDisplayOutput(err.failedResult));
      }
    } else {
      finalStatus = 'failed';
      finalError = (err as Error).message;
    }
  }

  runRecord.status = finalStatus;
  runRecord.endedAt = new Date().toISOString();
  runRecord.errorMessage = finalError;
  runRecord.durationMs = Date.now() - startTime;

  // Persist run history
  const pipelines = loadPipelines();
  const idx = pipelines.findIndex((p) => p.id === pipeline.id);
  if (idx !== -1) {
    pipelines[idx].runHistory.push(runRecord);
    if (pipelines[idx].runHistory.length > 10) {
      pipelines[idx].runHistory = pipelines[idx].runHistory.slice(-10);
    }
    savePipelines(pipelines);
  }

  broadcast({
    type: 'pipeline_run_finished',
    payload: { pipelineID: pipeline.id, runID: runRecord.id, status: finalStatus, error: finalError },
  });

  // Trigger post-actions
  executePostActionsForRun(source, pipeline.id, runRecord).catch(() => {});

  return {
    runId: runRecord.id,
    success: finalStatus === 'completed',
    error: finalError,
  };
}

function updateRunRecordStep(runRecord: PipelineRunRecord, stepID: string, status: StepStatus) {
  for (const sr of runRecord.stageRuns) {
    for (const stepRun of sr.stepRuns) {
      if (stepRun.stepID === stepID) {
        stepRun.status = status;
        if (status === 'running') stepRun.startedAt = new Date().toISOString();
        if (status === 'completed' || status === 'failed' || status === 'skipped') {
          stepRun.endedAt = new Date().toISOString();
        }
        return;
      }
    }
  }
}

function updateRunRecordStepOutput(runRecord: PipelineRunRecord, stepID: string, output: string) {
  for (const sr of runRecord.stageRuns) {
    for (const stepRun of sr.stepRuns) {
      if (stepRun.stepID === stepID) {
        stepRun.output = output;
        return;
      }
    }
  }
}

function appendRunRecordStepRawOutput(runRecord: PipelineRunRecord, stepID: string, chunk: string) {
  if (!chunk) return;
  for (const sr of runRecord.stageRuns) {
    for (const stepRun of sr.stepRuns) {
      if (stepRun.stepID === stepID) {
        stepRun.rawOutput = (stepRun.rawOutput ?? '') + chunk;
        return;
      }
    }
  }
}

function ensureRunRecordRawOutput(runRecord: PipelineRunRecord, stepID: string, output: string) {
  if (!output.trim()) return;
  for (const sr of runRecord.stageRuns) {
    for (const stepRun of sr.stepRuns) {
      if (stepRun.stepID === stepID) {
        if (!stepRun.rawOutput?.trim()) stepRun.rawOutput = output;
        return;
      }
    }
  }
}

function appendRunRecordStepAgentEvent(runRecord: PipelineRunRecord, stepID: string, event: AgentStreamUiEvent) {
  for (const sr of runRecord.stageRuns) {
    for (const stepRun of sr.stepRuns) {
      if (stepRun.stepID === stepID) {
        const prev = stepRun.agentFeed ?? ([] as AgentFeedItem[]);
        stepRun.agentFeed = applyAgentStreamEvent(prev, event);
        return;
      }
    }
  }
}
