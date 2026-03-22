#!/usr/bin/env node
/**
 * API smoke tests against a running AgentCadence server (default http://localhost:3712).
 * Usage: AGENTCADENCE_URL=http://localhost:3712 node scripts/agentcadence-smoke.mjs
 * (AGENTLINE_URL / AGENTFLOW_URL still accepted for backward compatibility.)
 */

const BASE =
  process.env.AGENTCADENCE_URL ||
  process.env.AGENTLINE_URL ||
  process.env.AGENTFLOW_URL ||
  'http://localhost:3712';
const api = (path, opts = {}) =>
  fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });

async function main() {
  const results = [];
  const ok = (name, pass, detail = '') => results.push({ name, pass, detail });
  let createdPipelineId = null;

  try {
    const health = await api('/pipelines');
    ok('GET /pipelines', health.ok, `status ${health.status}`);
    if (!health.ok) throw new Error('Server unreachable');

    const home = await api('/fs/home');
    const homeJ = await home.json().catch(() => ({}));
    ok('GET /fs/home', home.ok && homeJ.path, homeJ.path || JSON.stringify(homeJ));

    const create = await api('/pipelines', {
      method: 'POST',
      body: JSON.stringify({
        name: `SmokeTest-${Date.now()}`,
        workingDirectory: homeJ.path || process.cwd(),
      }),
    });
    const createJ = await create.json().catch(() => ({}));
    ok('POST /pipelines (empty)', create.ok, createJ.id || createJ.error);
    if (create.ok && createJ.id) createdPipelineId = createJ.id;

    const tmplRes = await api('/templates');
    const templates = await tmplRes.json().catch(() => []);
    ok('GET /templates', tmplRes.ok, `count ${Array.isArray(templates) ? templates.length : 0}`);

    if (Array.isArray(templates) && templates.length > 0 && createdPipelineId) {
      const fromT = await api(`/templates/${templates[0].id}/create-pipeline`, {
        method: 'POST',
        body: JSON.stringify({
          workingDirectory: homeJ.path || process.cwd(),
          name: `FromTemplate-${Date.now()}`,
        }),
      });
      const fromJ = await fromT.json().catch(() => ({}));
      ok('POST /templates/:id/create-pipeline', fromT.ok, fromJ.id || fromJ.error);
    } else {
      ok('POST /templates/:id/create-pipeline', true, 'skipped (no templates)');
    }

    if (createdPipelineId) {
      const demo = await api(`/pipelines/${createdPipelineId}/demo`, { method: 'POST' });
      const demoJ = await demo.json().catch(() => ({}));
      ok('POST /pipelines/:id/demo (cursor tools)', demo.ok, `${demoJ.stages?.length ?? 0} stages`);
      const tools = demoJ.stages?.flatMap((s) => s.steps.map((st) => st.tool)) ?? [];
      const allCursor = tools.length > 0 && tools.every((t) => t === 'cursor');
      ok('Demo steps use cursor', allCursor, tools.join(','));
    }

    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;
    console.log(JSON.stringify({ base: BASE, passed, failed, results }, null, 2));
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error(JSON.stringify({ error: String(e), results }, null, 2));
    process.exit(1);
  }
}

main();
