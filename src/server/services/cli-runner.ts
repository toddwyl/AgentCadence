import { spawn, ChildProcess, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as pty from 'node-pty';

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
    // Non-interactive login shell only: `-i` can hang or fail when stdin is not a TTY (GUI-launched server).
    const result = execSync(`${shell} -l -c 'printf %s "$PATH"'`, {
      timeout: 8000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
})();

/** Prepended so posix_spawnp finds Homebrew/user tools when Node was started from Cursor/GUI (minimal PATH). */
const DARWIN_FALLBACK_PATH =
  '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin';

const POSIX_FALLBACK_PATH = '/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin';

/** User-local install dirs (uv/pip/npm --prefix ~/.local, cargo, etc.) — often missing from GUI-launched Node PATH. */
function userLocalBinPrefix(): string {
  if (process.platform === 'win32') return '';
  const h = os.homedir();
  return [path.join(h, '.local', 'bin'), path.join(h, '.cargo', 'bin')].join(':');
}

function getEffectivePATH(): string {
  let base = process.env.PATH || '';
  base = mergePaths(userLocalBinPrefix(), base);
  if (process.platform === 'darwin') {
    base = mergePaths(DARWIN_FALLBACK_PATH, base);
  } else if (process.platform !== 'win32') {
    base = mergePaths(POSIX_FALLBACK_PATH, base);
  }
  return userShellPATH ? mergePaths(userShellPATH, base) : base;
}

function getSearchPATH(): string {
  return getEffectivePATH();
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

/** node-pty / native spawn can choke on undefined env values; only pass real strings. */
function sanitizeEnv(src: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(src)) {
    const val = src[key];
    if (typeof val === 'string') {
      out[key] = val;
    }
  }
  return out;
}

function buildEnvironment(extra?: Record<string, string>): Record<string, string> {
  const env = sanitizeEnv(process.env);
  env.PATH = getEffectivePATH();
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (typeof v === 'string') {
        env[k] = v;
      }
    }
    if (typeof extra.PATH === 'string' && extra.PATH.length > 0) {
      env.PATH = mergePaths(extra.PATH, env.PATH);
    }
  }
  return env;
}

function assertDirectoryAccessible(cwd: string): void {
  let st: fs.Stats;
  try {
    st = fs.statSync(cwd);
  } catch {
    throw new CLIError(
      'PROCESS_ERROR',
      `Working directory does not exist or is not accessible: ${cwd}`
    );
  }
  if (!st.isDirectory()) {
    throw new CLIError('PROCESS_ERROR', `Working directory is not a directory: ${cwd}`);
  }
}

/** Prefer /bin/zsh etc. so spawn works even if PATH is still too short for basename lookup. */
function preferAbsoluteShell(command: string, resolved: string): string {
  if (process.platform === 'win32') return resolved;
  if (path.isAbsolute(resolved)) return resolved;
  const candidates: Record<string, string[]> = {
    zsh: ['/bin/zsh', '/usr/bin/zsh', '/usr/local/bin/zsh'],
    bash: ['/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash'],
    sh: ['/bin/sh', '/usr/bin/sh'],
  };
  const list = candidates[command];
  if (!list) return resolved;
  for (const c of list) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {
      /* try next */
    }
  }
  return resolved;
}

function resolvePtyFile(command: string): string {
  const resolved = preferAbsoluteShell(command, resolveExecutable(command));
  if (!path.isAbsolute(resolved)) return resolved;
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM') {
  try {
    process.kill(-pid, signal);
  } catch {
    try { process.kill(pid, signal); } catch { /* already dead */ }
  }
}

/** Default PTY size when client has not supplied cols/rows (matches former pty-wrapper defaults). */
export const DEFAULT_PTY_COLS = 120;
export const DEFAULT_PTY_ROWS = 40;

export interface RunOptions {
  command: string;
  args?: string[];
  workingDirectory?: string;
  stdinData?: string;
  environment?: Record<string, string>;
  timeout?: number;
  shouldTerminate?: () => boolean;
  onOutputChunk?: (chunk: string) => void;
  /** Pseudoterminal width/height in characters (node-pty); should match browser FitAddon when possible. */
  cols?: number;
  rows?: number;
}

export class CLIRunner {
  async run(opts: RunOptions): Promise<CLIResult> {
    const {
      command,
      args = [],
      workingDirectory,
      stdinData,
      environment,
      timeout = 1800,
      shouldTerminate,
      onOutputChunk,
    } = opts;

    return new Promise((resolve, reject) => {
      let proc: ChildProcess;
      const resolvedCwd = workingDirectory
        ? (workingDirectory.startsWith('~') ? path.join(os.homedir(), workingDirectory.slice(1)) : workingDirectory)
        : process.cwd();

      assertDirectoryAccessible(resolvedCwd);

      const resolvedCommand = preferAbsoluteShell(command, resolveExecutable(command));

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

  /**
   * Run a command inside a real PTY (node-pty) so that tools like cursor-agent
   * stream output in real time with ANSI escape codes. Output is relayed through ghostty-web on the frontend.
   */
  async runPTY(opts: RunOptions): Promise<CLIResult> {
    const {
      command,
      args = [],
      workingDirectory,
      stdinData,
      environment,
      timeout = 1800,
      shouldTerminate,
      onOutputChunk,
      cols = DEFAULT_PTY_COLS,
      rows = DEFAULT_PTY_ROWS,
    } = opts;

    const resolvedCwd = workingDirectory
      ? (workingDirectory.startsWith('~') ? path.join(os.homedir(), workingDirectory.slice(1)) : workingDirectory)
      : process.cwd();

    assertDirectoryAccessible(resolvedCwd);

    const resolvedCommand = resolvePtyFile(command);
    if (path.isAbsolute(resolvedCommand) && !fs.existsSync(resolvedCommand)) {
      throw new CLIError(
        'PROCESS_ERROR',
        `Executable not found: ${resolvedCommand}（请在设置中核对路径或重启服务以重新自动检测）`
      );
    }

    const spawnOpts = {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: resolvedCwd,
      env: buildEnvironment({
        PYTHONUNBUFFERED: '1',
        ...environment,
      }),
    };

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(resolvedCommand, args, spawnOpts);
    } catch (err: unknown) {
      const msg = (err as Error).message || String(err);
      const hint =
        /posix_spawn|spawn\s*failed|ENOENT/i.test(msg)
          ? ' 请确认已执行 npm install（postinstall 会为 node-pty 的 spawn-helper 添加可执行权限），或在「设置」中为 CLI 填写绝对路径并保证可执行。'
          : '';
      throw new CLIError('PROCESS_ERROR', msg + hint);
    }

    return new Promise((resolve, reject) => {
      let stdoutBuf = '';
      let killed = false;
      let killReason: 'timeout' | 'cancelled' | null = null;
      let settled = false;

      /** Tools (e.g. cursor-agent) may block-buffer when output is sparse; flush periodically so WS/UI update. */
      let pendingEmit = '';
      let flushEmitTimer: ReturnType<typeof setTimeout> | null = null;
      const flushMs = Math.max(
        16,
        Math.min(500, Number(process.env.AGENTCADENCE_PTY_FLUSH_MS || 50))
      );

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      const flushEmit = () => {
        if (flushEmitTimer !== null) {
          clearTimeout(flushEmitTimer);
          flushEmitTimer = null;
        }
        if (!pendingEmit) return;
        const chunk = pendingEmit;
        pendingEmit = '';
        onOutputChunk?.(chunk);
      };

      const scheduleFlushEmit = () => {
        if (flushEmitTimer !== null) return;
        flushEmitTimer = setTimeout(() => {
          flushEmitTimer = null;
          flushEmit();
        }, flushMs);
      };

      const dataDisp = ptyProcess.onData((data: string) => {
        stdoutBuf += data;
        pendingEmit += data;
        if (/\r|\n/.test(data)) {
          flushEmit();
        } else {
          scheduleFlushEmit();
        }
      });

      if (stdinData) {
        try {
          ptyProcess.write(stdinData);
        } catch {
          /* ignore */
        }
      }

      const doKill = (reason: 'timeout' | 'cancelled') => {
        if (killed) return;
        killed = true;
        killReason = reason;
        flushEmit();
        try {
          if (process.platform === 'win32') {
            ptyProcess.kill();
          } else {
            ptyProcess.kill('SIGTERM');
          }
        } catch {
          try {
            killProcessTree(ptyProcess.pid);
          } catch {
            /* ignore */
          }
        }
      };

      const timeoutMs = timeout * 1000;
      const timer = setTimeout(() => doKill('timeout'), timeoutMs);

      let pollTimer: ReturnType<typeof setInterval> | null = null;
      if (shouldTerminate) {
        pollTimer = setInterval(() => {
          if (shouldTerminate()) doKill('cancelled');
        }, 200);
      }

      const exitDisp = ptyProcess.onExit(({ exitCode, signal }) => {
        flushEmit();
        dataDisp.dispose();
        exitDisp.dispose();
        clearTimeout(timer);
        if (pollTimer) clearInterval(pollTimer);

        if (killReason === 'timeout') {
          finish(() => reject(new CLIError('TIMEOUT', 'Process timed out')));
          return;
        }
        if (killReason === 'cancelled') {
          finish(() => reject(new CLIError('CANCELLED', 'Process cancelled')));
          return;
        }

        let code = exitCode;
        if (code === undefined || code === null) {
          code = signal ? 128 + signal : -1;
        }
        finish(() =>
          resolve({
            exitCode: code,
            stdout: stdoutBuf,
            stderr: '',
            succeeded: code === 0,
          })
        );
      });
    });
  }

}
