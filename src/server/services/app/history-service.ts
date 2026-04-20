import type {
  ActiveExecutionRunPayload,
  PipelineRunRecord,
  PipelineRunStatus,
  StepRunRecord,
  TriggerType,
} from '../../../domain/run.js';
import type { Pipeline } from '../../../domain/pipeline.js';
import { loadPipelines } from '../store.js';
import { getActiveRunSnapshots } from '../live-run-buffer.js';

export interface HistoryListFilters {
  status?: PipelineRunStatus;
  pipelineId?: string;
}

export interface HistoryRunSummary {
  runId: string;
  pipelineId: string;
  pipelineName: string;
  status: PipelineRunStatus;
  triggerType: TriggerType;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  isActive: boolean;
}

export interface HistoryRunDetail {
  pipelineId: string;
  pipelineName: string;
  run: PipelineRunRecord;
  isActive: boolean;
}

export function listHistoryRuns(filters: HistoryListFilters = {}): HistoryRunSummary[] {
  const pipelines = loadPipelines();
  const activeRuns = getActiveRunSnapshots();
  const summaries: HistoryRunSummary[] = [];

  for (const pipeline of pipelines) {
    for (const run of pipeline.runHistory) {
      summaries.push({
        runId: run.id,
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        status: run.status,
        triggerType: run.triggerType ?? 'manual',
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        durationMs: run.durationMs,
        isActive: false,
      });
    }
  }

  for (const active of activeRuns) {
    summaries.push(activeRunSummary(active));
  }

  return summaries
    .filter((item) => !filters.status || item.status === filters.status)
    .filter((item) => !filters.pipelineId || item.pipelineId === filters.pipelineId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getHistoryRun(runId: string): HistoryRunDetail | null {
  const pipelines = loadPipelines();
  const active = getActiveRunSnapshots().find((run) => run.runID === runId);
  if (active) {
    const pipeline = pipelines.find((item) => item.id === active.pipelineID) ?? null;
    return {
      pipelineId: active.pipelineID,
      pipelineName: pipeline?.name ?? active.pipelineName ?? active.pipelineID,
      run: activeRunToRecord(active, pipeline),
      isActive: true,
    };
  }

  for (const pipeline of pipelines) {
    const run = pipeline.runHistory.find((item) => item.id === runId);
    if (run) {
      return {
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        run,
        isActive: false,
      };
    }
  }

  return null;
}

export function getHistoryRunStep(runId: string, stepId: string): StepRunRecord | null {
  const detail = getHistoryRun(runId);
  if (!detail) return null;
  for (const stage of detail.run.stageRuns) {
    const step = stage.stepRuns.find((item) => item.stepID === stepId);
    if (step) return step;
  }
  return null;
}

function activeRunSummary(active: ActiveExecutionRunPayload): HistoryRunSummary {
  return {
    runId: active.runID,
    pipelineId: active.pipelineID,
    pipelineName: active.pipelineName ?? active.pipelineID,
    status: 'running',
    triggerType: active.triggerType ?? 'manual',
    startedAt: active.startedAt ?? new Date(0).toISOString(),
    isActive: true,
  };
}

function activeRunToRecord(active: ActiveExecutionRunPayload, pipeline: Pipeline | null): PipelineRunRecord {
  const stageRuns = pipeline
    ? pipeline.stages.map((stage) => ({
        id: `${active.runID}:${stage.id}`,
        stageID: stage.id,
        stageName: stage.name,
        stepRuns: stage.steps.map((step) => ({
          id: `${active.runID}:${step.id}`,
          stepID: step.id,
          stepName: step.name,
          status: active.stepStatuses[step.id] ?? 'pending',
          output: active.stepOutputs[step.id],
          rawOutput: active.stepOutputs[step.id],
          agentFeed: active.stepAgentFeeds?.[step.id],
          retryRecords: active.stepRetryRecords[step.id],
          maxAttempts: active.stepRetryMaxAttempts[step.id],
        })),
      }))
    : [
        {
          id: `active-${active.runID}`,
          stageID: 'active',
          stageName: 'Active',
          stepRuns: Object.entries(active.stepStatuses).map(([stepID, status]) => ({
            id: `${active.runID}:${stepID}`,
            stepID,
            stepName: stepID,
            status,
            output: active.stepOutputs[stepID],
            rawOutput: active.stepOutputs[stepID],
            agentFeed: active.stepAgentFeeds?.[stepID],
            retryRecords: active.stepRetryRecords[stepID],
            maxAttempts: active.stepRetryMaxAttempts[stepID],
          })),
        },
      ];

  return {
    id: active.runID,
    startedAt: active.startedAt ?? new Date(0).toISOString(),
    status: 'running',
    triggerType: active.triggerType ?? 'manual',
    stageRuns,
  };
}
