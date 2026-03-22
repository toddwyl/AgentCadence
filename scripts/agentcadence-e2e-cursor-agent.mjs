#!/usr/bin/env node
/**
 * Full pipeline Run with a real Cursor step (cursor-agent, no custom shell command).
 * Prompt is intentionally minimal to finish quickly; still depends on local cursor-agent + account/network.
 *
 * Usage:
 *   AGENTCADENCE_URL=http://localhost:3712 node scripts/agentcadence-e2e-cursor-agent.mjs
 *
 * Optional:
 *   AGENTCADENCE_RUN_TIMEOUT_MS=900000   (default 15 min — server CLI timeout is 600s per step)
 * (AGENTLINE_* / AGENTFLOW_* env vars still accepted.)
 */

const BASE =
  process.env.AGENTCADENCE_URL ||
  process.env.AGENTLINE_URL ||
  process.env.AGENTFLOW_URL ||
  'http://localhost:3712';
const TIMEOUT_MS = Number(
  process.env.AGENTCADENCE_RUN_TIMEOUT_MS ||
    process.env.AGENTLINE_RUN_TIMEOUT_MS ||
    process.env.AGENTFLOW_RUN_TIMEOUT_MS ||
    900000
);
const PROMPT =
  process.env.AGENTCADENCE_CURSOR_PROMPT ||
  process.env.AGENTLINE_CURSOR_PROMPT ||
  process.env.AGENTFLOW_CURSOR_PROMPT ||
  'Reply with exactly one line containing only: CURSOR_E2E_OK (no other text).';

const api = (path, opts = {}) =>
  fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });

async function getPipeline(id) {
  const r = await api(`/pipelines/${id}`);
  if (!r.ok) throw new Error(`GET /pipelines/${id} ${r.status}`);
  return r.json();
}

async function main() {
  const health = await api('/pipelines');
  if (!health.ok) {
    console.error(JSON.stringify({ ok: false, error: `Server not reachable at ${BASE}` }));
    process.exit(1);
  }

  const home = await api('/fs/home').then((r) => r.json());
  const wd = home.path || process.cwd();

  const create = await api('/pipelines', {
    method: 'POST',
    body: JSON.stringify({
      name: `E2E-CursorAgent-${Date.now()}`,
      workingDirectory: wd,
    }),
  });
  if (!create.ok) throw new Error(`POST /pipelines ${create.status}`);
  const pipeline = await create.json();
  const pipelineId = pipeline.id;

  const stageRes = await api(`/pipelines/${pipelineId}/stages`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Cursor', executionMode: 'sequential' }),
  });
  if (!stageRes.ok) throw new Error(`POST stages ${stageRes.status}`);
  const stage = await stageRes.json();

  const stepRes = await api(`/pipelines/${pipelineId}/stages/${stage.id}/steps`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Cursor agent',
      prompt: PROMPT,
      tool: 'cursor',
      model: 'auto',
      failureMode: 'stop',
      retryCount: 1,
    }),
  });
  if (!stepRes.ok) {
    const t = await stepRes.text();
    throw new Error(`POST steps ${stepRes.status}: ${t}`);
  }
  await stepRes.json();

  const before = (await getPipeline(pipelineId)).runHistory.length;

  const runRes = await api(`/execution/${pipelineId}/run`, { method: 'POST' });
  if (!runRes.ok) {
    const t = await runRes.text();
    throw new Error(`POST /execution/${pipelineId}/run ${runRes.status}: ${t}`);
  }

  const deadline = Date.now() + TIMEOUT_MS;
  let last;
  while (Date.now() < deadline) {
    const p = await getPipeline(pipelineId);
    if (p.runHistory.length > before) {
      last = p.runHistory[p.runHistory.length - 1];
      if (last.status !== 'running') break;
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  const stepOutputs =
    last?.stageRuns?.flatMap((sr) =>
      sr.stepRuns.map((s) => ({
        step: s.stepName,
        status: s.status,
        outputPreview: (s.output || '').slice(0, 2000),
      }))
    ) ?? [];

  const out = {
    ok: last?.status === 'completed',
    base: BASE,
    pipelineId,
    pipelineName: pipeline.name,
    prompt: PROMPT,
    runStatus: last?.status,
    runId: last?.id,
    durationMs: last?.durationMs,
    errorMessage: last?.errorMessage,
    stepOutputs,
  };

  console.log(JSON.stringify(out, null, 2));
  process.exit(last?.status === 'completed' ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e) }, null, 2));
  process.exit(1);
});
