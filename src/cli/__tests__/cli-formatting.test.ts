import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('cli formatting', () => {
  it('includes every resource command in root help', () => {
    const home = makeTempHome();

    const result = runCli(['--help'], home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('webhook      inspect and trigger webhooks');
    expect(result.stdout).toContain('schedule     inspect and run schedules');
    expect(result.stdout).toContain('template     manage reusable pipeline templates');
    expect(result.stdout).toContain('post-action  inspect post-action automations');
    expect(result.stderr).toBe('');
  }, 15_000);

  it('lists schedules from the home directory', () => {
    const home = makeTempHome();
    writeJson(path.join(home, '.agentcadence', 'schedules.json'), [schedule('sched-1', 'Nightly', 'pipe-1')]);

    const result = runCli(['schedule', 'list'], home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Nightly');
    expect(result.stdout).toContain('0 0 * * *');
    expect(result.stderr).toBe('');
  }, 15_000);

  it('returns schedule detail via --json', () => {
    const home = makeTempHome();
    writeJson(path.join(home, '.agentcadence', 'schedules.json'), [schedule('sched-1', 'Nightly', 'pipe-1')]);

    const result = runCli(['schedule', 'get', 'Nightly', '--json'], home);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const parsed = JSON.parse(result.stdout);
    expect(parsed.id).toBe('sched-1');
    expect(parsed.pipeline_id).toBe('pipe-1');
  }, 15_000);

  it('reports missing schedules as a hard error', () => {
    const home = makeTempHome();
    const result = runCli(['schedule', 'get', 'missing'], home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Schedule "missing" not found.');
  }, 15_000);

  it('lists webhooks and supports --json get', () => {
    const home = makeTempHome();
    writeJson(path.join(home, '.agentcadence', 'webhooks.json'), [webhook('wh-1', 'Deploy Hook', 'pipe-1')]);

    const listResult = runCli(['webhook', 'list'], home);
    expect(listResult.status).toBe(0);
    expect(listResult.stdout).toContain('Deploy Hook');

    const getResult = runCli(['webhook', 'get', 'Deploy Hook', '--json'], home);
    expect(getResult.status).toBe(0);
    const parsed = JSON.parse(getResult.stdout);
    expect(parsed.id).toBe('wh-1');
  }, 15_000);

  it('lists and inspects post-actions', () => {
    const home = makeTempHome();
    writeJson(path.join(home, '.agentcadence', 'post-actions.json'), [postAction('pa-1', 'Notify Slack')]);
    writeJson(path.join(home, '.agentcadence', 'post-action-bindings.json'), [
      {
        id: 'pab-1',
        post_action_id: 'pa-1',
        trigger_type: 'webhook',
        trigger_id: 'wh-1',
        trigger_on: 'success',
        body_override: '',
        enabled: true,
        created_at: '2026-04-20T00:00:00.000Z',
      },
    ]);

    const listResult = runCli(['post-action', 'list'], home);
    expect(listResult.status).toBe(0);
    expect(listResult.stdout).toContain('Notify Slack');
    expect(listResult.stdout).toContain('POST');

    const detailResult = runCli(['post-action', 'get', 'Notify Slack'], home);
    expect(detailResult.status).toBe(0);
    expect(detailResult.stdout).toContain('Post-Action: Notify Slack');
    expect(detailResult.stdout).toContain('webhook/wh-1');
  }, 15_000);

  it('returns empty post-action runs gracefully', () => {
    const home = makeTempHome();
    writeJson(path.join(home, '.agentcadence', 'post-actions.json'), [postAction('pa-1', 'Notify Slack')]);

    const result = runCli(['post-action', 'runs', 'pa-1'], home);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No runs recorded for post-action "Notify Slack"');
  }, 15_000);

  it('renders the settings alias update with readable before/after output', () => {
    const home = makeTempHome();

    const result = runCli(['settings', 'set', 'stepTimeout', '2400'], home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Updated stepTimeout');
    expect(result.stdout).toContain('Before: 1800');
    expect(result.stdout).toContain('After:  2400');
    expect(result.stderr).toBe('');
  }, 15_000);

  it('reports ambiguous pipeline selectors as a hard error', () => {
    const home = makeTempHome();
    writeJson(path.join(home, '.agentcadence', 'pipelines.json'), [
      pipeline('pipe-a', 'Demo'),
      pipeline('pipe-b', 'Demo'),
    ]);

    const result = runCli(['pipeline', 'get', 'Demo'], home);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Pipeline selector "Demo" is ambiguous; use an id instead.');
  }, 15_000);

  it('emits a run_started jsonl line for pipeline runs', () => {
    const home = makeTempHome();
    writeJson(path.join(home, '.agentcadence', 'pipelines.json'), [
      pipelineWithShellStep('pipe-1', 'Demo', home),
    ]);

    const result = runCli(['pipeline', 'run', 'pipe-1', '--jsonl'], home);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    const runStartedLine = lines.find((line) => line.includes('"type":"run_started"'));
    expect(runStartedLine).toBeTruthy();
    expect(runStartedLine).toContain('"runId":"');
    expect(runStartedLine).toContain('"pipelineId":"pipe-1"');
    expect(runStartedLine).toContain('"status":"running"');
  }, 15_000);

  it('renders a transcript-style header and summary for human pipeline runs', () => {
    const home = makeTempHome();
    writeJson(path.join(home, '.agentcadence', 'pipelines.json'), [
      pipelineWithShellStep('pipe-1', 'Demo', home),
    ]);

    const result = runCli(['pipeline', 'run', 'pipe-1'], home);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('AgentCadence · Demo');
    expect(result.stdout).toContain('Pipeline:   Demo (pipe-1)');
    expect(result.stdout).toContain('▸ Stage: Run');
    expect(result.stdout).toMatch(/Steps: \d+\/\d+ completed/);
    expect(result.stdout).toContain('History: agentcadence history show');
  }, 20_000);

  it('exports and imports template markdown through CLI commands', () => {
    const home = makeTempHome();
    const templatePath = path.join(home, '.agentcadence', 'templates.json');
    writeJson(templatePath, [
      {
        id: 'tmpl-1',
        name: 'Base Template',
        description: 'Template for export/import',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
        stages: [
          {
            id: 'stage-1',
            name: 'Build',
            executionMode: 'sequential',
            steps: [
              {
                id: 'step-1',
                name: 'Compile',
                prompt: 'Compile project',
                tool: 'codex',
                dependsOnStepIDs: [],
                failureMode: 'retry',
                retryCount: 3,
                reviewMode: 'auto',
                status: 'pending',
              },
            ],
          },
        ],
      },
    ]);

    const markdownPath = path.join(home, 'template.md');
    const exportResult = runCli(['template', 'export-md', 'tmpl-1', '--output', markdownPath], home);
    expect(exportResult.status).toBe(0);
    expect(exportResult.stderr).toBe('');
    const markdown = readFileSync(markdownPath, 'utf8');
    expect(markdown).toContain('# Base Template');

    const importResult = runCli(['template', 'import-md', markdownPath, '--json'], home);
    expect(importResult.status).toBe(0);
    expect(importResult.stderr).toBe('');
    expect(importResult.stdout).toContain('"name": "Base Template"');
  }, 15_000);
});

function runCli(args: string[], home: string) {
  return spawnSync('npm', ['run', '--silent', 'cli', '--', ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
    },
    encoding: 'utf8',
  });
}

function makeTempHome(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentcadence-cli-'));
  tempRoots.push(dir);
  mkdirSync(path.join(dir, '.agentcadence'), { recursive: true });
  return dir;
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function pipeline(id: string, name: string) {
  return {
    id,
    name,
    stages: [],
    workingDirectory: '/tmp/demo',
    isAIGenerated: false,
    createdAt: '2026-04-15T00:00:00.000Z',
    runHistory: [],
  };
}

function schedule(id: string, name: string, pipelineId: string) {
  return {
    id,
    name,
    pipeline_id: pipelineId,
    prompt_override: '',
    cron_expression: '0 0 * * *',
    timezone: 'UTC',
    enabled: true,
    last_run_at: null,
    next_run_at: null,
    status: 'idle',
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z',
  };
}

function webhook(id: string, name: string, pipelineId: string) {
  return {
    id,
    name,
    pipeline_id: pipelineId,
    prompt_template: '',
    token: 'test-token',
    enabled: true,
    timeout_seconds: 30,
    max_concurrent: 1,
    last_triggered_at: null,
    status: 'idle',
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z',
  };
}

function postAction(id: string, name: string) {
  return {
    id,
    name,
    description: `${name} description`,
    method: 'POST',
    url: 'https://example.com/hook',
    headers: {},
    body_template: '{}',
    auth_type: 'none',
    auth_config: {},
    timeout_seconds: 30,
    retry_count: 0,
    enabled: true,
    created_at: '2026-04-20T00:00:00.000Z',
  };
}

function pipelineWithShellStep(id: string, name: string, workingDirectory: string) {
  return {
    id,
    name,
    stages: [
      {
        id: 'stage-1',
        name: 'Run',
        executionMode: 'sequential',
        steps: [
          {
            id: 'step-1',
            name: 'Echo',
            command: 'echo AC_JSONL_RUN_STARTED',
            prompt: 'Emit a simple line',
            tool: 'codex',
            dependsOnStepIDs: [],
            failureMode: 'stop',
            retryCount: 1,
            reviewMode: 'auto',
            status: 'pending',
          },
        ],
      },
    ],
    workingDirectory,
    isAIGenerated: false,
    createdAt: '2026-04-15T00:00:00.000Z',
    runHistory: [],
  };
}
