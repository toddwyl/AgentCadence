import type { ExecutionMode, ToolType } from '../../domain/pipeline.js';

export interface CreatePipelineRequest {
  name: string;
  workingDirectory: string;
}

export interface AddStageRequest {
  name: string;
  executionMode: ExecutionMode;
}

export interface AddStepRequest {
  name: string;
  prompt: string;
  tool: ToolType;
  command?: string;
  model?: string;
  dependsOnStepIDs?: string[];
  failureMode?: 'stop' | 'skip' | 'retry';
  retryCount?: number;
  reviewMode?: 'auto' | 'review';
}
