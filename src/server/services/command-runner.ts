import type { PipelineStep, CLIProfile } from '../../shared/types.js';
import {
  stepHasCustomCommand,
  profileConfigForTool,
  buildCommandTemplate,
  normalizeCursorModelForCLI,
} from '../../shared/types.js';
import { CLIRunner, CLIError } from './cli-runner.js';
import type { StepResult } from './tool-runner.js';

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function effectiveCommand(step: PipelineStep, profile: CLIProfile): string {
  const trimmed = step.command?.trim() || '';
  if (trimmed) return trimmed;
  const config = profileConfigForTool(profile, step.tool);
  return buildCommandTemplate(config, normalizeCursorModelForCLI(step.model, step.tool));
}

async function resolveExecutablePath(executable: string, cli: CLIRunner): Promise<string | null> {
  try {
    const result = await cli.run({
      command: 'zsh',
      args: ['-lc', `command -v ${shellQuote(executable)} 2>/dev/null`],
      timeout: 10,
    });
    const lines = result.stdout.split('\n').map((l) => l.trim());
    const path = lines.reverse().find((l) => l.startsWith('/'));
    return path || null;
  } catch {
    return null;
  }
}

function leadingExecutable(commandLine: string): string | null {
  const trimmed = commandLine.trim();
  if (!trimmed) return null;
  const token = trimmed.split(/\s/)[0];
  if (!token || token.includes('/')) return null;
  return token;
}

export class CommandRunner {
  private cli = new CLIRunner();

  async execute(
    step: PipelineStep,
    workingDirectory: string,
    profile: CLIProfile,
    shouldTerminate?: () => boolean,
    onOutputChunk?: (chunk: string) => void
  ): Promise<StepResult> {
    const commandLine = effectiveCommand(step, profile);
    if (!commandLine) {
      throw new CLIError('PROCESS_ERROR', 'Step command is empty');
    }

    const prompt = step.prompt;
    let stdinData: string | undefined;
    let finalCommand: string;

    if (commandLine.includes('{{prompt}}')) {
      finalCommand = commandLine.replace(/\{\{prompt\}\}/g, shellQuote(prompt));
      stdinData = undefined;
    } else {
      finalCommand = commandLine;
      stdinData = prompt || undefined;
    }

    const exe = leadingExecutable(finalCommand);
    const allExes = new Set([
      profile.cursor.executable,
      profile.codex.executable,
      profile.claude.executable,
      profile.planner.executable,
    ]);

    if (exe && allExes.has(exe)) {
      const resolved = await resolveExecutablePath(exe, this.cli);
      if (resolved) {
        finalCommand = finalCommand.replace(exe, shellQuote(resolved));
      }
    }

    const result = await this.cli.run({
      command: 'zsh',
      args: ['-lc', finalCommand],
      workingDirectory,
      stdinData,
      shouldTerminate,
      onOutputChunk,
    });

    let output: string;
    if (result.exitCode !== 0) {
      const stdout = result.stdout.trim();
      const stderr = result.stderr.trim();
      output = [
        'Command failed.',
        '',
        `[Original Command]`,
        commandLine,
        '',
        `[Executed Command]`,
        finalCommand,
        '',
        `[Working Directory]`,
        workingDirectory,
        '',
        `[Exit Code]`,
        String(result.exitCode),
        '',
        `[STDOUT]`,
        stdout || '(empty)',
        '',
        `[STDERR]`,
        stderr || '(empty)',
      ].join('\n');
    } else {
      output = result.stdout;
    }

    const stderr = result.stderr.trim();
    const error =
      result.exitCode === 0
        ? stderr
        : stderr || `Command exited with code ${result.exitCode}`;

    return {
      stepID: step.id,
      exitCode: result.exitCode,
      output,
      error,
      cancelledByUser: false,
    };
  }
}
