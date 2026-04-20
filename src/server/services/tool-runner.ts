import type {
  PipelineStep,
  ToolType,
} from '../../domain/pipeline.js';
import type { CLIProfile } from '../../domain/settings.js';
import type { RetryRecord, AgentStreamUiEvent } from '../../domain/run.js';
import { buildToolArguments, normalizeCursorModelForCLI, profileConfigForTool } from '../../domain/pipeline.js';
import { CLIRunner } from './cli-runner.js';
import { createCliStreamPresenter } from './cli-output/factory.js';

export interface StepResult {
  stepID: string;
  exitCode: number;
  output: string;
  error: string;
  cancelledByUser: boolean;
  retryRecords?: RetryRecord[];
  totalAttempts?: number;
  reviewResult?: 'accepted' | 'rejected';
}

export function stepResultSucceeded(r: StepResult): boolean {
  return r.exitCode === 0;
}

export function stepResultFailed(r: StepResult): boolean {
  return !stepResultSucceeded(r) && !r.cancelledByUser;
}

export function stepResultDisplayOutput(r: StepResult): string {
  const trimOut = r.output.trim();
  const trimErr = r.error.trim();
  if (!trimOut) return trimErr;
  if (!trimErr || trimOut.includes('[STDERR]')) return trimOut;
  return `${trimOut}\n\n[STDERR]\n${trimErr}`;
}

export interface ToolRunnerInterface {
  toolType: ToolType;
  execute(
    step: PipelineStep,
    workingDirectory: string,
    profile: CLIProfile,
    shouldTerminate?: () => boolean,
    onOutputChunk?: (chunk: string) => void,
    ptyDims?: { cols: number; rows: number },
    onAgentStreamEvent?: (e: AgentStreamUiEvent) => void
  ): Promise<StepResult>;
}

function makeToolRunner(tool: ToolType): ToolRunnerInterface {
  const cli = new CLIRunner();
  return {
    toolType: tool,
    async execute(step, workingDirectory, profile, shouldTerminate, onOutputChunk, ptyDims, onAgentStreamEvent) {
      const config = profileConfigForTool(profile, tool);
      const args = buildToolArguments(
        config,
        step.prompt,
        normalizeCursorModelForCLI(step.model, step.tool),
        workingDirectory
      );

      const usePTY = !step.command;

      const streamWrap = createCliStreamPresenter(
        onOutputChunk,
        { tool, args, workingDirectory },
        onAgentStreamEvent
      );

      const result = usePTY
        ? await cli.runPTY({
            command: config.executable,
            args,
            workingDirectory,
            stdinData: config.promptMode === 'stdin' ? step.prompt : undefined,
            timeout: profile.stepTimeout || 1800,
            shouldTerminate,
            onOutputChunk: streamWrap ? streamWrap.onChunk : onOutputChunk,
            cols: ptyDims?.cols,
            rows: ptyDims?.rows,
          })
        : await cli.run({
            command: config.executable,
            args,
            workingDirectory,
            stdinData: config.promptMode === 'stdin' ? step.prompt : undefined,
            timeout: profile.stepTimeout || 1800,
            shouldTerminate,
            onOutputChunk: streamWrap ? streamWrap.onChunk : onOutputChunk,
          });

      const stdout = streamWrap ? streamWrap.finish(result.stdout) : result.stdout;

      return {
        stepID: step.id,
        exitCode: result.exitCode,
        output: stdout,
        error: result.stderr,
        cancelledByUser: false,
      };
    },
  };
}

export const codexRunner = makeToolRunner('codex');
export const claudeRunner = makeToolRunner('claude');
export const cursorRunner = makeToolRunner('cursor');

export function getRunnerForTool(tool: ToolType): ToolRunnerInterface {
  switch (tool) {
    case 'codex': return codexRunner;
    case 'claude': return claudeRunner;
    case 'cursor': return cursorRunner;
  }
  throw new Error(`Unsupported tool: ${tool satisfies never}`);
}
