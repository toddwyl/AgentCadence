export type WSEventType =
  | 'step_status_changed'
  | 'step_output'
  | 'step_retry'
  | 'step_review_requested'
  | 'step_review_response'
  | 'pipeline_run_started'
  | 'pipeline_run_finished'
  | 'planning_phase'
  | 'planning_log'
  | 'planning_complete'
  | 'planning_error'
  | 'execution_error'
  | 'execution_state_snapshot'
  | 'agent_stream_event'
  | 'schedule_status_changed'
  | 'schedule_run_started'
  | 'schedule_run_finished'
  | 'webhook_triggered'
  | 'webhook_run_finished'
  | 'post_action_triggered'
  | 'post_action_finished';

export interface WSMessage {
  type: WSEventType;
  payload: Record<string, unknown>;
}
