import type {
  Schedule,
  ScheduleRun,
  ScheduleRunStatus,
  ScheduleStatus,
} from '../../domain/triggers.js';

export type {
  Schedule,
  ScheduleRun,
  ScheduleRunStatus,
  ScheduleStatus,
} from '../../domain/triggers.js';

export interface CreateScheduleRequest {
  name: string;
  pipeline_id: string;
  prompt_override?: string;
  cron_expression: string;
  timezone: string;
  enabled?: boolean;
}

export interface UpdateScheduleRequest {
  name?: string;
  pipeline_id?: string;
  prompt_override?: string;
  cron_expression?: string;
  timezone?: string;
  enabled?: boolean;
}
