/**
 * Claude Code CLI `-p --output-format stream-json` → terminal + {@link AgentStreamUiEvent}.
 * AGENTCADENCE_CLAUDE_RAW_STREAM_JSON=1 disables prettify (pass-through).
 */

import type { AgentStreamUiEvent } from '../../../shared/types.js';
import { CYN, DIM, RST, YLW } from './ansi.js';
import { JsonlLineBuffer } from './jsonl-line-buffer.js';
import type { CliStreamPresenterHandle, TerminalEmit } from './types.js';

function toolUseName(block: Record<string, unknown>): string {
  return typeof block.name === 'string' ? block.name : 'tool';
}

function toolUseDetail(block: Record<string, unknown>): string | undefined {
  const input = block.input;
  if (!input || typeof input !== 'object') return undefined;
  const o = input as Record<string, unknown>;
  let path: string | undefined;
  if (typeof o.file_path === 'string') path = o.file_path;
  else if (typeof o.path === 'string') path = o.path;
  if (path) return path;
  const cmd = typeof o.command === 'string' ? o.command : undefined;
  if (cmd) return cmd.length > 220 ? `${cmd.slice(0, 219)}…` : cmd;
  return undefined;
}

function toolResultPreview(block: Record<string, unknown>): string | undefined {
  const directText = typeof block.text === 'string' ? block.text.trim() : '';
  if (directText) return directText.length > 500 ? `${directText.slice(0, 499)}…` : directText;
  const content = block.content;
  if (Array.isArray(content)) {
    const pieces = content
      .filter((part): part is Record<string, unknown> => !!part && typeof part === 'object')
      .map((part) => (typeof part.text === 'string' ? part.text.trim() : ''))
      .filter(Boolean);
    const joined = pieces.join('\n').trim();
    if (joined) return joined.length > 500 ? `${joined.slice(0, 499)}…` : joined;
  }
  return undefined;
}

function findRecentToolUse(
  recentToolUses: Array<{ callId?: string; toolName: string; detail?: string; summary: string }>,
  callId: string | undefined
) {
  if (callId) {
    for (let i = recentToolUses.length - 1; i >= 0; i--) {
      const entry = recentToolUses[i];
      if (entry.callId === callId) return entry;
    }
  }
  return recentToolUses[recentToolUses.length - 1];
}

class ClaudeStreamState {
  private lastTextChunk = '';
  private lastTextSnapshot = '';
  private lastThinkingSnapshot = '';

  constructor(private readonly ui: (e: AgentStreamUiEvent) => void) {}

  emitTextDelta(text: string, emit: TerminalEmit): void {
    if (!text) return;
    if (text === this.lastTextChunk) return;
    let delta = text;
    if (this.lastTextSnapshot && text.startsWith(this.lastTextSnapshot)) {
      delta = text.slice(this.lastTextSnapshot.length);
    } else if (this.lastTextSnapshot && text.length < this.lastTextSnapshot.length) {
      this.lastTextSnapshot = '';
    }
    this.lastTextSnapshot = text;
    this.lastTextChunk = text;
    if (delta) {
      emit(delta);
      this.ui({ kind: 'assistant_delta', text: delta });
    }
  }

  emitThinkingDelta(text: string, emit: TerminalEmit): void {
    if (!text) return;
    let delta = text;
    if (this.lastThinkingSnapshot && text.startsWith(this.lastThinkingSnapshot)) {
      delta = text.slice(this.lastThinkingSnapshot.length);
    } else if (this.lastThinkingSnapshot && text.length < this.lastThinkingSnapshot.length) {
      this.lastThinkingSnapshot = '';
    }
    this.lastThinkingSnapshot = text;
    if (!delta) return;
    this.ui({ kind: 'reasoning_delta', text: delta });
    for (const ln of delta.split('\n')) {
      if (ln.trim()) emit(`${DIM}⋯ ${ln}${RST}\n`);
    }
  }
}

function emitAssistantMessage(
  msg: Record<string, unknown> | undefined,
  emit: TerminalEmit,
  state: ClaudeStreamState,
  ui: (e: AgentStreamUiEvent) => void,
  seenToolUseIds: Set<string>,
  recentToolUses: Array<{ callId?: string; toolName: string; detail?: string; summary: string }>
): void {
  const content = msg?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    const ty = b.type;
    if (ty === 'tool_use') {
      const id = typeof b.id === 'string' ? b.id : undefined;
      if (id) {
        if (seenToolUseIds.has(id)) continue;
        seenToolUseIds.add(id);
      }
      const name = toolUseName(b);
      const detail = toolUseDetail(b);
      emit(`${CYN}▸ ${name}${RST}\n`);
      const summary = detail ? `${name} · ${detail}` : name;
      ui({
        kind: 'tool_call',
        phase: 'started',
        summary,
        toolName: name,
        detail,
        callId: id,
      });
      recentToolUses.push({ callId: id, toolName: name, detail, summary });
      continue;
    }
    if (ty === 'thinking' || ty === 'reasoning') {
      const t =
        (typeof b.thinking === 'string' && b.thinking.trim()) ||
        (typeof b.text === 'string' && b.text.trim()) ||
        '';
      if (t) state.emitThinkingDelta(t, emit);
      continue;
    }
    if (ty === 'tool_result') {
      const callId =
        typeof b.tool_use_id === 'string'
          ? b.tool_use_id
          : typeof b.id === 'string'
            ? b.id
            : undefined;
      const hint = findRecentToolUse(recentToolUses, callId);
      if (hint) {
        ui({
          kind: 'tool_result',
          summary: hint.summary,
          toolName: hint.toolName,
          detail: hint.detail,
          callId,
          resultPreview: toolResultPreview(b),
          ...(b.is_error === true ? { ok: false } : {}),
        });
      }
      continue;
    }
    if (typeof b.text === 'string' && ty !== 'tool_result' && ty !== 'thinking' && ty !== 'reasoning') {
      state.emitTextDelta(b.text, emit);
    }
  }
}

class ClaudeStreamJsonPrettifier {
  private lines = new JsonlLineBuffer();
  private state: ClaudeStreamState;
  private seenToolUseIds = new Set<string>();
  private recentToolUses: Array<{ callId?: string; toolName: string; detail?: string; summary: string }> = [];

  constructor(private readonly onUiEvent?: (e: AgentStreamUiEvent) => void) {
    this.state = new ClaudeStreamState((e) => this.onUiEvent?.(e));
  }

  private ui(e: AgentStreamUiEvent): void {
    this.onUiEvent?.(e);
  }

  push(raw: string, emit: TerminalEmit): void {
    this.lines.push(raw, (line) => this.emitOneLine(line, emit));
  }

  flush(emit: TerminalEmit): void {
    this.lines.flush((line) => this.emitOneLine(line, emit));
  }

  private emitStreamEvent(obj: Record<string, unknown>, emit: TerminalEmit): void {
    const ev = obj.event as Record<string, unknown> | undefined;
    if (!ev) return;
    const delta = ev.delta as Record<string, unknown> | undefined;
    if (!delta) return;
    if (delta.type === 'text_delta' && typeof delta.text === 'string') {
      emit(delta.text);
      this.ui({ kind: 'assistant_delta', text: delta.text });
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
    if (t === 'system' && obj.subtype === 'init') {
      const model = typeof obj.model === 'string' ? obj.model : '';
      const cwd = typeof obj.cwd === 'string' ? obj.cwd : '';
      this.ui({ kind: 'session_init', model: model || undefined, cwd: cwd || undefined });
      emit(`${DIM}— Claude${model ? `: ${model}` : ''}${cwd ? ` · ${cwd}` : ''}${RST}\n`);
      return;
    }
    if (t === 'assistant') {
      const msg = obj.message as Record<string, unknown> | undefined;
      emitAssistantMessage(
        msg,
        emit,
        this.state,
        (e) => this.ui(e),
        this.seenToolUseIds,
        this.recentToolUses
      );
      return;
    }
    if (t === 'stream_event') {
      this.emitStreamEvent(obj, emit);
      return;
    }
    if (t === 'user') {
      emit(`${DIM}— user message${RST}\n`);
      return;
    }
    if (t === 'result') {
      const err = obj.is_error === true;
      const ms = typeof obj.duration_ms === 'number' ? obj.duration_ms : null;
      const sub = typeof obj.subtype === 'string' ? obj.subtype : '';
      const ok = !err && sub !== 'error';
      const error =
        ok || typeof obj.error !== 'string'
          ? undefined
          : obj.error;
      this.ui({ kind: 'turn_result', ok, durationMs: ms, error });
      emit(`${YLW}— ${ok ? 'completed' : 'failed'}${ms != null ? ` · ${ms}ms` : ''}${RST}\n`);
      return;
    }

    emit(`${DIM}· ${String(t)}${RST}\n`);
  }
}

export function shouldPrettifyClaudeStreamJson(args: string[]): boolean {
  if (process.env.AGENTCADENCE_CLAUDE_RAW_STREAM_JSON === '1') return false;
  return args.includes('stream-json');
}

export function commandLineUsesClaudeStreamJson(commandLine: string): boolean {
  if (process.env.AGENTCADENCE_CLAUDE_RAW_STREAM_JSON === '1') return false;
  if (!commandLine.includes('stream-json')) return false;
  return /\bclaude\b/.test(commandLine);
}

export function createClaudeStreamJsonWrapper(
  onOutputChunk?: (s: string) => void,
  onUiEvent?: (e: AgentStreamUiEvent) => void
): CliStreamPresenterHandle {
  if (!onOutputChunk && !onUiEvent) {
    return { onChunk: () => {}, finish: (raw) => raw };
  }
  const p = new ClaudeStreamJsonPrettifier(onUiEvent);
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
