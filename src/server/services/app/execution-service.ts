import { v4 as uuidv4 } from 'uuid';
import type {
  AgentFeedItem,
  AgentStreamUiEvent,
  ActiveExecutionRunPayload,
  PipelineRunRecord,
  PipelineRunStatus,
  RetryRecord,
  StageRunRecord,
  StepRunRecord,
  StepStatus,
  TriggerType,
} from '../../../domain/run.js';
import type { Pipeline } from '../../../domain/pipeline.js';
import { applyAgentStreamEvent } from '../../../presentation/transcript/agent-feed-merge.js';
import { DAGScheduler, ExecutionControl, SchedulerError } from '../dag-scheduler.js';
import { stepResultDisplayOutput } from '../tool-runner.js';
import { loadPipelines, loadProfile, savePipelines } from '../store.js';
import { broadcast, cancelPendingReviewsForPipeline, requestStepReview } from '../../ws.js';
import {
  appendAgentStreamEvent,
  appendStepOutput,
  clearLiveRun,
  getActiveRunSnapshots,
  initLiveRun,
  setStepRetry,
  setStepStatus,
} from '../live-run-buffer.js';
import { executePostActionsForRun } from '../post-action-executor.js';

export interface TriggerResult {
  runId: string;
  success: boolean;
  error?: string;
}

const activePipelines = new Map<string, ExecutionControl>();

export function getActiveExecutionRuns(): ActiveExecutionRunPayload[] {
  return getActiveRunSnapshots();
}

export function startManualPipelineRun(
  pipelineId: string,
  ptyOpts?: { cols?: number; rows?: number }
): { status: 'started'; runId: string } {
  const pipelines = loadPipelines();
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) {
    throw new Error('Pipeline not found');
  }
  if (activePipelines.has(pipeline.id)) {
    throw new Error('Pipeline is already running');
  }

  const runId = uuidv4();
  void executePipelineRun({
    pipeline,
    runId,
    triggerType: 'manual',
    trackLiveRun: true,
    enableReviews: true,
    ptyOpts,
    registerActiveControl: true,
  });
  return { status: 'started', runId };
}

export function stopManualPipelineRun(pipelineId: string): boolean {
  const control = activePipelines.get(pipelineId);
  if (!control) return false;
  control.requestPipelineStop();
  cancelPendingReviewsForPipeline(pipelineId);
  return true;
}

export function stopManualPipelineStage(pipelineId: string, stageId: string): boolean {
  const control = activePipelines.get(pipelineId);
  if (!control) return false;
  control.requestStageStop(stageId);
  return true;
}

export async function runPipelineForTrigger(
  pipeline: Pipeline,
  triggerType: 'schedule' | 'webhook' | 'manual'
): Promise<TriggerResult> {
  return executePipelineRun({
    pipeline,
    runId: uuidv4(),
    triggerType,
    trackLiveRun: false,
    enableReviews: false,
    registerActiveControl: false,
  });
}

type ExecutePipelineRunOptions = {
  pipeline: Pipeline;
  runId: string;
  triggerType: TriggerType;
  trackLiveRun: boolean;
  enableReviews: boolean;
  registerActiveControl: boolean;
  ptyOpts?: { cols?: number; rows?: number };
};

async function executePipelineRun(options: ExecutePipelineRunOptions): Promise<TriggerResult> {
  const {
    pipeline,
    runId,
    triggerType,
    trackLiveRun,
    enableReviews,
    registerActiveControl,
    ptyOpts,
  } = options;

  const scheduler = new DAGScheduler();
  const control = new ExecutionControl();
  control.setPtyDimensions(ptyOpts?.cols, ptyOpts?.rows);
  const profile = loadProfile();
  const startTime = Date.now();

  if (registerActiveControl) {
    activePipelines.set(pipeline.id, control);
  }

  const runRecord: PipelineRunRecord = {
    id: runId,
    startedAt: new Date().toISOString(),
    status: 'running',
    triggerType,
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

  if (trackLiveRun) {
    initLiveRun(pipeline, runId, triggerType);
  }

  broadcast({
    type: 'pipeline_run_started',
    payload: { pipelineID: pipeline.id, runID: runId, source: triggerType },
  });

  let finalStatus: PipelineRunStatus = 'completed';
  let finalError: string | undefined;

  try {
    const results = await scheduler.executePipeline(
      pipeline,
      profile,
      control,
      (stepID, status) => {
        if (trackLiveRun) setStepStatus(pipeline.id, stepID, status);
        broadcast({
          type: 'step_status_changed',
          payload: { pipelineID: pipeline.id, stepID, status },
        });
        updateRunRecordStep(runRecord, stepID, status);
      },
      (stepID, output) => {
        appendRunRecordStepRawOutput(runRecord, stepID, output);
        if (trackLiveRun) appendStepOutput(pipeline.id, stepID, output);
        broadcast({
          type: 'step_output',
          payload: { pipelineID: pipeline.id, stepID, output },
        });
      },
      (stepID, event) => {
        appendRunRecordStepAgentEvent(runRecord, stepID, event);
        if (trackLiveRun) appendAgentStreamEvent(pipeline.id, stepID, event);
        broadcast({
          type: 'agent_stream_event',
          payload: { pipelineID: pipeline.id, stepID, event, source: triggerType },
        });
      },
      (stepID, retryRecords, failedAttempt, maxAttempts) => {
        updateRunRecordRetry(runRecord, stepID, retryRecords, undefined, maxAttempts);
        if (trackLiveRun) {
          setStepRetry(pipeline.id, stepID, retryRecords, failedAttempt, maxAttempts);
        }
        broadcast({
          type: 'step_retry',
          payload: {
            pipelineID: pipeline.id,
            stepID,
            retryRecords,
            failedAttempt,
            maxAttempts,
          },
        });
      },
      enableReviews
        ? async (stepID, workingDirectory, changedFiles) => {
            updateRunRecordStepReview(runRecord, stepID, changedFiles);
            return requestStepReview(pipeline.id, stepID, workingDirectory, changedFiles);
          }
        : undefined
    );

    for (const result of results) {
      if (result.retryRecords || result.totalAttempts) {
        updateRunRecordRetry(runRecord, result.stepID, result.retryRecords, result.totalAttempts);
      }
      if (result.reviewResult) {
        updateRunRecordStepReview(runRecord, result.stepID, [], result.reviewResult);
      }
      updateRunRecordStepOutput(runRecord, result.stepID, stepResultDisplayOutput(result));
      ensureRunRecordRawOutput(runRecord, result.stepID, stepResultDisplayOutput(result));
    }
  } catch (err) {
    if (err instanceof SchedulerError) {
      finalStatus = err.code === 'CANCELLED' ? 'cancelled' : 'failed';
      finalError = err.message;
      if (err.failedResult?.retryRecords || err.failedResult?.totalAttempts) {
        updateRunRecordRetry(runRecord, err.failedResult.stepID, err.failedResult.retryRecords, err.failedResult.totalAttempts);
      }
      if (err.failedResult) {
        updateRunRecordStepOutput(runRecord, err.failedResult.stepID, stepResultDisplayOutput(err.failedResult));
        ensureRunRecordRawOutput(runRecord, err.failedResult.stepID, stepResultDisplayOutput(err.failedResult));
      }
    } else {
      finalStatus = 'failed';
      finalError = (err as Error).message;
    }
  } finally {
    if (registerActiveControl) {
      activePipelines.delete(pipeline.id);
    }
    if (trackLiveRun) {
      clearLiveRun(pipeline.id);
    }
  }

  runRecord.status = finalStatus;
  runRecord.endedAt = new Date().toISOString();
  runRecord.errorMessage = finalError;
  runRecord.durationMs = Date.now() - startTime;

  persistPipelineRunHistory(pipeline.id, runRecord);

  broadcast({
    type: 'pipeline_run_finished',
    payload: { pipelineID: pipeline.id, runID: runId, status: finalStatus, error: finalError },
  });

  executePostActionsForRun(triggerType, pipeline.id, runRecord).catch(() => {});

  return {
    runId,
    success: finalStatus === 'completed',
    error: finalError,
  };
}

function persistPipelineRunHistory(pipelineId: string, runRecord: PipelineRunRecord) {
  const pipelines = loadPipelines();
  const idx = pipelines.findIndex((p) => p.id === pipelineId);
  if (idx === -1) return;
  pipelines[idx].runHistory.push(runRecord);
  if (pipelines[idx].runHistory.length > 10) {
    pipelines[idx].runHistory = pipelines[idx].runHistory.slice(-10);
  }
  savePipelines(pipelines);
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

function updateRunRecordRetry(
  runRecord: PipelineRunRecord,
  stepID: string,
  retryRecords: RetryRecord[] | undefined,
  totalAttempts?: number,
  maxAttempts?: number
) {
  for (const sr of runRecord.stageRuns) {
    for (const stepRun of sr.stepRuns) {
      if (stepRun.stepID === stepID) {
        if (retryRecords) stepRun.retryRecords = retryRecords;
        if (totalAttempts !== undefined) stepRun.totalAttempts = totalAttempts;
        if (maxAttempts !== undefined) stepRun.maxAttempts = maxAttempts;
        return;
      }
    }
  }
}

function updateRunRecordStepReview(
  runRecord: PipelineRunRecord,
  stepID: string,
  changedFiles: string[],
  reviewResult?: 'accepted' | 'rejected'
) {
  for (const sr of runRecord.stageRuns) {
    for (const stepRun of sr.stepRuns) {
      if (stepRun.stepID === stepID) {
        if (changedFiles.length > 0) stepRun.changedFiles = changedFiles;
        if (reviewResult) stepRun.reviewResult = reviewResult;
        return;
      }
    }
  }
}
