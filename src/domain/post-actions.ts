export type PostActionAuthType = 'none' | 'bearer' | 'basic' | 'header';
export type PostActionRunStatus = 'success' | 'failed' | 'retrying';
export type TriggerType = 'webhook' | 'schedule' | 'manual';
export type TriggerOn = 'success' | 'failure' | 'any';

export interface PostAction {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body_template: string;
  auth_type: PostActionAuthType;
  auth_config: Record<string, string>;
  timeout_seconds: number;
  retry_count: number;
  enabled: boolean;
  created_at: string;
}

export interface PostActionBinding {
  id: string;
  post_action_id: string;
  trigger_type: TriggerType;
  trigger_id: string;
  trigger_on: TriggerOn;
  body_override: string;
  enabled: boolean;
  created_at: string;
}

export interface PostActionRun {
  id: string;
  post_action_id: string;
  binding_id: string;
  triggered_at: string;
  completed_at: string | null;
  status: PostActionRunStatus;
  status_code: number;
  response_body: string;
  error: string;
}
