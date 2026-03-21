import type {
  Pipeline,
  PipelineStep,
  StepStatus,
  CLIProfile,
  RetryRecord,
} from '../../shared/types.js';
import { resolveAllSteps, stepHasCustomCommand, interpolatePromptVariables } from '../../shared/types.js';
import type { StepResult } from './tool-runner.js';
import { getRunnerForTool } from './tool-runner.js';
import { CommandRunner } from './command-runner.js';
import { CLIError } from './cli-runner.js';

export class SchedulerError extends Error {
  constructor(
    public code: 'CYCLIC_DEPENDENCY' | 'STEP_FAILED' | 'CANCELLED',
    message: string,
    public failedResult?: StepResult
  ) {
    super(message);
    this.name = 'SchedulerError';
  }
}

export class ExecutionControl {
  private pipelineStopRequested = false;
  private stoppedStageIDs = new Set<string>();

  requestPipelineStop() { this.pipelineStopRequested = true; }
  requestStageStop(stageID: string) { this.stoppedStageIDs.add(stageID); }
  isPipelineStopRequested() { return this.pipelineStopRequested; }
  isStageStopRequested(stageID: string) { return this.stoppedStageIDs.has(stageID); }
  shouldTerminateStep(stageID: string) {
    return this.pipelineStopRequested || this.stoppedStageIDs.has(stageID);
  }
}

function validateDAG(steps: ReturnType<typeof resolveAllSteps>) {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const s of steps) {
    if (!inDegree.has(s.step.id)) inDegree.set(s.step.id, 0);
    for (const dep of s.allDependencies) {
      if (!adjacency.has(dep)) adjacency.set(dep, []);
      adjacency.get(dep)!.push(s.step.id);
      inDegree.set(s.step.id, (inDegree.get(s.step.id) || 0) + 1);
    }
  }

  const queue = steps.filter((s) => (inDegree.get(s.step.id) || 0) === 0).map((s) => s.step.id);
  let visited = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const neighbor of adjacency.get(node) || []) {
      const deg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  if (visited !== steps.length) {
    throw new SchedulerError('CYCLIC_DEPENDENCY', 'Pipeline contains cyclic dependencies');
  }
}

function resolveStepWithVariables(
  step: PipelineStep,
  globalVariables: Record<string, string>
): PipelineStep {
  const vars = globalVariables ?? {};
  return {
    ...step,
    prompt: interpolatePromptVariables(step.prompt, vars),
    command: step.command ? interpolatePromptVariables(step.command, vars) : undefined,
  };
}

async function executeStep(
  step: PipelineStep,
  stageID: string,
  workingDirectory: string,
  profile: CLIProfile,
  executionControl: ExecutionControl | null,
  onOutputChunk: (chunk: string) => void,
  globalVariables: Record<string, string>
): Promise<StepResult> {
  const resolved = resolveStepWithVariables(step, globalVariables);
  const shouldTerminate = executionControl
    ? () => executionControl.shouldTerminateStep(stageID)
    : undefined;

  try {
    if (stepHasCustomCommand(resolved)) {
      return await new CommandRunner().execute(
        resolved, workingDirectory, profile, shouldTerminate, onOutputChunk
      );
    }
    const runner = getRunnerForTool(resolved.tool);
    return await runner.execute(
      resolved, workingDirectory, profile, shouldTerminate, onOutputChunk
    );
  } catch (err) {
    if (err instanceof CLIError && err.code === 'CANCELLED') {
      return {
        stepID: resolved.id,
        exitCode: 130,
        output: '',
        error: 'Stopped by user',
        cancelledByUser: true,
      };
    }
    return {
      stepID: resolved.id,
      exitCode: -1,
      output: '',
      error: (err as Error).message,
      cancelledByUser: false,
    };
  }
}

function effectiveMaxAttempts(step: PipelineStep): number {
  const failureMode = step.failureMode ?? 'retry';
  if (failureMode === 'skip' || failureMode === 'stop') return 1;
  const raw = step.retryCount;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(50, Math.floor(n));
}

async function executeStepWithRetry(
  step: PipelineStep,
  stageID: string,
  workingDirectory: string,
  profile: CLIProfile,
  executionControl: ExecutionControl | null,
  onOutputChunk: (chunk: string) => void,
  onRetryProgress?: (
    stepID: string,
    retryRecords: RetryRecord[],
    failedAttempt: number,
    maxAttempts: number
  ) => void,
  globalVariables: Record<string, string> = {}
): Promise<StepResult> {
  const failureMode = step.failureMode ?? 'retry';
  const maxAttempts = effectiveMaxAttempts(step);

  const retryRecords: RetryRecord[] = [];
  let lastResult: StepResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await executeStep(
      step,
      stageID,
      workingDirectory,
      profile,
      executionControl,
      onOutputChunk,
      globalVariables
    );

    if (result.exitCode === 0 || result.cancelledByUser) {
      return {
        ...result,
        retryRecords: retryRecords.length > 0 ? retryRecords : undefined,
        totalAttempts: attempt,
      };
    }

    lastResult = result;
    retryRecords.push({
      attempt,
      error: result.error,
      timestamp: new Date().toISOString(),
    });

    onRetryProgress?.(step.id, [...retryRecords], attempt, maxAttempts);

    if (attempt < maxAttempts) {
      onOutputChunk(
        `\n⟳ Attempt ${attempt}/${maxAttempts} failed — retrying (${attempt + 1}/${maxAttempts})…\nPrevious error: ${result.error}\n\n`
      );
    }
  }

  return {
    stepID: step.id,
    exitCode: -1,
    output: lastResult?.output ?? '',
    error: lastResult?.error ?? `Step failed after ${maxAttempts} attempt(s)`,
    cancelledByUser: false,
    retryRecords: retryRecords.length > 0 ? retryRecords : undefined,
    totalAttempts: maxAttempts,
  };
}

export class DAGScheduler {
  async executePipeline(
    pipeline: Pipeline,
    profile: CLIProfile,
    executionControl: ExecutionControl | null = null,
    onStepStatusChanged: (stepID: string, status: StepStatus) => void,
    onStepOutput: (stepID: string, output: string) => void,
    onRetryProgress?: (
      stepID: string,
      retryRecords: RetryRecord[],
      failedAttempt: number,
      maxAttempts: number
    ) => void
  ): Promise<StepResult[]> {
    const allSteps = resolveAllSteps(pipeline);
    validateDAG(allSteps);

    const stepsByID = new Map(allSteps.map((r) => [r.step.id, r.step]));
    const finalizedStatuses = new Map<string, StepStatus>();
    const allResults: StepResult[] = [];
    const workDir = pipeline.workingDirectory;
    const globalVariables = pipeline.globalVariables ?? {};

    while (finalizedStatuses.size < allSteps.length) {
      if (executionControl?.isPipelineStopRequested()) {
        for (const r of allSteps) {
          if (!finalizedStatuses.has(r.step.id)) {
            finalizedStatuses.set(r.step.id, 'skipped');
            onStepStatusChanged(r.step.id, 'skipped');
          }
        }
        throw new SchedulerError('CANCELLED', 'Pipeline execution was cancelled');
      }

      const ready = allSteps.filter((r) =>
        !finalizedStatuses.has(r.step.id) &&
        [...r.allDependencies].every((d) => finalizedStatuses.has(d))
      );

      if (ready.length === 0) {
        throw new SchedulerError('CYCLIC_DEPENDENCY', 'Pipeline contains cyclic dependencies');
      }

      const wave: typeof ready = [];
      let skippedAny = false;

      for (const resolved of ready) {
        if (executionControl?.isStageStopRequested(resolved.stageID)) {
          finalizedStatuses.set(resolved.step.id, 'skipped');
          onStepStatusChanged(resolved.step.id, 'skipped');
          skippedAny = true;
          continue;
        }

        const blockedByDep = [...resolved.allDependencies].some((depID) => {
          const depStatus = finalizedStatuses.get(depID) || 'pending';
          return depStatus !== 'completed';
        });

        if (blockedByDep) {
          finalizedStatuses.set(resolved.step.id, 'skipped');
          onStepStatusChanged(resolved.step.id, 'skipped');
          skippedAny = true;
          continue;
        }

        wave.push(resolved);
      }

      if (wave.length === 0) {
        if (skippedAny) continue;
        throw new SchedulerError('CYCLIC_DEPENDENCY', 'Pipeline contains cyclic dependencies');
      }

      for (const r of wave) {
        onStepStatusChanged(r.step.id, 'running');
      }

      const waveResults = await Promise.all(
        wave.map((resolved) =>
          executeStepWithRetry(
            resolved.step,
            resolved.stageID,
            workDir,
            profile,
            executionControl,
            (chunk) => onStepOutput(resolved.step.id, chunk),
            onRetryProgress,
            globalVariables
          )
        )
      );

      let shouldStop = false;
      for (const result of waveResults) {
        allResults.push(result);

        if (result.cancelledByUser) {
          finalizedStatuses.set(result.stepID, 'skipped');
          onStepStatusChanged(result.stepID, 'skipped');
          continue;
        }

        if (result.exitCode !== 0) {
          const step = stepsByID.get(result.stepID);
          if (step?.failureMode === 'skip') {
            finalizedStatuses.set(result.stepID, 'skipped');
            onStepStatusChanged(result.stepID, 'skipped');
          } else {
            finalizedStatuses.set(result.stepID, 'failed');
            onStepStatusChanged(result.stepID, 'failed');
            shouldStop = true;
          }
        } else {
          finalizedStatuses.set(result.stepID, 'completed');
          onStepStatusChanged(result.stepID, 'completed');
        }
      }

      if (shouldStop) {
        for (const r of allSteps) {
          if (!finalizedStatuses.has(r.step.id)) {
            finalizedStatuses.set(r.step.id, 'skipped');
            onStepStatusChanged(r.step.id, 'skipped');
          }
        }
        const failed = waveResults.find((r) => r.exitCode !== 0 && !r.cancelledByUser);
        if (failed) {
          throw new SchedulerError(
            'STEP_FAILED',
            `Step failed (exit code ${failed.exitCode}): ${failed.error}`,
            failed
          );
        }
      }

      if (executionControl?.isPipelineStopRequested()) {
        for (const r of allSteps) {
          if (!finalizedStatuses.has(r.step.id)) {
            finalizedStatuses.set(r.step.id, 'skipped');
            onStepStatusChanged(r.step.id, 'skipped');
          }
        }
        throw new SchedulerError('CANCELLED', 'Pipeline execution was cancelled');
      }
    }

    return allResults;
  }
}
