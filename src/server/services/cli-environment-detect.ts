import type { DetectionResult } from '../../shared/types.js';
import type { CLIRunner } from './cli-runner.js';

const EXECUTABLES = ['cursor-agent', 'codex', 'claude'] as const;

/** Same resolution as settings GET /detect: login-shell PATH via zsh -lc. */
export async function detectCliEnvironmentPaths(cli: CLIRunner): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];
  for (const executable of EXECUTABLES) {
    try {
      const result = await cli.run({
        command: 'zsh',
        args: ['-lc', `command -v '${executable}' 2>/dev/null`],
        timeout: 10,
      });
      const lines = result.stdout.split('\n').map((l) => l.trim());
      const p = lines.reverse().find((l) => l.startsWith('/'));
      results.push({ executable, found: !!p, path: p || undefined });
    } catch {
      results.push({ executable, found: false });
    }
  }
  return results;
}
