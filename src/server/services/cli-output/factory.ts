import type { AgentStreamUiEvent } from '../../../domain/run.js';
import type { ToolType } from '../../../domain/pipeline.js';
import {
  commandLineUsesClaudeStreamJson,
  createClaudeStreamJsonWrapper,
  shouldPrettifyClaudeStreamJson,
} from './claude-presenter.js';
import {
  commandLineUsesCodexJson,
  createCodexStreamJsonWrapper,
  shouldPrettifyCodexJson,
} from './codex-presenter.js';
import {
  commandLineUsesCursorStreamJson,
  createCursorStreamJsonWrapper,
  shouldPrettifyCursorStreamJson,
} from './cursor-presenter.js';
import type { CliStreamPresenterHandle } from './types.js';

export type CliPresenterToolContext = {
  tool: ToolType;
  /** Built argv when available (default tool steps). */
  args?: string[];
  /** Resolved shell command when running via CommandRunner. */
  commandLine?: string;
  /** Repo/step cwd — Cursor presenter uses this to attach `git diff` after edit tools. */
  workingDirectory?: string;
};

/**
 * Returns a stream wrapper for JSONL agent CLIs, or null to pass raw chunks through.
 * When `onUiEvent` is set, parsed events are emitted for the React activity feed (OpenClaw-style).
 */
export function createCliStreamPresenter(
  onOutputChunk: ((s: string) => void) | undefined,
  ctx: CliPresenterToolContext,
  onUiEvent?: (e: AgentStreamUiEvent) => void
): CliStreamPresenterHandle | null {
  if (!onOutputChunk && !onUiEvent) return null;

  const args = ctx.args ?? [];
  const line = ctx.commandLine ?? '';

  if (ctx.tool === 'cursor') {
    if (shouldPrettifyCursorStreamJson(args) || commandLineUsesCursorStreamJson(line)) {
      return createCursorStreamJsonWrapper(onOutputChunk, onUiEvent, {
        workingDirectory: ctx.workingDirectory,
      });
    }
  }
  if (ctx.tool === 'claude') {
    if (shouldPrettifyClaudeStreamJson(args) || commandLineUsesClaudeStreamJson(line)) {
      return createClaudeStreamJsonWrapper(onOutputChunk, onUiEvent);
    }
  }
  if (ctx.tool === 'codex') {
    if (shouldPrettifyCodexJson(args) || commandLineUsesCodexJson(line)) {
      return createCodexStreamJsonWrapper(onOutputChunk, onUiEvent);
    }
  }

  return null;
}
