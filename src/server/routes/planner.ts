import { Router, type Request, type Response } from 'express';
import type { GeneratePipelineRequest } from '../../shared/types.js';
import { TOOL_TYPES } from '../../shared/types.js';
import { AIPlanner } from '../services/ai-planner.js';
import { loadPipelines, savePipelines, loadProfile, loadLLMConfig } from '../services/store.js';
import { broadcast } from '../ws.js';

const router = Router();

router.post('/generate', async (req: Request, res: Response) => {
  const { userPrompt, workingDirectory, llmConfig } = req.body as GeneratePipelineRequest;
  if (!userPrompt || !workingDirectory) {
    res.status(400).json({ error: 'userPrompt and workingDirectory are required' });
    return;
  }

  const config = llmConfig || loadLLMConfig();
  const profile = loadProfile();
  const planner = new AIPlanner();

  res.json({ status: 'generating' });

  try {
    const pipeline = await planner.generatePipeline(
      { userPrompt, workingDirectory, availableTools: TOOL_TYPES },
      config,
      profile,
      (phase) => {
        broadcast({ type: 'planning_phase', payload: { phase } });
      },
      (chunk) => {
        broadcast({ type: 'planning_log', payload: { chunk } });
      }
    );

    const pipelines = loadPipelines();
    pipelines.push(pipeline);
    savePipelines(pipelines);

    broadcast({ type: 'planning_complete', payload: { pipeline } });
  } catch (err) {
    broadcast({
      type: 'planning_error',
      payload: { error: (err as Error).message },
    });
  }
});

export default router;
