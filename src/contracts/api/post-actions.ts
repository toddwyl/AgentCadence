import type {
  PostAction,
  PostActionAuthType,
  PostActionBinding,
  PostActionRun,
  PostActionRunStatus,
  TriggerOn,
  TriggerType,
} from '../../domain/post-actions.js';

export type {
  PostAction,
  PostActionAuthType,
  PostActionBinding,
  PostActionRun,
  PostActionRunStatus,
  TriggerOn,
  TriggerType,
} from '../../domain/post-actions.js';

export interface CreatePostActionRequest {
  name: string;
  description?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body_template?: string;
  auth_type?: PostActionAuthType;
  auth_config?: Record<string, string>;
  timeout_seconds?: number;
  retry_count?: number;
  enabled?: boolean;
}

export interface CreateBindingRequest {
  trigger_type: TriggerType;
  trigger_id: string;
  trigger_on?: TriggerOn;
  body_override?: string;
  enabled?: boolean;
}
