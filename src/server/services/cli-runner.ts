import { spawn, ChildProcess, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface CLIResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  succeeded: boolean;
}

export class CLIError extends Error {
  constructor(
    public code: 'COMMAND_NOT_FOUND' | 'TIMEOUT' | 'CANCELLED' | 'PROCESS_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

const userShellPATH: string | null = (() => {
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const result = execSync(`${shell} -l -i -c "echo $PATH"`, {
      timeout: 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
})();

function getSearchPATH(): string {
  const base = process.env.PATH || '';
  return userShellPATH ? mergePaths(userShellPATH, base) : base;
}

function mergePaths(primary: string, secondary: string): string {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of `${primary}:${secondary}`.split(':')) {
    if (p && !seen.has(p)) {
      seen.add(p);
      result.push(p);
    }
  }
  return result.join(':');
}

function resolveExecutable(command: string): string {
  if (path.isAbsolute(command)) return command;

  const searchPath = getSearchPATH();
  for (const dir of searchPath.split(':')) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* not found here */ }
  }
  return command;
}

function buildEnvironment(extra?: Record<string, string>): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  if (userShellPATH) {
    env.PATH = mergePaths(userShellPATH, env.PATH || '');
  }
  if (extra) Object.assign(env, extra);
  return env;
}

function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM') {
  try {
    process.kill(-pid, signal);
  } catch {
    try { process.kill(pid, signal); } catch { /* already dead */ }
  }
}

export interface RunOptions {
  command: string;
  args?: string[];
  workingDirectory?: string;
  stdinData?: string;
  environment?: Record<string, string>;
  timeout?: number;
  shouldTerminate?: () => boolean;
  onOutputChunk?: (chunk: string) => void;
}

export class CLIRunner {
  async run(opts: RunOptions): Promise<CLIResult> {
    const {
      command,
      args = [],
      workingDirectory,
      stdinData,
      environment,
      timeout = 600,
      shouldTerminate,
      onOutputChunk,
    } = opts;

    return new Promise((resolve, reject) => {
      let proc: ChildProcess;
      const resolvedCwd = workingDirectory
        ? (workingDirectory.startsWith('~') ? path.join(os.homedir(), workingDirectory.slice(1)) : workingDirectory)
        : process.cwd();

      const resolvedCommand = resolveExecutable(command);

      try {
        proc = spawn(resolvedCommand, args, {
          cwd: resolvedCwd,
          env: buildEnvironment(environment),
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          detached: true,
        });
      } catch (err: unknown) {
        reject(new CLIError('PROCESS_ERROR', (err as Error).message));
        return;
      }

      let stdoutBuf = '';
      let stderrBuf = '';
      let killed = false;
      let killReason: 'timeout' | 'cancelled' | null = null;

      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdoutBuf += chunk;
        onOutputChunk?.(chunk);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderrBuf += chunk;
        onOutputChunk?.(chunk);
      });

      if (stdinData) {
        proc.stdin?.write(stdinData);
        proc.stdin?.end();
      } else {
        proc.stdin?.end();
      }

      proc.unref();

      const doKill = (reason: 'timeout' | 'cancelled') => {
        if (killed) return;
        killed = true;
        killReason = reason;
        if (proc.pid) killProcessTree(proc.pid);
      };

      const timeoutMs = timeout * 1000;
      const timer = setTimeout(() => doKill('timeout'), timeoutMs);

      let pollTimer: ReturnType<typeof setInterval> | null = null;
      if (shouldTerminate) {
        pollTimer = setInterval(() => {
          if (shouldTerminate()) doKill('cancelled');
        }, 200);
      }

      proc.on('error', (err) => {
        clearTimeout(timer);
        if (pollTimer) clearInterval(pollTimer);
        reject(new CLIError('PROCESS_ERROR', err.message));
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (pollTimer) clearInterval(pollTimer);

        if (killReason === 'timeout') {
          reject(new CLIError('TIMEOUT', 'Process timed out'));
          return;
        }
        if (killReason === 'cancelled') {
          reject(new CLIError('CANCELLED', 'Process cancelled'));
          return;
        }

        resolve({
          exitCode: code ?? -1,
          stdout: stdoutBuf,
          stderr: stderrBuf,
          succeeded: code === 0,
        });
      });
    });
  }
}
