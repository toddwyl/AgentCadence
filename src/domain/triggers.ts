export type ScheduleStatus = 'idle' | 'running' | 'error';
export type ScheduleRunStatus = 'running' | 'success' | 'failed' | 'timeout';

export interface Schedule {
  id: string;
  name: string;
  pipeline_id: string;
  prompt_override?: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  status: ScheduleStatus;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRun {
  id: string;
  schedule_id: string;
  pipeline_run_id: string;
  started_at: string;
  finished_at: string | null;
  status: ScheduleRunStatus;
  error: string;
}

export type WebhookStatus = 'idle' | 'running';
export type WebhookRunStatus = 'running' | 'success' | 'failed' | 'timeout';

export interface Webhook {
  id: string;
  name: string;
  pipeline_id: string;
  prompt_template: string;
  token: string;
  enabled: boolean;
  timeout_seconds: number;
  max_concurrent: number;
  last_triggered_at: string | null;
  status: WebhookStatus;
  created_at: string;
  updated_at: string;
}

export interface WebhookRun {
  id: string;
  webhook_id: string;
  pipeline_run_id: string;
  started_at: string;
  finished_at: string | null;
  status: WebhookRunStatus;
  error: string;
  request_payload?: string;
  caller_ip?: string;
}
