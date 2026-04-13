/**
 * Codex CLI `codex exec --json` → terminal + {@link AgentStreamUiEvent}.
 * AGENTCADENCE_CODEX_RAW_JSON=1 disables prettify (pass-through).
 */

import type { AgentStreamUiEvent } from '../../../shared/types.js';
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

class CodexJsonPrettifier {
  private lines = new JsonlLineBuffer();
  private lastAgentTextChunk = '';
  private lastAgentSnapshot = '';
  private commandCallSerial = 0;
  private pendingCommandCallId: string | undefined;

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
      const tx = typeof item.text === 'string' ? item.text : '';
      if (tx.trim()) {
        this.ui({ kind: 'thinking_delta', text: truncate(tx, 4000) });
        emit(`${DIM}⋯ ${truncate(tx, 200)}${RST}\n`);
      }
      return;
    }
    if (it === 'command_execution') {
      const cmd = typeof item.command === 'string' ? item.command : 'shell';
      const out =
        typeof item.aggregated_output === 'string' ? item.aggregated_output.trim() : '';
      if (phase === 'started') {
        const callId = `codex-cmd-${++this.commandCallSerial}`;
        this.pendingCommandCallId = callId;
        this.ui({
          kind: 'tool',
          phase: 'started',
          toolName: 'shell',
          detail: truncate(cmd, 400),
          summary: truncate(cmd, 200),
          callId,
        });
        emit(`${CYN}▸ ${truncate(cmd, 120)}${RST}\n`);
        return;
      }
      if (phase === 'completed') {
        const callId = this.pendingCommandCallId;
        this.pendingCommandCallId = undefined;
        const summary = out
          ? `${truncate(cmd, 80)} · ${truncate(out, 120)}`
          : truncate(cmd, 120);
        this.ui({
          kind: 'tool',
          phase: 'completed',
          toolName: 'shell',
          detail: truncate(cmd, 400),
          summary,
          callId,
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
      const path = typeof item.path === 'string' ? item.path : '';
      const s = path || it;
      this.ui({
        kind: 'tool',
        phase: 'update',
        toolName: 'file_change',
        detail: s,
        summary: `file: ${s}`,
      });
      emit(`${DIM}· file: ${s}${RST}\n`);
      return;
    }
    if (it === 'mcp_tool_call') {
      const tool = typeof item.tool === 'string' ? item.tool : 'mcp';
      this.ui({
        kind: 'tool',
        phase: 'started',
        toolName: 'mcp',
        detail: tool,
        summary: `mcp · ${tool}`,
      });
      emit(`${DIM}· mcp ${tool}${RST}\n`);
      return;
    }
    if (it === 'web_search') {
      this.ui({
        kind: 'tool',
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
      this.ui({ kind: 'turn_result', ok: false, durationMs: null });
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
