import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import type { Webhook, WebhookRun, CreateWebhookRequest, UpdateWebhookRequest } from '../../shared/types.js';
import { loadWebhooks, saveWebhooks, loadWebhookRuns, saveWebhookRuns, loadPipelines } from '../services/store.js';
import { runPipelineForTrigger } from '../services/pipeline-executor.js';
import { broadcast } from '../ws.js';

const router = Router();

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Active concurrent runs per webhook
const concurrentRuns = new Map<string, number>();

// List all webhooks
router.get('/', (_req: Request, res: Response) => {
  const webhooks = loadWebhooks().map((w) => ({ ...w, token: maskToken(w.token) }));
  res.json(webhooks);
});

// Get single webhook
router.get('/:id', (req: Request, res: Response) => {
  const webhook = loadWebhooks().find((w) => w.id === req.params.id);
  if (!webhook) { res.status(404).json({ error: 'Webhook not found' }); return; }
  res.json({ ...webhook, token: maskToken(webhook.token) });
});

// Create webhook
router.post('/', (req: Request, res: Response) => {
  const body = req.body as CreateWebhookRequest;
  if (!body.name || !body.pipeline_id || !body.prompt_template) {
    res.status(400).json({ error: 'name, pipeline_id, and prompt_template are required' });
    return;
  }

  const now = new Date().toISOString();
  const token = generateToken();
  const webhook: Webhook = {
    id: uuidv4(),
    name: body.name,
    pipeline_id: body.pipeline_id,
    prompt_template: body.prompt_template,
    token,
    enabled: body.enabled ?? true,
    timeout_seconds: body.timeout_seconds ?? 3600,
    max_concurrent: body.max_concurrent ?? 1,
    last_triggered_at: null,
    status: 'idle',
    created_at: now,
    updated_at: now,
  };

  const webhooks = loadWebhooks();
  webhooks.push(webhook);
  saveWebhooks(webhooks);

  // Return full token only on create
  res.status(201).json({ webhook, token });
});

// Update webhook
router.put('/:id', (req: Request, res: Response) => {
  const webhooks = loadWebhooks();
  const idx = webhooks.findIndex((w) => w.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Webhook not found' }); return; }

  const body = req.body as UpdateWebhookRequest;
  const webhook = webhooks[idx];

  if (body.name !== undefined) webhook.name = body.name;
  if (body.pipeline_id !== undefined) webhook.pipeline_id = body.pipeline_id;
  if (body.prompt_template !== undefined) webhook.prompt_template = body.prompt_template;
  if (body.timeout_seconds !== undefined) webhook.timeout_seconds = body.timeout_seconds;
  if (body.max_concurrent !== undefined) webhook.max_concurrent = body.max_concurrent;
  if (body.enabled !== undefined) webhook.enabled = body.enabled;
  webhook.updated_at = new Date().toISOString();

  saveWebhooks(webhooks);
  res.json({ ...webhook, token: maskToken(webhook.token) });
});

// Toggle enabled
router.patch('/:id/toggle', (req: Request, res: Response) => {
  const webhooks = loadWebhooks();
  const idx = webhooks.findIndex((w) => w.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Webhook not found' }); return; }

  webhooks[idx].enabled = !webhooks[idx].enabled;
  webhooks[idx].updated_at = new Date().toISOString();
  saveWebhooks(webhooks);
  res.json({ ...webhooks[idx], token: maskToken(webhooks[idx].token) });
});

// Regenerate token
router.post('/:id/regenerate', (req: Request, res: Response) => {
  const webhooks = loadWebhooks();
  const idx = webhooks.findIndex((w) => w.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Webhook not found' }); return; }

  const token = generateToken();
  webhooks[idx].token = token;
  webhooks[idx].updated_at = new Date().toISOString();
  saveWebhooks(webhooks);
  res.json({ webhook: webhooks[idx], token });
});

// Delete webhook
router.delete('/:id', (req: Request, res: Response) => {
  const webhooks = loadWebhooks();
  const idx = webhooks.findIndex((w) => w.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Webhook not found' }); return; }

  webhooks.splice(idx, 1);
  saveWebhooks(webhooks);
  res.status(204).end();
});

// List runs
router.get('/:id/runs', (req: Request, res: Response) => {
  const runs = loadWebhookRuns()
    .filter((r) => r.webhook_id === req.params.id)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 50);
  res.json(runs);
});

// Trigger webhook — public endpoint
router.post('/:id/trigger', async (req: Request, res: Response) => {
  const webhooks = loadWebhooks();
  const webhook = webhooks.find((w) => w.id === req.params.id);
  if (!webhook) { res.status(404).json({ error: 'Webhook not found' }); return; }

  // Auth check
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${webhook.token}`) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  if (!webhook.enabled) {
    res.status(403).json({ error: 'Webhook is disabled' });
    return;
  }

  // Concurrency check
  const current = concurrentRuns.get(webhook.id) ?? 0;
  if (current >= webhook.max_concurrent) {
    res.status(429).json({ error: 'Max concurrent runs reached' });
    return;
  }

  const pipelines = loadPipelines();
  const pipeline = pipelines.find((p) => p.id === webhook.pipeline_id);
  if (!pipeline) { res.status(404).json({ error: 'Pipeline not found' }); return; }

  const run: WebhookRun = {
    id: uuidv4(),
    webhook_id: webhook.id,
    pipeline_run_id: '',
    started_at: new Date().toISOString(),
    finished_at: null,
    status: 'running',
    error: '',
    request_payload: JSON.stringify(req.body),
    caller_ip: req.ip || req.socket.remoteAddress || '',
  };

  const runs = loadWebhookRuns();
  runs.push(run);
  saveWebhookRuns(runs);

  // Update webhook status
  const wIdx = webhooks.findIndex((w) => w.id === webhook.id);
  webhooks[wIdx].status = 'running';
  webhooks[wIdx].last_triggered_at = new Date().toISOString();
  saveWebhooks(webhooks);

  concurrentRuns.set(webhook.id, current + 1);

  broadcast({ type: 'webhook_triggered', payload: { webhookId: webhook.id, runId: run.id } });

  // Respond immediately
  res.status(202).json({ run_id: run.id, status: 'accepted' });

  // Execute async
  try {
    const result = await runPipelineForTrigger(pipeline, 'webhook');
    run.pipeline_run_id = result.runId;
    run.status = result.success ? 'success' : 'failed';
    run.error = result.error || '';
  } catch (err) {
    run.status = 'failed';
    run.error = (err as Error).message;
  }

  run.finished_at = new Date().toISOString();

  const currentRuns = loadWebhookRuns();
  const rIdx = currentRuns.findIndex((r) => r.id === run.id);
  if (rIdx !== -1) currentRuns[rIdx] = run;
  saveWebhookRuns(currentRuns);

  // Reset webhook status
  const latestWebhooks = loadWebhooks();
  const lwIdx = latestWebhooks.findIndex((w) => w.id === webhook.id);
  if (lwIdx !== -1) {
    latestWebhooks[lwIdx].status = 'idle';
    saveWebhooks(latestWebhooks);
  }

  concurrentRuns.set(webhook.id, Math.max(0, (concurrentRuns.get(webhook.id) ?? 1) - 1));

  broadcast({ type: 'webhook_run_finished', payload: { webhookId: webhook.id, runId: run.id, status: run.status } });
});

function maskToken(token: string): string {
  if (token.length <= 8) return '****';
  return token.slice(0, 4) + '…' + token.slice(-4);
}

export default router;
