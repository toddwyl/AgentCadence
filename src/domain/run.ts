import type { AgentFeedItem, AgentStreamUiEvent } from '../contracts/events/agent-feed.js';
import type { TriggerType } from './post-actions.js';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type PipelineRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface RetryRecord {
  attempt: number;
  error: string;
  timestamp: string;
}

export interface StepRunRecord {
  id: string;
  stepID: string;
  stepName: string;
  status: StepStatus;
  startedAt?: string;
  endedAt?: string;
  output?: string;
  rawOutput?: string;
  agentFeed?: AgentFeedItem[];
  retryRecords?: RetryRecord[];
  totalAttempts?: number;
  maxAttempts?: number;
  reviewResult?: 'accepted' | 'rejected';
  changedFiles?: string[];
}

export interface StageRunRecord {
  id: string;
  stageID: string;
  stageName: string;
  stepRuns: StepRunRecord[];
  startedAt?: string;
  endedAt?: string;
}

export interface PipelineRunRecord {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: PipelineRunStatus;
  triggerType?: TriggerType;
  stageRuns: StageRunRecord[];
  errorMessage?: string;
  durationMs?: number;
}

export interface ActiveExecutionRunPayload {
  pipelineID: string;
  runID: string;
  pipelineName?: string;
  triggerType?: TriggerType;
  startedAt?: string;
  stepStatuses: Record<string, StepStatus>;
  stepOutputs: Record<string, string>;
  stepAgentFeeds?: Record<string, AgentFeedItem[]>;
  stepRetryRecords: Record<string, RetryRecord[]>;
  stepRetryMaxAttempts: Record<string, number>;
}

export type { AgentFeedItem, AgentStreamUiEvent, TriggerType };
