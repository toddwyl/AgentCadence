/**
 * Codex CLI `codex exec --json` → terminal + {@link AgentStreamUiEvent}.
 * AGENTCADENCE_CODEX_RAW_JSON=1 disables prettify (pass-through).
 */

import type { AgentCommandAction } from '../../../contracts/events/agent-feed.js';
import type { AgentStreamUiEvent } from '../../../domain/run.js';
import { CYN, DIM, GRN, RST, YLW } from './ansi.js';
import { JsonlLineBuffer } from './jsonl-line-buffer.js';
import type { CliStreamPresenterHandle, TerminalEmit } from './types.js';

function itemType(item: Record<string, unknown>): string {
  const t = item.type ?? item.item_type;
  return typeof t === 'string' ? t : '';
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function pickStr(o: unknown, key: string): string | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const v = (o as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function previewFromUnknown(value: unknown, max = 400): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? truncate(trimmed, max) : undefined;
}

function commandActionsFromUnknown(value: unknown): AgentCommandAction[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const actions = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    const type = raw.type;
    const command = typeof raw.command === 'string' ? truncate(raw.command, 400) : '';
    if (!command || (type !== 'read' && type !== 'listFiles' && type !== 'search' && type !== 'unknown')) {
      return [];
    }
    return [{
      type:
        type === 'listFiles'
          ? 'list_files'
          : type,
      command,
      path: typeof raw.path === 'string' ? truncate(raw.path, 180) : undefined,
      query: typeof raw.query === 'string' ? truncate(raw.query, 180) : undefined,
      name: typeof raw.name === 'string' ? truncate(raw.name, 180) : undefined,
    } satisfies AgentCommandAction];
  });
  return actions.length > 0 ? actions : undefined;
}

class CodexJsonPrettifier {
  private lines = new JsonlLineBuffer();
  private lastAgentTextChunk = '';
  private lastAgentSnapshot = '';

  constructor(private readonly onUiEvent?: (e: AgentStreamUiEvent) => void) {}

  private ui(e: AgentStreamUiEvent): void {
    this.onUiEvent?.(e);
  }

  push(raw: string, emit: TerminalEmit): void {
    this.lines.push(raw, (line) => this.emitOneLine(line, emit));
  }

  flush(emit: TerminalEmit): void {
    this.lines.flush((line) => this.emitOneLine(line, emit));
  }

  private emitAgentText(text: string, emit: TerminalEmit): void {
    if (!text) return;
    if (text === this.lastAgentTextChunk) return;
    let delta = text;
    if (this.lastAgentSnapshot && text.startsWith(this.lastAgentSnapshot)) {
      delta = text.slice(this.lastAgentSnapshot.length);
    } else if (this.lastAgentSnapshot && text.length < this.lastAgentSnapshot.length) {
      this.lastAgentSnapshot = '';
    }
    this.lastAgentSnapshot = text;
    this.lastAgentTextChunk = text;
    if (delta) {
      emit(delta);
      this.ui({ kind: 'assistant_delta', text: delta });
    }
  }

  private emitItem(
    phase: string,
    item: Record<string, unknown> | undefined,
    emit: TerminalEmit
  ): void {
    if (!item || typeof item !== 'object') return;
    const it = itemType(item as Record<string, unknown>);
    if (it === 'reasoning') {
      const tx =
        (typeof item.text === 'string' && item.text) ||
        (Array.isArray(item.summary) ? item.summary.join('\n') : '') ||
        (Array.isArray(item.content) ? item.content.join('\n') : '');
      if (tx.trim()) {
        this.ui({ kind: 'reasoning_delta', text: truncate(tx, 4000) });
        emit(`${DIM}⋯ ${truncate(tx, 200)}${RST}\n`);
      }
      return;
    }
    if (it === 'command_execution') {
      const cmd = typeof item.command === 'string' ? item.command : 'shell';
      const out =
        typeof item.aggregated_output === 'string' ? item.aggregated_output.trim() : '';
      const callId = pickStr(item, 'id');
      const commandActions = commandActionsFromUnknown(item.command_actions ?? item.commandActions);
      const exitCode = typeof item.exitCode === 'number' ? item.exitCode : null;
      const durationMs = typeof item.durationMs === 'number' ? item.durationMs : null;
      if (phase === 'started') {
        this.ui({
          kind: 'command',
          phase: 'started',
          summary: truncate(cmd, 200),
          command: truncate(cmd, 400),
          callId,
          commandActions,
        });
        emit(`${CYN}▸ ${truncate(cmd, 120)}${RST}\n`);
        return;
      }
      if (phase === 'completed') {
        const summary = out
          ? `${truncate(cmd, 80)} · ${truncate(out, 120)}`
          : truncate(cmd, 120);
        this.ui({
          kind: 'command',
          phase: 'completed',
          summary,
          command: truncate(cmd, 400),
          callId,
          commandActions,
          durationMs,
          exitCode: exitCode ?? undefined,
          ok: exitCode == null ? undefined : exitCode === 0,
          ...(out ? { resultPreview: truncate(out, 400) } : {}),
        });
        if (out) {
          emit(`${GRN}✓ ${truncate(cmd, 80)}${RST}\n`);
          const preview = truncate(out, 400);
          if (preview) emit(`${DIM}${preview}${RST}\n`);
        } else {
          emit(`${GRN}✓ ${truncate(cmd, 80)}${RST}\n`);
        }
      }
      return;
    }
    if (it === 'agent_message' || it === 'assistant_message') {
      const tx = typeof item.text === 'string' ? item.text : '';
      if (tx) this.emitAgentText(tx, emit);
      return;
    }
    if (it === 'file_change') {
      const changes = Array.isArray(item.changes) ? item.changes : [];
      if (changes.length > 0) {
        for (const change of changes) {
          if (!change || typeof change !== 'object') continue;
          const path =
            pickStr(change, 'path') ??
            pickStr(change, 'newPath') ??
            pickStr(change, 'oldPath') ??
            'changed file';
          this.ui({
            kind: 'file_change',
            path,
            summary: `file · ${path}`,
          });
          emit(`${DIM}· file: ${path}${RST}\n`);
        }
      } else {
        const path = pickStr(item, 'path') ?? it;
        this.ui({
          kind: 'file_change',
          path,
          summary: `file · ${path}`,
        });
        emit(`${DIM}· file: ${path}${RST}\n`);
      }
      return;
    }
    if (it === 'mcp_tool_call') {
      const tool = typeof item.tool === 'string' ? item.tool : 'mcp';
      const callId = pickStr(item, 'id');
      const resultPreview =
        previewFromUnknown(item.result, 500) ?? previewFromUnknown(item.error, 500);
      const durationMs = typeof item.durationMs === 'number' ? item.durationMs : null;
      if (phase === 'completed') {
        this.ui({
          kind: 'tool_result',
          toolName: 'mcp',
          detail: tool,
          summary: `mcp · ${tool}`,
          callId,
          resultPreview,
          durationMs,
          ok: item.error == null,
        });
      } else {
        this.ui({
          kind: 'tool_call',
          phase: 'started',
          toolName: 'mcp',
          detail: tool,
          summary: `mcp · ${tool}`,
          callId,
        });
      }
      emit(`${DIM}· mcp ${tool}${RST}\n`);
      return;
    }
    if (it === 'web_search') {
      this.ui({
        kind: 'tool_call',
        phase: 'started',
        toolName: 'web_search',
        summary: 'web_search',
      });
      emit(`${DIM}· web_search${RST}\n`);
    }
  }

  private emitOneLine(line: string, emit: TerminalEmit): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      emit(line + (line.endsWith('\n') ? '' : '\n'));
      return;
    }

    const t = obj.type;
    if (t === 'thread.started') {
      this.ui({ kind: 'session_init', model: 'Codex' });
      emit(`${DIM}— Codex thread${RST}\n`);
      return;
    }
    if (t === 'turn.started') {
      emit(`${DIM}— turn${RST}\n`);
      return;
    }
    if (t === 'turn.completed') {
      this.ui({ kind: 'turn_result', ok: true, durationMs: null });
      emit(`${YLW}— turn completed${RST}\n`);
      return;
    }
    if (t === 'turn.failed') {
      const err = obj.error as Record<string, unknown> | undefined;
      const msg = err && typeof err.message === 'string' ? err.message : 'failed';
      this.ui({ kind: 'turn_result', ok: false, durationMs: null, error: msg });
      emit(`${YLW}— turn failed: ${truncate(msg, 160)}${RST}\n`);
      return;
    }
    if (t === 'error' && typeof obj.message === 'string') {
      emit(`${DIM}· ${truncate(obj.message, 200)}${RST}\n`);
      return;
    }

    if (t === 'item.started' || t === 'item.updated' || t === 'item.completed') {
      const item = obj.item as Record<string, unknown> | undefined;
      const phase = t === 'item.started' ? 'started' : t === 'item.completed' ? 'completed' : 'updated';
      this.emitItem(phase, item, emit);
      return;
    }

    emit(`${DIM}· ${String(t)}${RST}\n`);
  }
}

export function shouldPrettifyCodexJson(args: string[]): boolean {
  if (process.env.AGENTCADENCE_CODEX_RAW_JSON === '1') return false;
  if (!args.includes('--json')) return false;
  return args.includes('exec');
}

export function commandLineUsesCodexJson(commandLine: string): boolean {
  if (process.env.AGENTCADENCE_CODEX_RAW_JSON === '1') return false;
  if (!commandLine.includes('--json')) return false;
  return /\bcodex\b/.test(commandLine) && /\bexec\b/.test(commandLine);
}

export function createCodexStreamJsonWrapper(
  onOutputChunk?: (s: string) => void,
  onUiEvent?: (e: AgentStreamUiEvent) => void
): CliStreamPresenterHandle {
  if (!onOutputChunk && !onUiEvent) {
    return { onChunk: () => {}, finish: (raw) => raw };
  }
  const p = new CodexJsonPrettifier(onUiEvent);
  let acc = '';
  const emit: TerminalEmit = (s) => {
    acc += s;
    onOutputChunk?.(s);
  };
  return {
    onChunk: (chunk: string) => p.push(chunk, emit),
    finish: (rawStdout: string) => {
      p.flush(emit);
      return acc.trim().length > 0 ? acc : rawStdout;
    },
  };
}
