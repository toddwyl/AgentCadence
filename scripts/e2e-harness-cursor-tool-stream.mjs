#!/usr/bin/env node
/**
 * Browser E2E: default Cursor tool path (no custom step.command) → tool-runner → runPTY(cursor executable, argv).
 * Patches settings profile to use harness-cursor-agent-stub.sh, then asserts multiple WebSocket step_output
 * frames before pipeline_run_finished (same streaming contract as the shell probe).
 *
 * Restores the previous CLI profile in a finally block.
 */
import { chromium } from 'playwright';
import { chmodSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const BASE = (argValue('--base') || process.env.AGENTCADENCE_BASE_URL || 'http://localhost:3712').replace(/\/$/, '');
const MIN_STEP_OUTPUT_FRAMES = Number(process.env.HARNESS_MIN_CURSOR_FRAMES || process.env.HARNESS_MIN_STEP_OUTPUTS || 3);
const STREAM_TIMEOUT_MS = Number(process.env.HARNESS_CURSOR_STREAM_TIMEOUT_MS || process.env.HARNESS_STREAM_TIMEOUT_MS || 25000);
const RUN_TIMEOUT_MS = Number(process.env.HARNESS_CURSOR_RUN_TIMEOUT_MS || process.env.HARNESS_RUN_TIMEOUT_MS || 120000);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(ROOT, 'scripts', 'harness-cursor-agent-stub.sh');

async function api(p, opts = {}) {
  return fetch(`${BASE}/api${p}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
}

async function seedCursorToolPipeline() {
  const health = await api('/pipelines');
  if (!health.ok) throw new Error(`Server not reachable at ${BASE} (GET /api/pipelines ${health.status})`);

  const home = await api('/fs/home').then((r) => r.json());
  const wd = home.path || process.cwd();

  const name = `HarnessCursorTool-${Date.now()}`;
  const create = await api('/pipelines', {
    method: 'POST',
    body: JSON.stringify({ name, workingDirectory: wd }),
  });
  if (!create.ok) throw new Error(`POST /pipelines ${create.status}`);
  const pipeline = await create.json();
  const pipelineId = pipeline.id;

  const stageRes = await api(`/pipelines/${pipelineId}/stages`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Harness', executionMode: 'sequential' }),
  });
  if (!stageRes.ok) throw new Error(`POST stages ${stageRes.status}`);
  const stage = await stageRes.json();

  // No `command` → stepHasCustomCommand false → cursorRunner → runPTY (not CommandRunner shell path).
  const stepRes = await api(`/pipelines/${pipelineId}/stages/${stage.id}/steps`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Cursor tool stream probe',
      prompt: 'harness noop prompt',
      tool: 'cursor',
      failureMode: 'stop',
      retryCount: 1,
    }),
  });
  if (!stepRes.ok) {
    const t = await stepRes.text();
    throw new Error(`POST steps ${stepRes.status} ${t}`);
  }

  return { pipelineId, name };
}

async function main() {
  if (!existsSync(STUB)) throw new Error(`Stub missing: ${STUB}`);
  chmodSync(STUB, 0o755);

  const stubAbs = path.resolve(STUB);
  const profRes = await api('/settings/profile');
  if (!profRes.ok) throw new Error(`GET /settings/profile ${profRes.status}`);
  const previousProfile = await profRes.json();
  const backup = structuredClone(previousProfile);

  await api('/settings/profile', {
    method: 'PUT',
    body: JSON.stringify({
      ...previousProfile,
      cursor: { ...previousProfile.cursor, executable: stubAbs },
    }),
  });

  let pipelineId;
  try {
    ({ pipelineId } = await seedCursorToolPipeline());

    let stepOutputFrames = 0;
    let runFinished = false;
    let runStatus = null;
    let lastStepOutputSnippet = '';

    const browser = await chromium.launch({
      headless: process.env.HARNESS_HEADED === '1' ? false : true,
    });

    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      page.on('websocket', (ws) => {
        const u = ws.url();
        if (!u.includes('/ws')) return;
        ws.on('framereceived', (event) => {
          let payload = event.payload;
          if (payload instanceof Buffer) payload = payload.toString('utf8');
          if (typeof payload !== 'string') return;
          let msg;
          try {
            msg = JSON.parse(payload);
          } catch {
            return;
          }
          if (msg.payload?.pipelineID !== pipelineId) return;
          if (msg.type === 'step_output') {
            stepOutputFrames += 1;
            const chunk = String(msg.payload.output || '');
            if (chunk) lastStepOutputSnippet = (lastStepOutputSnippet + chunk).slice(-500);
          }
          if (msg.type === 'pipeline_run_finished') {
            runFinished = true;
            runStatus = msg.payload.status;
          }
        });
      });

      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector(`[data-testid="pipeline-item-${pipelineId}"]`, { timeout: 30000 });
      await page.click(`[data-testid="pipeline-item-${pipelineId}"]`);
      await page.waitForSelector('[data-testid="header-run-pipeline"]:not([disabled])', { timeout: 15000 });
      await page.click('[data-testid="header-run-pipeline"]');

      const streamDeadline = Date.now() + STREAM_TIMEOUT_MS;
      while (Date.now() < streamDeadline) {
        if (stepOutputFrames >= MIN_STEP_OUTPUT_FRAMES) break;
        await page.waitForTimeout(120);
      }

      if (stepOutputFrames < MIN_STEP_OUTPUT_FRAMES) {
        throw new Error(
          `Cursor tool streaming check failed: need ≥${MIN_STEP_OUTPUT_FRAMES} step_output frames, got ${stepOutputFrames}. Snippet: ${JSON.stringify(lastStepOutputSnippet.slice(0, 240))}`
        );
      }

      const runDeadline = Date.now() + RUN_TIMEOUT_MS;
      while (Date.now() < runDeadline) {
        if (runFinished) break;
        await page.waitForTimeout(200);
      }

      if (!runFinished) throw new Error('Run did not emit pipeline_run_finished in time');
      if (runStatus !== 'completed') {
        throw new Error(`Run finished with status ${JSON.stringify(runStatus)}, expected completed`);
      }
      if (!lastStepOutputSnippet.includes('AC_CURSOR_AGENT_STREAM_10')) {
        throw new Error(
          `Marker AC_CURSOR_AGENT_STREAM_10 missing from streamed output. Snippet: ${JSON.stringify(lastStepOutputSnippet.slice(0, 320))}`
        );
      }

      console.log(
        JSON.stringify(
          {
            ok: true,
            scenario: 'cursor_default_tool_runPTY',
            base: BASE,
            pipelineId,
            stepOutputFrames,
            minRequired: MIN_STEP_OUTPUT_FRAMES,
            runStatus,
          },
          null,
          2
        )
      );
    } finally {
      await browser.close();
    }
  } finally {
    await api('/settings/profile', { method: 'PUT', body: JSON.stringify(backup) });
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, scenario: 'cursor_default_tool_runPTY', error: String(e.message || e) }, null, 2));
  process.exit(1);
});
