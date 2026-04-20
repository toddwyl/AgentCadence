import type { Webhook, WebhookRun } from '../../../domain/triggers.js';
import { v4 as uuidv4 } from 'uuid';
import type { TriggerType } from '../../../domain/run.js';
import {
  loadWebhooks,
  saveWebhooks,
  loadWebhookRuns,
  saveWebhookRuns,
  loadPipelines,
} from '../store.js';
import { broadcast } from '../../ws.js';
import { runPipelineForTrigger } from './execution-service.js';

export function listWebhooks(): Webhook[] {
  return loadWebhooks();
}

export function getWebhookById(id: string): Webhook | null {
  return loadWebhooks().find((webhook) => webhook.id === id) ?? null;
}

export function resolveWebhookSelector(selector: string): Webhook | null {
  const webhooks = loadWebhooks();

  const byId = webhooks.find((webhook) => webhook.id === selector);
  if (byId) return byId;

  const exactNameMatches = webhooks.filter((webhook) => webhook.name === selector);
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  if (exactNameMatches.length > 1) {
    throw new Error(`Webhook selector "${selector}" is ambiguous; use an id instead.`);
  }

  const caseInsensitiveMatches = webhooks.filter(
    (webhook) => webhook.name.toLowerCase() === selector.toLowerCase()
  );
  if (caseInsensitiveMatches.length === 1) return caseInsensitiveMatches[0];
  if (caseInsensitiveMatches.length > 1) {
    throw new Error(`Webhook selector "${selector}" is ambiguous; use an id instead.`);
  }

  return null;
}

// Local trusted control-plane trigger path. Keeps the HTTP route behavior
// without requiring auth headers or request context.
const concurrentRuns = new Map<string, number>();

export async function triggerWebhookByIdOrName(
  selector: string,
  options: { requestPayload?: string; callerIp?: string } = {}
): Promise<WebhookRun> {
  const webhook = resolveWebhookSelector(selector);
  if (!webhook) {
    throw new Error(`Webhook "${selector}" not found.`);
  }

  if (!webhook.enabled) {
    throw new Error('Webhook is disabled');
  }

  const current = concurrentRuns.get(webhook.id) ?? 0;
  if (current >= webhook.max_concurrent) {
    throw new Error('Max concurrent runs reached');
  }

  const pipelines = loadPipelines();
  const pipeline = pipelines.find((p) => p.id === webhook.pipeline_id);
  if (!pipeline) {
    throw new Error('Pipeline not found');
  }

  const run: WebhookRun = {
    id: uuidv4(),
    webhook_id: webhook.id,
    pipeline_run_id: '',
    started_at: new Date().toISOString(),
    finished_at: null,
    status: 'running',
    error: '',
    request_payload: options.requestPayload ?? '{}',
    caller_ip: options.callerIp ?? '',
  };

  const runs = loadWebhookRuns();
  runs.push(run);
  saveWebhookRuns(runs);

  const webhooks = loadWebhooks();
  const idx = webhooks.findIndex((w) => w.id === webhook.id);
  if (idx !== -1) {
    webhooks[idx].status = 'running';
    webhooks[idx].last_triggered_at = new Date().toISOString();
    saveWebhooks(webhooks);
  }

  concurrentRuns.set(webhook.id, current + 1);
  broadcast({ type: 'webhook_triggered', payload: { webhookId: webhook.id, runId: run.id } });

  try {
    const result = await runPipelineForTrigger(pipeline, 'webhook' as TriggerType);
    run.pipeline_run_id = result.runId;
    run.status = result.success ? 'success' : 'failed';
    run.error = result.error || '';
  } catch (err) {
    run.status = 'failed';
    run.error = (err as Error).message;
  } finally {
    run.finished_at = new Date().toISOString();

    const currentRuns = loadWebhookRuns();
    const runIdx = currentRuns.findIndex((r) => r.id === run.id);
    if (runIdx !== -1) currentRuns[runIdx] = run;
    saveWebhookRuns(currentRuns);

    const latestWebhooks = loadWebhooks();
    const webhookIdx = latestWebhooks.findIndex((w) => w.id === webhook.id);
    if (webhookIdx !== -1) {
      latestWebhooks[webhookIdx].status = 'idle';
      saveWebhooks(latestWebhooks);
    }

    concurrentRuns.set(webhook.id, Math.max(0, (concurrentRuns.get(webhook.id) ?? 1) - 1));

    broadcast({
      type: 'webhook_run_finished',
      payload: { webhookId: webhook.id, runId: run.id, status: run.status },
    });
  }

  return run;
}
