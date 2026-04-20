import { Router, type Request, type Response } from 'express';
import { getHistoryRun, getHistoryRunStep, listHistoryRuns } from '../services/app/history-service.js';
import type { PipelineRunStatus } from '../../domain/run.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const status = req.query.status;
  const pipelineId = req.query.pipelineId;
  res.json(listHistoryRuns({
    status: typeof status === 'string' ? (status as PipelineRunStatus) : undefined,
    pipelineId: typeof pipelineId === 'string' ? pipelineId : undefined,
  }));
});

router.get('/:runId', (req: Request, res: Response) => {
  const detail = getHistoryRun(req.params.runId);
  if (!detail) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  res.json(detail);
});

router.get('/:runId/steps/:stepId', (req: Request, res: Response) => {
  const step = getHistoryRunStep(req.params.runId, req.params.stepId);
  if (!step) {
    res.status(404).json({ error: 'Step not found' });
    return;
  }
  res.json(step);
});

export default router;
