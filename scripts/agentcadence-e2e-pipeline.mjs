#!/usr/bin/env node
/**
 * E2E Pipeline Test: creates a 3-step pipeline (create, review, test) using
 * cursor and claude tools, runs it, polls until completion, reports results,
 * and cleans up.
 *
 * Usage:
 *   AGENTCADENCE_URL=http://localhost:3712 node scripts/agentcadence-e2e-pipeline.mjs
 *
 * Optional:
 *   AGENTCADENCE_RUN_TIMEOUT_MS=600000  (default 10 min)
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.AGENTCADENCE_URL || 'http://localhost:3712';
const TIMEOUT_MS = Number(process.env.AGENTCADENCE_RUN_TIMEOUT_MS || 600000);

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
  // --- Health check ---
  const health = await api('/pipelines');
  if (!health.ok) {
    console.error(JSON.stringify({ ok: false, error: `Server not reachable at ${BASE}` }));
    process.exit(1);
  }

  // --- Create temp working directory ---
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentcadence-e2e-pipeline-'));
  console.log(`Working directory: ${tmpDir}`);

  let pipelineId;

  try {
    // --- Create pipeline ---
    const createRes = await api('/pipelines', {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E Hello World Test',
        workingDirectory: tmpDir,
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`POST /pipelines ${createRes.status}: ${err}`);
    }
    const pipeline = await createRes.json();
    pipelineId = pipeline.id;
    console.log(`Pipeline created: ${pipelineId}`);

    // --- Create stage ---
    const stageRes = await api(`/pipelines/${pipelineId}/stages`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Development', executionMode: 'sequential' }),
    });
    if (!stageRes.ok) throw new Error(`POST stages ${stageRes.status}`);
    const stage = await stageRes.json();
    console.log(`Stage created: ${stage.id}`);

    // --- Add 3 steps ---
    const steps = [
      {
        name: 'Create Python Project',
        tool: 'cursor',
        prompt:
          "Create a file called main.py that prints 'Hello, World!' and a file called test_main.py that uses subprocess to run main.py and asserts the output contains 'Hello, World!'",
        failureMode: 'stop',
        retryCount: 1,
      },
      {
        name: 'Code Review',
        tool: 'claude',
        prompt:
          'Review all Python files in this directory for code quality, potential bugs, and best practices. If you find issues, fix them directly.',
        failureMode: 'stop',
        retryCount: 1,
      },
      {
        name: 'Run and Test',
        tool: 'cursor',
        prompt:
          "Run 'python3 main.py' and verify it prints 'Hello, World!'. Then run 'python3 -m pytest test_main.py -v' and ensure all tests pass. Report the results.",
        failureMode: 'stop',
        retryCount: 1,
      },
    ];

    for (const step of steps) {
      const stepRes = await api(`/pipelines/${pipelineId}/stages/${stage.id}/steps`, {
        method: 'POST',
        body: JSON.stringify(step),
      });
      if (!stepRes.ok) {
        const t = await stepRes.text();
        throw new Error(`POST steps ${stepRes.status}: ${t}`);
      }
      const created = await stepRes.json();
      console.log(`Step created: "${step.name}" (${created.id})`);
    }

    // --- Run pipeline ---
    const before = (await getPipeline(pipelineId)).runHistory.length;

    const runRes = await api(`/execution/${pipelineId}/run`, { method: 'POST' });
    if (!runRes.ok) {
      const t = await runRes.text();
      throw new Error(`POST /execution/${pipelineId}/run ${runRes.status}: ${t}`);
    }
    console.log('Pipeline run started, polling for completion...');

    // --- Poll until done ---
    const deadline = Date.now() + TIMEOUT_MS;
    let last;
    while (Date.now() < deadline) {
      const p = await getPipeline(pipelineId);
      if (p.runHistory.length > before) {
        last = p.runHistory[p.runHistory.length - 1];
        if (last.status !== 'running') break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    // --- Report results ---
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
      pipelineName: 'E2E Hello World Test',
      runStatus: last?.status,
      runId: last?.id,
      durationMs: last?.durationMs,
      errorMessage: last?.errorMessage,
      stepOutputs,
    };

    console.log(JSON.stringify(out, null, 2));

    // --- Clean up: delete pipeline ---
    try {
      const delRes = await api(`/pipelines/${pipelineId}`, { method: 'DELETE' });
      if (delRes.ok) {
        console.log('Pipeline deleted.');
      } else {
        console.warn(`Warning: failed to delete pipeline (${delRes.status})`);
      }
    } catch (e) {
      console.warn(`Warning: failed to delete pipeline: ${e}`);
    }

    // --- Clean up: remove temp directory ---
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.log('Temp directory removed.');
    } catch (e) {
      console.warn(`Warning: failed to remove temp directory: ${e}`);
    }

    process.exit(last?.status === 'completed' ? 0 : 1);
  } catch (e) {
    // Clean up on error
    if (pipelineId) {
      try {
        await api(`/pipelines/${pipelineId}`, { method: 'DELETE' });
      } catch {}
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    throw e;
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e) }, null, 2));
  process.exit(1);
});
