#!/usr/bin/env node
/**
 * Full pipeline Run E2E: creates a 1-step pipeline with a shell-only command (no LLM),
 * POST /api/execution/:id/run, polls until runHistory records completion.
 *
 * Usage: AGENTCADENCE_URL=http://localhost:3712 node scripts/agentcadence-e2e-full-run.mjs
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
    120000
);

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
      name: `E2E-FullRun-${Date.now()}`,
      workingDirectory: wd,
    }),
  });
  if (!create.ok) {
    const err = await create.text();
    throw new Error(`POST /pipelines ${create.status}: ${err}`);
  }
  const pipeline = await create.json();
  const pipelineId = pipeline.id;

  const stageRes = await api(`/pipelines/${pipelineId}/stages`, {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E', executionMode: 'sequential' }),
  });
  if (!stageRes.ok) throw new Error(`POST stages ${stageRes.status}`);
  const stage = await stageRes.json();

  const stepRes = await api(`/pipelines/${pipelineId}/stages/${stage.id}/steps`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Shell smoke',
      command: 'echo AGENTCADENCE_E2E_OK',
      prompt: '',
      tool: 'cursor',
      failureMode: 'stop',
      retryCount: 1,
    }),
  });
  if (!stepRes.ok) throw new Error(`POST steps ${stepRes.status}`);
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
    await new Promise((r) => setTimeout(r, 400));
  }

  const out = {
    base: BASE,
    pipelineId,
    pipelineName: pipeline.name,
    runStatus: last?.status,
    runId: last?.id,
    durationMs: last?.durationMs,
    stepOutputs:
      last?.stageRuns?.flatMap((sr) =>
        sr.stepRuns.map((s) => ({ step: s.stepName, status: s.status, outputPreview: (s.output || '').slice(0, 200) }))
      ) ?? [],
  };

  if (!last || last.status !== 'completed') {
    console.error(JSON.stringify({ ok: false, ...out, error: 'Run did not complete successfully' }, null, 2));
    process.exit(1);
  }

  const outText = JSON.stringify({ ok: true, ...out }, null, 2);
  console.log(outText);
  process.exit(0);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e) }, null, 2));
  process.exit(1);
});
