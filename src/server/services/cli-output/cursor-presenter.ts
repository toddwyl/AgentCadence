/**
 * Cursor CLI `--output-format stream-json` → terminal text + optional {@link AgentStreamUiEvent} for chat UI.
 * Set AGENTCADENCE_CURSOR_RAW_STREAM_JSON=1 to pass through raw bytes.
 */

import type { AgentStreamUiEvent, AgentTodoSnapshotItem } from '../../../shared/types.js';
import { CYN, DIM, GRN, RST, YLW } from './ansi.js';
import { JsonlLineBuffer } from './jsonl-line-buffer.js';
import type { CliStreamPresenterHandle, TerminalEmit } from './types.js';

function readTextBlocks(msg: Record<string, unknown> | undefined): string {
  const content = msg?.content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && 'text' in block) {
      const b = block as Record<string, unknown>;
      if (b.type === 'thinking') continue;
      const t = b.text;
      if (typeof t === 'string') parts.push(t);
    }
  }
  return parts.join('');
}

function readThinkingBlocks(msg: Record<string, unknown> | undefined): string {
  const content = msg?.content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    const ty = b.type;
    if (ty === 'thinking' && typeof b.thinking === 'string') {
      const s = b.thinking.trim();
      if (s) parts.push(s);
    }
  }
  return parts.join('\n');
}

function pickStr(o: unknown, key: string): string | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const v = (o as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** e.g. readToolCall → read_file */
function toolCallKeyToName(toolCallKey: string): string {
  const base = toolCallKey.replace(/ToolCall$/i, '');
  return base
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Cursor `tool_call` JSONL → stable id, display name, and primary argument for the activity feed.
 */
function parseCursorToolCallForUi(obj: Record<string, unknown>): {
  callId?: string;
  toolName: string;
  detail?: string;
  summary: string;
} {
  const topId = pickStr(obj, 'call_id') ?? pickStr(obj, 'id');

  const tc = obj.tool_call;
  if (tc && typeof tc === 'object') {
    const tcRec = tc as Record<string, unknown>;
    for (const [key, val] of Object.entries(tcRec)) {
      if (!key.endsWith('ToolCall') || !val || typeof val !== 'object') continue;
      const payload = val as Record<string, unknown>;
      const nestedId = pickStr(payload, 'call_id') ?? pickStr(payload, 'id');
      const callId = topId ?? nestedId;
      const args = payload.args;
      const argsRec = args && typeof args === 'object' ? (args as Record<string, unknown>) : undefined;

      let detail: string | undefined;
      if (argsRec) {
        detail = pickStr(argsRec, 'path') ?? pickStr(argsRec, 'file_path');
        if (!detail) {
          const cmd = pickStr(argsRec, 'command');
          if (cmd) detail = cmd.length > 220 ? `${cmd.slice(0, 219)}…` : cmd;
        }
        if (!detail) {
          const pat = pickStr(argsRec, 'pattern') ?? pickStr(argsRec, 'query');
          const glob = pickStr(argsRec, 'glob_pattern');
          if (pat || glob) detail = [glob, pat].filter(Boolean).join(' · ');
        }
      }

      const toolName = toolCallKeyToName(key);
      const summary = detail ? `${toolName} · ${detail}` : toolName;
      return { callId, toolName, detail, summary };
    }

    const fn = tcRec.function as { name?: string; arguments?: string } | undefined;
    if (fn?.name) {
      let detail: string | undefined;
      if (typeof fn.arguments === 'string' && fn.arguments.trim()) {
        try {
          const parsedArgs = JSON.parse(fn.arguments) as Record<string, unknown>;
          detail =
            pickStr(parsedArgs, 'path') ??
            pickStr(parsedArgs, 'file_path') ??
            pickStr(parsedArgs, 'command') ??
            undefined;
        } catch {
          /* ignore malformed JSON arguments */
        }
      }
      const toolName = fn.name;
      const summary = detail ? `${toolName} · ${detail}` : toolName;
      return { callId: topId, toolName, detail, summary };
    }
  }

  return { callId: topId, toolName: 'tool', summary: 'tool' };
}

function toolCallHintKey(toolName: string, detail: string | undefined): string {
  return `${toolName}\0${detail ?? ''}`;
}

function sanitizeToolResultPreview(raw: string, maxLen: number): string {
  let out = '';
  for (const ch of raw) {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10) out += ch;
    else if (c < 32 || c === 127) continue;
    else out += ch;
  }
  return out.length <= maxLen ? out : out.slice(0, maxLen);
}

/** Cursor `tool_call` completed payload → short preview + ok flag for the activity feed. */
function extractToolResultPreview(obj: Record<string, unknown>): { preview?: string; ok?: boolean } {
  const nonEmpty = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim().length > 0 ? v : undefined;

  let raw: string | undefined =
    nonEmpty(obj.result) ?? nonEmpty(obj.output) ?? nonEmpty(obj.message);

  const tc = obj.tool_call;
  if (raw === undefined && tc && typeof tc === 'object') {
    for (const val of Object.values(tc as Record<string, unknown>)) {
      if (!val || typeof val !== 'object') continue;
      const o = val as Record<string, unknown>;
      const hit =
        nonEmpty(o.result) ?? nonEmpty(o.output) ?? nonEmpty(o.content) ?? nonEmpty(o.text);
      if (hit !== undefined) {
        raw = hit;
        break;
      }
    }
  }

  const sanitized = raw !== undefined ? sanitizeToolResultPreview(raw, 600) : '';
  const out: { preview?: string; ok?: boolean } = {};
  if (sanitized.length > 0) out.preview = sanitized;
  if (obj.is_error === true || obj.success === false) out.ok = false;
  return out;
}

function canonicalToolNameForMatch(name: string): string {
  return name
    .replace(/-/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function normalizeTodoStatus(raw: unknown): AgentTodoSnapshotItem['status'] {
  const x = String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  if (x === 'in_progress' || x === 'inprogress' || x === 'active') return 'in_progress';
  if (x === 'completed' || x === 'complete' || x === 'done') return 'completed';
  return 'pending';
}

function findTodosArrayInToolCall(tcRec: Record<string, unknown>): unknown[] | null {
  const tryArgsTodos = (val: unknown): unknown[] | null => {
    if (!val || typeof val !== 'object') return null;
    const payload = val as Record<string, unknown>;
    const args = payload.args;
    if (args && typeof args === 'object') {
      const todos = (args as Record<string, unknown>).todos;
      if (Array.isArray(todos) && todos.length > 0) return todos;
    }
    return null;
  };

  for (const [key, val] of Object.entries(tcRec)) {
    if (key === 'todoWriteToolCall' || key.endsWith('TodoWrite')) {
      const found = tryArgsTodos(val);
      if (found) return found;
    }
  }
  for (const val of Object.values(tcRec)) {
    const found = tryArgsTodos(val);
    if (found) return found;
  }
  return null;
}

function parseTodoSnapshotFromToolCall(
  obj: Record<string, unknown>,
  toolName: string
): AgentTodoSnapshotItem[] | null {
  if (canonicalToolNameForMatch(toolName) !== 'todo_write') return null;
  const tc = obj.tool_call;
  if (!tc || typeof tc !== 'object') return null;
  const arr = findTodosArrayInToolCall(tc as Record<string, unknown>);
  if (!arr || arr.length === 0) return null;

  const items: AgentTodoSnapshotItem[] = arr.map((item, idx) => {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      return {
        id: String(o.id ?? idx),
        content: String(o.content ?? o.task ?? o.title ?? ''),
        status: normalizeTodoStatus(o.status),
      };
    }
    return {
      id: String(idx),
      content: String(item ?? ''),
      status: 'pending' as const,
    };
  });
  return items.length > 0 ? items : null;
}

export class CursorStreamJsonPrettifier {
  private lines = new JsonlLineBuffer();
  private lastAssistantChunk = '';
  private lastAssistantTextSnapshot = '';
  private lastThinkingSnapshot = '';
  /** started → completed may omit call_id on one side; reuse id from the other line. */
  private toolCallIdHints = new Map<string, string>();

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

  private emitToolUseBlocks(msg: Record<string, unknown> | undefined, emit: TerminalEmit): void {
    const content = msg?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        const name = typeof b.name === 'string' ? b.name : 'tool';
        emit(`${CYN}▸ ${name}${RST}\n`);
        // Activity feed uses `type: tool_call` JSONL only — assistant lines repeat tool_use blocks and would duplicate cards.
      }
    }
  }

  private emitAssistantTextDelta(text: string, emit: TerminalEmit): void {
    if (!text) return;
    if (text === this.lastAssistantChunk) return;
    let delta = text;
    if (this.lastAssistantTextSnapshot && text.startsWith(this.lastAssistantTextSnapshot)) {
      delta = text.slice(this.lastAssistantTextSnapshot.length);
    } else if (this.lastAssistantTextSnapshot && text.length < this.lastAssistantTextSnapshot.length) {
      this.lastAssistantTextSnapshot = '';
    }
    this.lastAssistantTextSnapshot = text;
    this.lastAssistantChunk = text;
    if (delta) {
      emit(delta);
      this.ui({ kind: 'assistant_delta', text: delta });
    }
  }

  private emitThinkingDelta(text: string, emit: TerminalEmit): void {
    if (!text) return;
    let delta = text;
    if (this.lastThinkingSnapshot && text.startsWith(this.lastThinkingSnapshot)) {
      delta = text.slice(this.lastThinkingSnapshot.length);
    } else if (this.lastThinkingSnapshot && text.length < this.lastThinkingSnapshot.length) {
      this.lastThinkingSnapshot = '';
    }
    this.lastThinkingSnapshot = text;
    if (!delta) return;
    this.ui({ kind: 'thinking_delta', text: delta });
    const lines = delta.split('\n');
    for (const ln of lines) {
      if (ln.trim()) emit(`${DIM}⋯ ${ln}${RST}\n`);
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
    if (t === 'assistant') {
      const msg = obj.message as Record<string, unknown> | undefined;
      this.emitToolUseBlocks(msg, emit);
      const thinking = readThinkingBlocks(msg);
      if (thinking) this.emitThinkingDelta(thinking, emit);
      const text = readTextBlocks(msg);
      if (text) this.emitAssistantTextDelta(text, emit);
      return;
    }

    if (t === 'tool_call') {
      const sub = String(obj.subtype ?? '');
      const parsed = parseCursorToolCallForUi(obj);
      const phase =
        sub === 'started' ? 'started' : sub === 'completed' ? 'completed' : 'update';
      const hintKey = toolCallHintKey(parsed.toolName, parsed.detail);
      let callId = parsed.callId;
      if (!callId && sub !== 'started') {
        callId = this.toolCallIdHints.get(hintKey);
      }
      if (sub === 'started' && parsed.callId) {
        this.toolCallIdHints.set(hintKey, parsed.callId);
      }
      const toolPayload: Extract<AgentStreamUiEvent, { kind: 'tool' }> = {
        kind: 'tool',
        phase,
        subtype: sub,
        summary: parsed.summary,
        toolName: parsed.toolName,
        detail: parsed.detail,
        callId,
      };
      if (phase === 'completed') {
        const extra = extractToolResultPreview(obj);
        if (extra.preview !== undefined) toolPayload.resultPreview = extra.preview;
        if (extra.ok === false) toolPayload.ok = false;
      }
      this.ui(toolPayload);
      const snapshot = parseTodoSnapshotFromToolCall(obj, parsed.toolName);
      if (snapshot) this.ui({ kind: 'todo_snapshot', items: snapshot });
      if (sub === 'started') {
        emit(`${CYN}▸ ${parsed.summary}${RST}\n`);
        return;
      }
      if (sub === 'completed') {
        emit(`${GRN}✓ ${parsed.summary}${RST}\n`);
        return;
      }
      emit(`${DIM}• tool_call ${sub}: ${parsed.summary}${RST}\n`);
      return;
    }

    if (t === 'system' && obj.subtype === 'init') {
      const model = typeof obj.model === 'string' ? obj.model : '';
      const cwd = typeof obj.cwd === 'string' ? obj.cwd : '';
      this.ui({ kind: 'session_init', model: model || undefined, cwd: cwd || undefined });
      emit(`${DIM}— Cursor agent${model ? `: ${model}` : ''}${cwd ? ` · ${cwd}` : ''}${RST}\n`);
      return;
    }

    if (t === 'user') {
      emit(`${DIM}— user message${RST}\n`);
      return;
    }

    if (t === 'result') {
      const ok = obj.is_error !== true;
      const ms = typeof obj.duration_ms === 'number' ? obj.duration_ms : null;
      this.ui({ kind: 'turn_result', ok, durationMs: ms });
      emit(`${YLW}— ${ok ? 'completed' : 'failed'}${ms != null ? ` · ${ms}ms` : ''}${RST}\n`);
      return;
    }

    emit(`${DIM}· ${String(t)}${RST}\n`);
  }
}

export function shouldPrettifyCursorStreamJson(args: string[]): boolean {
  if (process.env.AGENTCADENCE_CURSOR_RAW_STREAM_JSON === '1') return false;
  return args.includes('stream-json');
}

export function commandLineUsesCursorStreamJson(commandLine: string): boolean {
  if (process.env.AGENTCADENCE_CURSOR_RAW_STREAM_JSON === '1') return false;
  if (!commandLine.includes('stream-json')) return false;
  return /\bcursor-agent\b/.test(commandLine);
}

export function createCursorStreamJsonWrapper(
  onOutputChunk?: (s: string) => void,
  onUiEvent?: (e: AgentStreamUiEvent) => void
): CliStreamPresenterHandle {
  if (!onOutputChunk && !onUiEvent) {
    return {
      onChunk: () => {},
      finish: (raw) => raw,
    };
  }
  const p = new CursorStreamJsonPrettifier(onUiEvent);
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
