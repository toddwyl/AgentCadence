import type {
  PipelineRunRecord,
  PipelineRunStatus,
  StageRunRecord,
  StepRunRecord,
  StepStatus,
} from '../../domain/run.js';

/**
 * Presentation helpers for shaping a pipeline run into an operator-grade
 * transcript. All functions return strings (or string[]) so callers (CLI today,
 * potentially other surfaces tomorrow) stay decoupled from console writes.
 */

export interface TranscriptHeaderInput {
  runId: string;
  pipelineName: string;
  pipelineId: string;
  workingDirectory?: string;
  triggerType?: string;
}

export interface TranscriptSummaryInput {
  runId: string;
  status: PipelineRunStatus;
  durationMs?: number;
  stageRuns?: StageRunRecord[];
  error?: string;
}

export type TranscriptView = 'pretty' | 'raw';

export interface StepChunkLine {
  stepName: string;
  line: string;
}

export function formatRunHeader(input: TranscriptHeaderInput): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push('========================================');
  lines.push(`AgentCadence · ${input.pipelineName}`);
  lines.push(`Run:        ${input.runId}`);
  lines.push(`Pipeline:   ${input.pipelineName} (${input.pipelineId})`);
  if (input.workingDirectory) {
    lines.push(`Workspace:  ${input.workingDirectory}`);
  }
  if (input.triggerType) {
    lines.push(`Trigger:    ${input.triggerType}`);
  }
  lines.push('========================================');
  lines.push('');
  return lines;
}

export function formatStageHeader(stageName: string): string[] {
  return [`▸ Stage: ${stageName}`];
}

export function formatStepStatus(step: StepRunRecord): string {
  const prefix = statusGlyph(step.status);
  const label = `${step.stepName} [${step.stepID}]`;
  switch (step.status) {
    case 'running':
      return `  ${prefix} ${label} ... running`;
    case 'completed':
      return `  ${prefix} ${label} ... completed${attemptSuffix(step)}`;
    case 'failed':
      return `  ${prefix} ${label} ... failed${attemptSuffix(step)}`;
    case 'skipped':
      return `  ${prefix} ${label} ... skipped`;
    case 'pending':
      return `  ${prefix} ${label} ... pending`;
    default: {
      const exhaustive: never = step.status;
      void exhaustive;
      return `  ${prefix} ${label} ... ${String(step.status)}`;
    }
  }
}

export function formatStepOutputLines(
  step: StepRunRecord,
  chunk: string,
  view: TranscriptView
): string[] {
  const lines = chunk.split(/\r?\n/).filter(Boolean);
  if (view === 'raw') {
    return lines.map((line) => `[${step.stepName}] ${line}`);
  }
  return lines.map((line) => `    │ ${line}`);
}

export function formatRunSummary(input: TranscriptSummaryInput): string[] {
  const stages = input.stageRuns ?? [];
  const steps = stages.flatMap((stage) => stage.stepRuns);
  const counts = {
    total: steps.length,
    completed: steps.filter((step) => step.status === 'completed').length,
    failed: steps.filter((step) => step.status === 'failed').length,
    skipped: steps.filter((step) => step.status === 'skipped').length,
  };

  const lines: string[] = [];
  lines.push('');
  lines.push('----------------------------------------');
  lines.push(`Run finished: ${input.status}${input.durationMs ? ` in ${formatDuration(input.durationMs)}` : ''}`);
  lines.push(
    `Steps: ${counts.completed}/${counts.total} completed · ${counts.failed} failed · ${counts.skipped} skipped`
  );
  if (input.error) {
    lines.push(`Error: ${input.error}`);
  }
  lines.push(`History: agentcadence history show ${input.runId}`);
  lines.push('----------------------------------------');
  return lines;
}

/**
 * Map a flat run record into an ordered list of stage-aware step events so
 * callers can render stage headers only when a stage actually progresses.
 */
export interface StepWithStage {
  stageId: string;
  stageName: string;
  step: StepRunRecord;
}

export function flattenStepsWithStage(run: PipelineRunRecord): StepWithStage[] {
  return run.stageRuns.flatMap((stage) =>
    stage.stepRuns.map((step) => ({
      stageId: stage.stageID,
      stageName: stage.stageName,
      step,
    }))
  );
}

function statusGlyph(status: StepStatus): string {
  switch (status) {
    case 'running':
      return '•';
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    case 'skipped':
      return '↷';
    case 'pending':
      return '·';
    default: {
      const exhaustive: never = status;
      void exhaustive;
      return '?';
    }
  }
}

function attemptSuffix(step: StepRunRecord): string {
  if (!step.totalAttempts || step.totalAttempts <= 1) return '';
  return ` (attempts: ${step.totalAttempts}${step.maxAttempts ? `/${step.maxAttempts}` : ''})`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
  const hours = Math.floor(minutes / 60);
  const minuteRemainder = minutes % 60;
  return minuteRemainder === 0 ? `${hours}h` : `${hours}h ${minuteRemainder}m`;
}
