import type {
  PipelineStep,
  CLIProfile,
  ToolType,
  RetryRecord,
} from '../../shared/types.js';
import { buildToolArguments, normalizeCursorModelForCLI, profileConfigForTool } from '../../shared/types.js';
import { CLIRunner, type CLIResult } from './cli-runner.js';

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
    ptyDims?: { cols: number; rows: number }
  ): Promise<StepResult>;
}

function makeToolRunner(tool: ToolType): ToolRunnerInterface {
  const cli = new CLIRunner();
  return {
    toolType: tool,
    async execute(step, workingDirectory, profile, shouldTerminate, onOutputChunk, ptyDims) {
      const config = profileConfigForTool(profile, tool);
      const args = buildToolArguments(
        config,
        step.prompt,
        normalizeCursorModelForCLI(step.model, step.tool),
        workingDirectory
      );

      // Use PTY for agent tools (no custom command) so output streams in
      // real time with full terminal rendering (colors, progress, etc.)
      const usePTY = !step.command;

      const result = usePTY
        ? await cli.runPTY({
            command: config.executable,
            args,
            workingDirectory,
            stdinData: config.promptMode === 'stdin' ? step.prompt : undefined,
            timeout: profile.stepTimeout || 1800,
            shouldTerminate,
            onOutputChunk,
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
            onOutputChunk,
          });

      return {
        stepID: step.id,
        exitCode: result.exitCode,
        output: result.stdout,
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
}
