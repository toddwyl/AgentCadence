import { Router, type Request, type Response } from 'express';
import {
  getActiveExecutionRuns,
  startManualPipelineRun,
  stopManualPipelineRun,
  stopManualPipelineStage,
} from '../services/app/execution-service.js';

const router = Router();

router.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as { cols?: number; rows?: number };
    const result = startManualPipelineRun(req.params.id, { cols: body.cols, rows: body.rows });
    res.json(result);
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Pipeline not found') {
      res.status(404).json({ error: message });
      return;
    }
    if (message === 'Pipeline is already running') {
      res.status(409).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

router.post('/:id/stop', (req: Request, res: Response) => {
  if (!stopManualPipelineRun(req.params.id)) {
    res.status(404).json({ error: 'No active run' });
    return;
  }
  res.json({ ok: true });
});

router.post('/:id/stop-stage/:stageId', (req: Request, res: Response) => {
  if (!stopManualPipelineStage(req.params.id, req.params.stageId)) {
    res.status(404).json({ error: 'No active run' });
    return;
  }
  res.json({ ok: true });
});

router.get('/active', (_req: Request, res: Response) => {
  res.json({ runs: getActiveExecutionRuns() });
});

export default router;
