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
import type { DetectionResult, CLIProfile } from '../../shared/types.js';

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
  const executables = ['cursor-agent', 'codex', 'claude'];

  const cli = new CLIRunner();
  const results: DetectionResult[] = [];

  for (const executable of executables) {
    try {
      const result = await cli.run({
        command: 'zsh',
        args: ['-lc', `command -v '${executable}' 2>/dev/null`],
        timeout: 10,
      });
      const lines = result.stdout.split('\n').map((l) => l.trim());
      const path = lines.reverse().find((l) => l.startsWith('/'));
      results.push({ executable, found: !!path, path: path || undefined });
    } catch {
      results.push({ executable, found: false });
    }
  }

  res.json(results);
});

export default router;
