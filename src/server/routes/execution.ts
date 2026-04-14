import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentFeedItem,
  AgentStreamUiEvent,
  PipelineRunRecord,
  StageRunRecord,
  StepRunRecord,
  StepStatus,
  PipelineRunStatus,
  Pipeline,
  RetryRecord,
} from '../../shared/types.js';
import { applyAgentStreamEvent } from '../../shared/agent-feed-merge.js';
import { DAGScheduler, ExecutionControl, SchedulerError } from '../services/dag-scheduler.js';
import { stepResultDisplayOutput } from '../services/tool-runner.js';
import { loadPipelines, savePipelines, loadProfile } from '../services/store.js';
import { broadcast, requestStepReview, cancelPendingReviewsForPipeline } from '../ws.js';
import {
  initLiveRun,
  clearLiveRun,
  appendStepOutput,
  appendAgentStreamEvent,
  setStepStatus,
  setStepRetry,
  getActiveRunSnapshots,
} from '../services/live-run-buffer.js';
import { executePostActionsForRun } from '../services/post-action-executor.js';

const router = Router();

const activePipelines = new Map<string, ExecutionControl>();

router.post('/:id/run', async (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const pipeline = pipelines.find((p) => p.id === req.params.id);
  if (!pipeline) { res.status(404).json({ error: 'Pipeline not found' }); return; }
  if (activePipelines.has(pipeline.id)) {
    res.status(409).json({ error: 'Pipeline is already running' }); return;
  }

  const body = (req.body || {}) as { cols?: number; rows?: number };
  res.json({ status: 'started' });
  runPipeline(pipeline, { cols: body.cols, rows: body.rows });
});

router.post('/:id/stop', (req: Request, res: Response) => {
  const control = activePipelines.get(req.params.id);
  if (!control) { res.status(404).json({ error: 'No active run' }); return; }
  control.requestPipelineStop();
  // Unblock any pending review promises so the pipeline can finish
  cancelPendingReviewsForPipeline(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/stop-stage/:stageId', (req: Request, res: Response) => {
  const control = activePipelines.get(req.params.id);
  if (!control) { res.status(404).json({ error: 'No active run' }); return; }
  control.requestStageStop(req.params.stageId);
  res.json({ ok: true });
});

router.get('/active', (_req: Request, res: Response) => {
  res.json({ runs: getActiveRunSnapshots() });
});

async function runPipeline(pipeline: Pipeline, ptyOpts?: { cols?: number; rows?: number }) {
  const scheduler = new DAGScheduler();
  const control = new ExecutionControl();
  control.setPtyDimensions(ptyOpts?.cols, ptyOpts?.rows);
  const profile = loadProfile();
  activePipelines.set(pipeline.id, control);

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

  initLiveRun(pipeline, runRecord.id);

  broadcast({
    type: 'pipeline_run_started',
    payload: { pipelineID: pipeline.id, runID: runRecord.id },
  });

  let finalStatus: PipelineRunStatus = 'completed';
  let finalError: string | undefined;

  try {
    const results = await scheduler.executePipeline(
      pipeline,
      profile,
      control,
      (stepID, status) => {
        setStepStatus(pipeline.id, stepID, status);
        broadcast({
          type: 'step_status_changed',
          payload: { pipelineID: pipeline.id, stepID, status },
        });
        updateRunRecordStep(runRecord, stepID, status);
      },
      (stepID, output) => {
        appendRunRecordStepRawOutput(runRecord, stepID, output);
        appendStepOutput(pipeline.id, stepID, output);
        broadcast({
          type: 'step_output',
          payload: { pipelineID: pipeline.id, stepID, output },
        });
      },
      (stepID, event) => {
        appendRunRecordStepAgentEvent(runRecord, stepID, event);
        appendAgentStreamEvent(pipeline.id, stepID, event);
        broadcast({
          type: 'agent_stream_event',
          payload: { pipelineID: pipeline.id, stepID, event },
        });
      },
      (stepID, retryRecords, failedAttempt, maxAttempts) => {
        updateRunRecordRetry(runRecord, stepID, retryRecords, undefined, maxAttempts);
        setStepRetry(pipeline.id, stepID, retryRecords, failedAttempt, maxAttempts);
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
      async (stepID, workingDirectory, changedFiles) => {
        updateRunRecordStepReview(runRecord, stepID, changedFiles);
        return requestStepReview(pipeline.id, stepID, workingDirectory, changedFiles);
      }
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
  }

  runRecord.status = finalStatus;
  runRecord.endedAt = new Date().toISOString();
  runRecord.errorMessage = finalError;
  runRecord.durationMs = Date.now() - startTime;

  const pipelines = loadPipelines();
  const idx = pipelines.findIndex((p) => p.id === pipeline.id);
  if (idx !== -1) {
    pipelines[idx].runHistory.push(runRecord);
    if (pipelines[idx].runHistory.length > 10) {
      pipelines[idx].runHistory = pipelines[idx].runHistory.slice(-10);
    }
    savePipelines(pipelines);
  }

  activePipelines.delete(pipeline.id);
  clearLiveRun(pipeline.id);
  broadcast({
    type: 'pipeline_run_finished',
    payload: { pipelineID: pipeline.id, runID: runRecord.id, status: finalStatus, error: finalError },
  });

  // Trigger post-actions for manual runs
  executePostActionsForRun('manual', pipeline.id, runRecord).catch(() => {});
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
  retryRecords?: RetryRecord[],
  totalAttempts?: number,
  maxAttemptsHint?: number
) {
  for (const sr of runRecord.stageRuns) {
    for (const stepRun of sr.stepRuns) {
      if (stepRun.stepID === stepID) {
        if (retryRecords !== undefined) stepRun.retryRecords = retryRecords;
        if (totalAttempts !== undefined) stepRun.totalAttempts = totalAttempts;
        if (maxAttemptsHint !== undefined) stepRun.maxAttempts = maxAttemptsHint;
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
        stepRun.changedFiles = changedFiles;
        if (reviewResult) stepRun.reviewResult = reviewResult;
        return;
      }
    }
  }
}

export default router;
