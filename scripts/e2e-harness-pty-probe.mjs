#!/usr/bin/env node
/**
 * Mandatory PTY gate: same CLIRunner.runPTY paths the server uses (no HTTP).
 * Run from repo root after `npm run build:server` (imports dist).
 */
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const { CLIRunner } = await import('../dist/server/services/cli-runner.js');
const cli = new CLIRunner();
const cwd = process.cwd();
const timeout = 15;

async function mustPTY(label, fn) {
  try {
    const r = await fn();
    if (r.exitCode !== 0) {
      console.error(JSON.stringify({ ok: false, label, exitCode: r.exitCode, stdout: r.stdout?.slice?.(0, 200) }));
      process.exit(1);
    }
    return r.stdout;
  } catch (e) {
    console.error(JSON.stringify({ ok: false, label, error: (e && e.message) || String(e) }));
    process.exit(1);
  }
}

// CommandRunner path: zsh -lc (custom commands that go through profile CLIs also wrap this way)
const out1 = await mustPTY('zsh_lc', () =>
  cli.runPTY({ command: 'zsh', args: ['-lc', 'echo AC_HARNESS_PTY_ZSH'], cwd, timeout })
);
if (!String(out1).includes('AC_HARNESS_PTY_ZSH')) {
  console.error(JSON.stringify({ ok: false, label: 'zsh_lc_output', stdout: out1 }));
  process.exit(1);
}

// Tool-runner style: argv list to a real binary (same spawn shape as cursor-agent)
const out2 = await mustPTY('direct_argv', () =>
  cli.runPTY({ command: '/bin/echo', args: ['AC_HARNESS_PTY_DIRECT'], cwd, timeout })
);
if (!String(out2).includes('AC_HARNESS_PTY_DIRECT')) {
  console.error(JSON.stringify({ ok: false, label: 'direct_argv_output', stdout: out2 }));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, probes: ['zsh_lc', 'direct_argv'] }));
