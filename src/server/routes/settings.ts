import { Router, type Request, type Response } from 'express';
import {
  loadProfile,
  saveProfile,
  loadLLMConfig,
  saveLLMConfig,
  loadNotificationSettings,
  saveNotificationSettings,
} from '../services/store.js';
import { CLIRunner } from '../services/cli-runner.js';
import { detectCliEnvironmentPaths } from '../services/cli-environment-detect.js';
import type { CLIProfile } from '../../shared/types.js';

const router = Router();

router.get('/profile', (_req: Request, res: Response) => {
  res.json(loadProfile());
});

router.put('/profile', (req: Request, res: Response) => {
  const profile = req.body as CLIProfile;
  saveProfile(profile);
  res.json(profile);
});

router.get('/llm-config', (_req: Request, res: Response) => {
  res.json(loadLLMConfig());
});

router.put('/llm-config', (req: Request, res: Response) => {
  saveLLMConfig(req.body);
  res.json(req.body);
});

router.get('/notification-settings', (_req: Request, res: Response) => {
  res.json(loadNotificationSettings());
});

router.put('/notification-settings', (req: Request, res: Response) => {
  saveNotificationSettings(req.body);
  res.json(req.body);
});

router.get('/detect', async (_req: Request, res: Response) => {
  const cli = new CLIRunner();
  const results = await detectCliEnvironmentPaths(cli);
  res.json(results);
});

export default router;
