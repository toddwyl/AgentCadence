import { Router, type Request, type Response } from 'express';
import {
  loadProfile,
  saveProfile,
  loadLLMConfig,
  saveLLMConfig,
  loadNotificationSettings,
  saveNotificationSettings,
  getProfileForToggle,
} from '../services/store.js';
import { CLIRunner } from '../services/cli-runner.js';
import type { DetectionResult, CLIProfile } from '../../shared/types.js';
import { DEFAULT_CLI_PROFILE, INTERNAL_CLI_PROFILE } from '../../shared/types.js';

const router = Router();

router.get('/profile', (_req: Request, res: Response) => {
  res.json(loadProfile());
});

router.put('/profile', (req: Request, res: Response) => {
  const { useInternal } = req.body as { useInternal?: boolean };
  if (useInternal !== undefined) {
    const profile = getProfileForToggle(useInternal);
    saveProfile(profile);
    res.json(profile);
  } else {
    const profile = req.body as CLIProfile;
    saveProfile(profile);
    res.json(profile);
  }
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
  const profile = loadProfile();
  const useInternal = profile.id === 'internal';
  const executables = useInternal
    ? ['cursor-agent', 'codex-internal', 'claude-internal']
    : ['cursor-agent', 'codex', 'claude'];

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
