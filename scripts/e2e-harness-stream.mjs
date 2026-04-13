#!/usr/bin/env node
/**
 * Browser E2E: load UI → select harness pipeline → Run → assert multiple WebSocket
 * `step_output` frames arrive before `pipeline_run_finished` (proves streaming path).
 *
 * Prerequisite: server + static client already listening (see scripts/harness.sh).
 *
 * Usage:
 *   AGENTCADENCE_BASE_URL=http://localhost:3712 node scripts/e2e-harness-stream.mjs
 *   node scripts/e2e-harness-stream.mjs --base http://localhost:3712
 */

import { chromium } from 'playwright';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const BASE = (argValue('--base') || process.env.AGENTCADENCE_BASE_URL || 'http://localhost:3712').replace(/\/$/, '');
const MIN_STEP_OUTPUT_FRAMES = Number(process.env.HARNESS_MIN_STEP_OUTPUTS || 3);
const STREAM_TIMEOUT_MS = Number(process.env.HARNESS_STREAM_TIMEOUT_MS || 25000);
const RUN_TIMEOUT_MS = Number(process.env.HARNESS_RUN_TIMEOUT_MS || 120000);

async function api(path, opts = {}) {
  return fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
}

async function seedStreamingPipeline() {
  const health = await api('/pipelines');
  if (!health.ok) throw new Error(`Server not reachable at ${BASE} (GET /api/pipelines ${health.status})`);

  const home = await api('/fs/home').then((r) => r.json());
  const wd = home.path || process.cwd();

  const name = `HarnessStream-${Date.now()}`;
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

  const streamCmd = `sh -c 'i=1; while [ "$i" -le 10 ]; do echo AC_HARNESS_LINE_$i; sleep 0.3; i=$((i+1)); done'`;

  const stepRes = await api(`/pipelines/${pipelineId}/stages/${stage.id}/steps`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Stream probe',
      command: streamCmd,
      prompt: '',
      tool: 'cursor',
      failureMode: 'stop',
      retryCount: 1,
    }),
  });
  if (!stepRes.ok) throw new Error(`POST steps ${stepRes.status}`);

  return { pipelineId, name };
}

async function main() {
  const { pipelineId } = await seedStreamingPipeline();

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
          if (chunk) lastStepOutputSnippet = (lastStepOutputSnippet + chunk).slice(-400);
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
        `Streaming check failed: expected at least ${MIN_STEP_OUTPUT_FRAMES} WebSocket step_output frames for this run before timeout, got ${stepOutputFrames}. ` +
          `Last output snippet: ${JSON.stringify(lastStepOutputSnippet.slice(0, 200))}`
      );
    }

    const runDeadline = Date.now() + RUN_TIMEOUT_MS;
    while (Date.now() < runDeadline) {
      if (runFinished) break;
      await page.waitForTimeout(200);
    }

    if (!runFinished) {
      throw new Error('Run did not emit pipeline_run_finished in time');
    }
    if (runStatus !== 'completed') {
      throw new Error(`Run finished with status ${JSON.stringify(runStatus)}, expected completed`);
    }
    if (!lastStepOutputSnippet.includes('AC_HARNESS_LINE_10')) {
      throw new Error(
        `Final output marker missing (expected AC_HARNESS_LINE_10 in accumulated step_output). Snippet: ${JSON.stringify(lastStepOutputSnippet.slice(0, 300))}`
      );
    }

    const summary = {
      ok: true,
      base: BASE,
      pipelineId,
      stepOutputFrames,
      minRequired: MIN_STEP_OUTPUT_FRAMES,
      runStatus,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.message || e) }, null, 2));
  process.exit(1);
});
