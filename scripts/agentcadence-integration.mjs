#!/usr/bin/env node
/**
 * API Integration Tests for AgentCadence — Schedules, Webhooks, Post-Actions.
 * Requires a running backend at http://localhost:3712.
 *
 * Usage: AGENTCADENCE_URL=http://localhost:3712 node scripts/agentcadence-integration.mjs
 */

const BASE =
  process.env.AGENTCADENCE_URL || 'http://localhost:3712';

const api = (path, opts = {}) =>
  fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  const icon = pass ? '  ✓' : '  ✗';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
};

let createdPipelineId = null;

// ── Helpers ──
async function createTestPipeline() {
  const home = await api('/fs/home').then((r) => r.json()).catch(() => ({ path: process.cwd() }));
  const res = await api('/pipelines', {
    method: 'POST',
    body: JSON.stringify({
      name: `IntegrationTest-${Date.now()}`,
      workingDirectory: home.path || process.cwd(),
    }),
  });
  const data = await res.json();
  createdPipelineId = data.id;
  return data;
}

async function cleanupPipeline() {
  if (createdPipelineId) {
    await api(`/pipelines/${createdPipelineId}`, { method: 'DELETE' }).catch(() => {});
  }
}

// ── Test: Pipeline basics ──
async function testPipelineBasics() {
  console.log('\n── Pipeline Basics ──');
  const listRes = await api('/pipelines');
  ok('GET /api/pipelines', listRes.ok, `status ${listRes.status}`);

  const pipeline = await createTestPipeline();
  ok('POST /api/pipelines (create)', !!pipeline.id, pipeline.id || 'no id');
}

// ── Test: Schedules CRUD ──
async function testSchedules() {
  console.log('\n── Schedules API ──');
  let scheduleId = null;

  // List (initially may have items from previous runs, just check 200)
  const listRes = await api('/schedules');
  ok('GET /api/schedules', listRes.ok, `status ${listRes.status}`);

  // Create
  const createRes = await api('/schedules', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Schedule',
      pipeline_id: createdPipelineId,
      cron_expression: '*/30 * * * *',
      timezone: 'UTC',
    }),
  });
  const created = await createRes.json();
  scheduleId = created.id;
  ok('POST /api/schedules (create)', createRes.status === 201 && !!created.id, created.id);

  // Get single
  const getRes = await api(`/schedules/${scheduleId}`);
  const single = await getRes.json();
  ok('GET /api/schedules/:id', getRes.ok && single.name === 'Test Schedule', single.name);

  // Update
  const updateRes = await api(`/schedules/${scheduleId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Updated Schedule' }),
  });
  const updated = await updateRes.json();
  ok('PUT /api/schedules/:id', updateRes.ok && updated.name === 'Updated Schedule', updated.name);

  // Toggle
  const toggleRes = await api(`/schedules/${scheduleId}/toggle`, { method: 'PATCH' });
  const toggled = await toggleRes.json();
  ok('PATCH /api/schedules/:id/toggle', toggleRes.ok && toggled.enabled === false, `enabled=${toggled.enabled}`);

  // Runs
  const runsRes = await api(`/schedules/${scheduleId}/runs`);
  const runs = await runsRes.json();
  ok('GET /api/schedules/:id/runs', runsRes.ok && Array.isArray(runs), `count=${runs.length}`);

  // Delete
  const deleteRes = await api(`/schedules/${scheduleId}`, { method: 'DELETE' });
  ok('DELETE /api/schedules/:id', deleteRes.status === 204, `status ${deleteRes.status}`);

  // Verify deleted
  const afterDelete = await api(`/schedules/${scheduleId}`);
  ok('GET /api/schedules/:id (after delete)', afterDelete.status === 404, `status ${afterDelete.status}`);

  // Create with missing fields
  const badRes = await api('/schedules', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bad' }),
  });
  ok('POST /api/schedules (missing fields)', badRes.status === 400, `status ${badRes.status}`);
}

// ── Test: Webhooks CRUD ──
async function testWebhooks() {
  console.log('\n── Webhooks API ──');
  let webhookId = null;
  let fullToken = null;

  // List
  const listRes = await api('/webhooks');
  ok('GET /api/webhooks', listRes.ok, `status ${listRes.status}`);

  // Create
  const createRes = await api('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Webhook',
      pipeline_id: createdPipelineId,
      prompt_template: 'Process: {{payload.message}}',
    }),
  });
  const created = await createRes.json();
  webhookId = created.webhook?.id || created.id;
  fullToken = created.token;
  ok('POST /api/webhooks (create)', createRes.status === 201 && !!webhookId, webhookId);
  ok('POST /api/webhooks (returns token)', !!fullToken && fullToken.length > 8, `token length=${fullToken?.length}`);

  // List shows masked token
  const list2 = await api('/webhooks');
  const webhooks = await list2.json();
  const found = webhooks.find((w) => w.id === webhookId);
  ok('GET /api/webhooks (token masked)', found && found.token.includes('…'), found?.token);

  // Update
  const updateRes = await api(`/webhooks/${webhookId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Updated Webhook' }),
  });
  ok('PUT /api/webhooks/:id', updateRes.ok, `status ${updateRes.status}`);

  // Toggle
  const toggleRes = await api(`/webhooks/${webhookId}/toggle`, { method: 'PATCH' });
  const toggled = await toggleRes.json();
  ok('PATCH /api/webhooks/:id/toggle', toggleRes.ok && toggled.enabled === false, `enabled=${toggled.enabled}`);

  // Re-enable for trigger test
  await api(`/webhooks/${webhookId}/toggle`, { method: 'PATCH' });

  // Regenerate token
  const regenRes = await api(`/webhooks/${webhookId}/regenerate`, { method: 'POST' });
  const regen = await regenRes.json();
  const newToken = regen.token;
  ok('POST /api/webhooks/:id/regenerate', regenRes.ok && !!newToken && newToken !== fullToken, 'new token generated');
  fullToken = newToken;

  // Trigger without auth → 401
  const noAuthRes = await api(`/webhooks/${webhookId}/trigger`, {
    method: 'POST',
    body: JSON.stringify({ message: 'hello' }),
  });
  ok('POST /api/webhooks/:id/trigger (no auth)', noAuthRes.status === 401, `status ${noAuthRes.status}`);

  // Trigger with correct auth → 202
  const authRes = await api(`/webhooks/${webhookId}/trigger`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${fullToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  });
  ok('POST /api/webhooks/:id/trigger (valid auth)', authRes.status === 202, `status ${authRes.status}`);

  // Wait a bit for the run to be recorded
  await new Promise((r) => setTimeout(r, 500));

  // Runs
  const runsRes = await api(`/webhooks/${webhookId}/runs`);
  const runs = await runsRes.json();
  ok('GET /api/webhooks/:id/runs', runsRes.ok && Array.isArray(runs), `count=${runs.length}`);

  // Delete
  const deleteRes = await api(`/webhooks/${webhookId}`, { method: 'DELETE' });
  ok('DELETE /api/webhooks/:id', deleteRes.status === 204, `status ${deleteRes.status}`);

  // Create with missing fields
  const badRes = await api('/webhooks', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bad' }),
  });
  ok('POST /api/webhooks (missing fields)', badRes.status === 400, `status ${badRes.status}`);
}

// ── Test: Post-Actions CRUD ──
async function testPostActions() {
  console.log('\n── Post-Actions API ──');
  let actionId = null;
  let bindingId = null;

  // List
  const listRes = await api('/post-actions');
  ok('GET /api/post-actions', listRes.ok, `status ${listRes.status}`);

  // Create
  const createRes = await api('/post-actions', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test PostAction',
      method: 'POST',
      url: 'https://httpbin.org/post',
      body_template: '{"status": "{{run.status}}"}',
      auth_type: 'none',
    }),
  });
  const created = await createRes.json();
  actionId = created.id;
  ok('POST /api/post-actions (create)', createRes.status === 201 && !!actionId, actionId);

  // Get single
  const getRes = await api(`/post-actions/${actionId}`);
  const single = await getRes.json();
  ok('GET /api/post-actions/:id', getRes.ok && single.name === 'Test PostAction', single.name);

  // Update
  const updateRes = await api(`/post-actions/${actionId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Updated PostAction' }),
  });
  const updated = await updateRes.json();
  ok('PUT /api/post-actions/:id', updateRes.ok && updated.name === 'Updated PostAction', updated.name);

  // Toggle
  const toggleRes = await api(`/post-actions/${actionId}/toggle`, { method: 'PATCH' });
  const toggled = await toggleRes.json();
  ok('PATCH /api/post-actions/:id/toggle', toggleRes.ok && toggled.enabled === false, `enabled=${toggled.enabled}`);

  // Create Binding
  const bindRes = await api(`/post-actions/${actionId}/bindings`, {
    method: 'POST',
    body: JSON.stringify({
      trigger_type: 'manual',
      trigger_id: createdPipelineId,
      trigger_on: 'success',
    }),
  });
  const binding = await bindRes.json();
  bindingId = binding.id;
  ok('POST /api/post-actions/:id/bindings', bindRes.status === 201 && !!bindingId, bindingId);

  // List Bindings
  const bindListRes = await api(`/post-actions/${actionId}/bindings`);
  const bindings = await bindListRes.json();
  ok('GET /api/post-actions/:id/bindings', bindListRes.ok && bindings.length >= 1, `count=${bindings.length}`);

  // Delete Binding
  const delBindRes = await api(`/post-actions/${actionId}/bindings/${bindingId}`, { method: 'DELETE' });
  ok('DELETE /api/post-actions/:id/bindings/:bid', delBindRes.status === 204, `status ${delBindRes.status}`);

  // Runs
  const runsRes = await api(`/post-actions/${actionId}/runs`);
  const runs = await runsRes.json();
  ok('GET /api/post-actions/:id/runs', runsRes.ok && Array.isArray(runs), `count=${runs.length}`);

  // Delete
  const deleteRes = await api(`/post-actions/${actionId}`, { method: 'DELETE' });
  ok('DELETE /api/post-actions/:id', deleteRes.status === 204, `status ${deleteRes.status}`);

  // Create with missing fields
  const badRes = await api('/post-actions', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bad' }),
  });
  ok('POST /api/post-actions (missing fields)', badRes.status === 400, `status ${badRes.status}`);
}

// ── Main ──
async function main() {
  console.log(`\n🧪 AgentCadence Integration Tests — ${BASE}\n`);

  // Pre-check: server reachable
  try {
    const health = await api('/pipelines');
    if (!health.ok) throw new Error(`Server not reachable: ${health.status}`);
  } catch (e) {
    console.error(`\n✗ Server not reachable at ${BASE}: ${e.message}`);
    process.exit(1);
  }

  try {
    await testPipelineBasics();
    await testSchedules();
    await testWebhooks();
    await testPostActions();
  } finally {
    await cleanupPipeline();
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  PASSED: ${passed}  FAILED: ${failed}`);
  console.log(`${'='.repeat(50)}\n`);

  console.log(JSON.stringify({ base: BASE, passed, failed, results }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✗ Fatal error: ${e.message}`);
  process.exit(1);
});
