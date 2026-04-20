import type {
  Webhook,
  WebhookRun,
  WebhookRunStatus,
  WebhookStatus,
} from '../../domain/triggers.js';

export type {
  Webhook,
  WebhookRun,
  WebhookRunStatus,
  WebhookStatus,
} from '../../domain/triggers.js';

export interface CreateWebhookRequest {
  name: string;
  pipeline_id: string;
  prompt_template: string;
  timeout_seconds?: number;
  max_concurrent?: number;
  enabled?: boolean;
}

export interface UpdateWebhookRequest {
  name?: string;
  pipeline_id?: string;
  prompt_template?: string;
  timeout_seconds?: number;
  max_concurrent?: number;
  enabled?: boolean;
}
