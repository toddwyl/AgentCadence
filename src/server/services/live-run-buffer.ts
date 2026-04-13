import type {
  Pipeline,
  ActiveExecutionRunPayload,
  StepStatus,
  RetryRecord,
  AgentStreamUiEvent,
} from '../../shared/types.js';
import { pipelineAllSteps } from '../../shared/types.js';
import { applyAgentStreamEvent } from '../../shared/agent-feed-merge.js';

/** Tail cap per step to bound memory (aligned with planning log scale in app-store). */
const MAX_STEP_OUTPUT_CHARS = 120_000;

const runs = new Map<string, ActiveExecutionRunPayload>();

function capOutput(s: string): string {
  if (s.length <= MAX_STEP_OUTPUT_CHARS) return s;
  return s.slice(-MAX_STEP_OUTPUT_CHARS);
}

export function initLiveRun(pipeline: Pipeline, runId: string): void {
  const stepStatuses: Record<string, StepStatus> = {};
  for (const step of pipelineAllSteps(pipeline)) {
    stepStatuses[step.id] = 'pending';
  }
  runs.set(pipeline.id, {
    pipelineID: pipeline.id,
    runID: runId,
    stepStatuses,
    stepOutputs: {},
    stepAgentFeeds: {},
    stepRetryRecords: {},
    stepRetryMaxAttempts: {},
  });
}

export function clearLiveRun(pipelineID: string): void {
  runs.delete(pipelineID);
}

export function appendStepOutput(pipelineID: string, stepID: string, chunk: string): void {
  const r = runs.get(pipelineID);
  if (!r) return;
  const prev = r.stepOutputs[stepID] || '';
  r.stepOutputs[stepID] = capOutput(prev + chunk);
}

export function appendAgentStreamEvent(
  pipelineID: string,
  stepID: string,
  event: AgentStreamUiEvent
): void {
  const r = runs.get(pipelineID);
  if (!r) return;
  if (!r.stepAgentFeeds) r.stepAgentFeeds = {};
  const prev = r.stepAgentFeeds[stepID] ?? [];
  r.stepAgentFeeds[stepID] = applyAgentStreamEvent(prev, event);
}

export function setStepStatus(pipelineID: string, stepID: string, status: StepStatus): void {
  const r = runs.get(pipelineID);
  if (!r) return;
  r.stepStatuses[stepID] = status;
}

export function setStepRetry(
  pipelineID: string,
  stepID: string,
  retryRecords: RetryRecord[],
  _failedAttempt: number,
  maxAttempts: number
): void {
  const r = runs.get(pipelineID);
  if (!r) return;
  r.stepRetryRecords[stepID] = retryRecords;
  r.stepRetryMaxAttempts[stepID] = maxAttempts;
}

export function getActiveRunSnapshots(): ActiveExecutionRunPayload[] {
  return [...runs.values()];
}

export function getActiveRunSnapshot(pipelineID: string): ActiveExecutionRunPayload | undefined {
  return runs.get(pipelineID);
}
