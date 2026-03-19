import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type {
  PipelineRunRecord,
  StageRunRecord,
  StepRunRecord,
  StepStatus,
  PipelineRunStatus,
  Pipeline,
  RetryRecord,
} from '../../shared/types.js';
import { DAGScheduler, ExecutionControl, SchedulerError } from '../services/dag-scheduler.js';
import { loadPipelines, savePipelines, loadProfile } from '../services/store.js';
import { broadcast } from '../ws.js';

const router = Router();

const activePipelines = new Map<string, ExecutionControl>();

router.post('/:id/run', async (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const pipeline = pipelines.find((p) => p.id === req.params.id);
  if (!pipeline) { res.status(404).json({ error: 'Pipeline not found' }); return; }
  if (activePipelines.has(pipeline.id)) {
    res.status(409).json({ error: 'Pipeline is already running' }); return;
  }

  res.json({ status: 'started' });
  runPipeline(pipeline);
});

router.post('/:id/stop', (req: Request, res: Response) => {
  const control = activePipelines.get(req.params.id);
  if (!control) { res.status(404).json({ error: 'No active run' }); return; }
  control.requestPipelineStop();
  res.json({ ok: true });
});

router.post('/:id/stop-stage/:stageId', (req: Request, res: Response) => {
  const control = activePipelines.get(req.params.id);
  if (!control) { res.status(404).json({ error: 'No active run' }); return; }
  control.requestStageStop(req.params.stageId);
  res.json({ ok: true });
});

async function runPipeline(pipeline: Pipeline) {
  const scheduler = new DAGScheduler();
  const control = new ExecutionControl();
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
        broadcast({
          type: 'step_status_changed',
          payload: { pipelineID: pipeline.id, stepID, status },
        });
        updateRunRecordStep(runRecord, stepID, status);
      },
      (stepID, output) => {
        broadcast({
          type: 'step_output',
          payload: { pipelineID: pipeline.id, stepID, output },
        });
      }
    );

    for (const result of results) {
      if (result.retryRecords || result.totalAttempts) {
        updateRunRecordRetry(runRecord, result.stepID, result.retryRecords, result.totalAttempts);
      }
    }
  } catch (err) {
    if (err instanceof SchedulerError) {
      finalStatus = err.code === 'CANCELLED' ? 'cancelled' : 'failed';
      finalError = err.message;
      if (err.failedResult?.retryRecords || err.failedResult?.totalAttempts) {
        updateRunRecordRetry(runRecord, err.failedResult.stepID, err.failedResult.retryRecords, err.failedResult.totalAttempts);
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
  broadcast({
    type: 'pipeline_run_finished',
    payload: { pipelineID: pipeline.id, runID: runRecord.id, status: finalStatus, error: finalError },
  });
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
  totalAttempts?: number
) {
  for (const sr of runRecord.stageRuns) {
    for (const stepRun of sr.stepRuns) {
      if (stepRun.stepID === stepID) {
        stepRun.retryRecords = retryRecords;
        stepRun.totalAttempts = totalAttempts;
        return;
      }
    }
  }
}

export default router;
