import type {
  AgentActivityGroupType,
  AgentCommandAction,
  AgentDiffRow,
  AgentFeedItem,
  AgentParsedDiffFile,
  AgentStreamUiEvent,
  AgentTranscriptDisplayItem,
  AgentTranscriptDisplayMeta,
  AgentTranscriptStatus,
} from './types.js';
import { parseCommandActions, summarizeCommandAction } from './types.js';

const MAX_FEED_ITEMS = 500;
const MAX_BLOCK_CHARS = 120_000;

function capText(s: string): string {
  if (s.length <= MAX_BLOCK_CHARS) return s;
  return s.slice(-MAX_BLOCK_CHARS);
}

function trimFeed(feed: AgentFeedItem[]): void {
  while (feed.length > MAX_FEED_ITEMS) feed.shift();
}

function pushItem(next: AgentFeedItem[], item: AgentFeedItem): void {
  next.push(item);
  trimFeed(next);
}

function summarizeReasoning(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0) ?? text.trim();
  if (line.length <= 96) return line;
  return `${line.slice(0, 95)}…`;
}

function closeOpenReasoning(next: AgentFeedItem[]): void {
  for (let i = next.length - 1; i >= 0; i--) {
    const item = next[i];
    if (item.kind === 'reasoning' && item.status === 'running') {
      item.status = 'completed';
      item.summary = summarizeReasoning(item.text);
      return;
    }
  }
}

function toolMatch(
  item: AgentFeedItem,
  callId: string | undefined,
  toolName: string,
  detail: string | undefined
): boolean {
  if (item.kind !== 'tool_call') return false;
  if (callId && item.callId && callId === item.callId) return true;
  if (!callId && item.status !== 'completed' && item.toolName === toolName && item.detail === detail) {
    return true;
  }
  return false;
}

function commandMatch(item: AgentFeedItem, callId: string | undefined, command: string): boolean {
  if (item.kind !== 'command') return false;
  if (callId && item.callId && callId === item.callId) return true;
  if (!callId && item.status !== 'completed' && item.command === command) return true;
  return false;
}

function fileChangeStableKey(item: AgentFeedItem & { kind: 'file_change' }): string {
  return `${item.parentCallId ?? ''}\0${item.path}`;
}

function findToolCallIndex(
  next: AgentFeedItem[],
  callId: string | undefined,
  toolName: string,
  detail: string | undefined
): number {
  for (let i = next.length - 1; i >= 0; i--) {
    if (toolMatch(next[i], callId, toolName, detail)) return i;
  }
  return -1;
}

function findCommandIndex(next: AgentFeedItem[], callId: string | undefined, command: string): number {
  for (let i = next.length - 1; i >= 0; i--) {
    if (commandMatch(next[i], callId, command)) return i;
  }
  return -1;
}

function mergeAssistantTail(next: AgentFeedItem[], text: string): void {
  const chunk = capText(text);
  const last = next[next.length - 1];
  if (last?.kind === 'assistant') {
    const trimmed = chunk.trim();
    if (trimmed.length > 0 && last.text.trim() === trimmed) return;
    last.text = capText(last.text + chunk);
  } else {
    pushItem(next, { kind: 'assistant', text: chunk });
  }
}

function mergeReasoningTail(next: AgentFeedItem[], text: string): void {
  const chunk = capText(text);
  const last = next[next.length - 1];
  if (last?.kind === 'reasoning' && last.status === 'running') {
    const trimmed = chunk.trim();
    if (trimmed.length > 0 && last.text.trim() === trimmed) return;
    last.text = capText(last.text + chunk);
    last.summary = summarizeReasoning(last.text);
  } else {
    pushItem(next, {
      kind: 'reasoning',
      text: chunk,
      summary: summarizeReasoning(chunk),
      status: 'running',
    });
  }
}

function statusFromToolResult(ok: boolean | undefined): AgentTranscriptStatus {
  if (ok === false) return 'failed';
  return 'completed';
}

function mergeToolCallInto(
  target: AgentFeedItem & { kind: 'tool_call' },
  patch: Partial<AgentFeedItem & { kind: 'tool_call' }>
): void {
  if (patch.summary && patch.summary.length >= target.summary.length) target.summary = patch.summary;
  if (patch.detail !== undefined) target.detail = patch.detail;
  if (patch.callId) target.callId = patch.callId;
  if (patch.resultPreview !== undefined) target.resultPreview = patch.resultPreview;
  if (patch.gitDiffUnified !== undefined) target.gitDiffUnified = patch.gitDiffUnified;
  if (patch.durationMs !== undefined) target.durationMs = patch.durationMs;
  if (patch.ok !== undefined) target.ok = patch.ok;
  if (patch.status) target.status = patch.status;
}

function mergeCommandInto(
  target: AgentFeedItem & { kind: 'command' },
  patch: Partial<AgentFeedItem & { kind: 'command' }>
): void {
  if (patch.summary && patch.summary.length >= target.summary.length) target.summary = patch.summary;
  if (patch.callId) target.callId = patch.callId;
  if (patch.commandActions !== undefined) target.commandActions = patch.commandActions;
  if (patch.resultPreview !== undefined) target.resultPreview = patch.resultPreview;
  if (patch.durationMs !== undefined) target.durationMs = patch.durationMs;
  if (patch.exitCode !== undefined) target.exitCode = patch.exitCode;
  if (patch.ok !== undefined) target.ok = patch.ok;
  if (patch.status) target.status = patch.status;
}

function appendLegacyToolEvent(
  next: AgentFeedItem[],
  event: Extract<AgentStreamUiEvent, { kind: 'tool' }>
): void {
  if (event.toolName === 'shell') {
    const command = event.detail ?? event.summary;
    const idx = findCommandIndex(next, event.callId, command);
    if (idx >= 0) {
      const item = next[idx];
      if (item.kind === 'command') {
        mergeCommandInto(item, {
          kind: 'command',
          summary: event.summary,
          status: event.phase === 'started' ? 'running' : statusFromToolResult(event.ok),
          callId: event.callId,
          commandActions: parseCommandActions(command),
          resultPreview: event.resultPreview,
          ok: event.ok,
        });
        return;
      }
    }
    pushItem(next, {
      kind: 'command',
      status: event.phase === 'started' ? 'running' : statusFromToolResult(event.ok),
      summary: event.summary,
      command,
      callId: event.callId,
      commandActions: parseCommandActions(command),
      resultPreview: event.resultPreview,
      ok: event.ok,
    });
    return;
  }

  const toolName = event.toolName ?? 'tool';
  const idx = findToolCallIndex(next, event.callId, toolName, event.detail);
  if (idx >= 0) {
    const item = next[idx];
    if (item.kind === 'tool_call') {
      mergeToolCallInto(item, {
        kind: 'tool_call',
        summary: event.summary,
        detail: event.detail,
        callId: event.callId,
        resultPreview: event.resultPreview,
        gitDiffUnified: event.gitDiffUnified,
        ok: event.ok,
        status: event.phase === 'started' ? 'running' : statusFromToolResult(event.ok),
      });
      return;
    }
  }

  pushItem(next, {
    kind: 'tool_call',
    status: event.phase === 'started' ? 'running' : statusFromToolResult(event.ok),
    summary: event.summary,
    toolName,
    detail: event.detail,
    callId: event.callId,
    resultPreview: event.resultPreview,
    gitDiffUnified: event.gitDiffUnified,
    ok: event.ok,
  });
}

/** Client + server: merge one stream event into the runtime transcript feed. */
export function applyAgentStreamEvent(
  feed: AgentFeedItem[],
  event: AgentStreamUiEvent
): AgentFeedItem[] {
  const next = [...feed];

  if (event.kind !== 'reasoning_delta' && event.kind !== 'thinking_delta') {
    closeOpenReasoning(next);
  }

  switch (event.kind) {
    case 'session_init': {
      const last = next[next.length - 1];
      if (last?.kind === 'session' || last?.kind === 'init') {
        if (event.model) last.model = event.model;
        if (event.cwd) last.cwd = event.cwd;
      } else {
        pushItem(next, { kind: 'session', model: event.model, cwd: event.cwd });
      }
      break;
    }
    case 'assistant_delta':
      if (event.text) mergeAssistantTail(next, event.text);
      break;
    case 'reasoning_delta':
    case 'thinking_delta':
      if (event.text) mergeReasoningTail(next, event.text);
      break;
    case 'command': {
      const idx = findCommandIndex(next, event.callId, event.command);
      const patch: Partial<AgentFeedItem & { kind: 'command' }> = {
        kind: 'command',
        summary: event.summary,
        callId: event.callId,
        commandActions: event.commandActions ?? parseCommandActions(event.command),
        resultPreview: event.resultPreview,
        durationMs: event.durationMs,
        exitCode: event.exitCode,
        ok: event.ok,
        status:
          event.phase === 'started'
            ? 'running'
            : event.ok === false || (event.exitCode ?? 0) !== 0
              ? 'failed'
              : 'completed',
      };
      if (idx >= 0) {
        const item = next[idx];
        if (item.kind === 'command') mergeCommandInto(item, patch);
      } else {
        pushItem(next, {
          kind: 'command',
          status: patch.status ?? 'running',
          summary: event.summary,
          command: event.command,
          callId: event.callId,
          commandActions: event.commandActions ?? parseCommandActions(event.command),
          resultPreview: event.resultPreview,
          durationMs: event.durationMs,
          exitCode: event.exitCode,
          ok: event.ok,
        });
      }
      break;
    }
    case 'tool_call': {
      const idx = findToolCallIndex(next, event.callId, event.toolName, event.detail);
      const patch: Partial<AgentFeedItem & { kind: 'tool_call' }> = {
        kind: 'tool_call',
        summary: event.summary,
        detail: event.detail,
        callId: event.callId,
        durationMs: event.durationMs,
        ok: event.ok,
        status:
          event.phase === 'started'
            ? 'running'
            : event.ok === false
              ? 'failed'
              : 'completed',
      };
      if (idx >= 0) {
        const item = next[idx];
        if (item.kind === 'tool_call') mergeToolCallInto(item, patch);
      } else {
        pushItem(next, {
          kind: 'tool_call',
          status: patch.status ?? 'running',
          summary: event.summary,
          toolName: event.toolName,
          detail: event.detail,
          callId: event.callId,
          durationMs: event.durationMs,
          ok: event.ok,
        });
      }
      break;
    }
    case 'tool_result': {
      const idx = findToolCallIndex(next, event.callId, event.toolName, event.detail);
      if (idx >= 0) {
        const item = next[idx];
        if (item.kind === 'tool_call') {
          mergeToolCallInto(item, {
            kind: 'tool_call',
            summary: event.summary,
            detail: event.detail,
            callId: event.callId,
            resultPreview: event.resultPreview,
            durationMs: event.durationMs,
            gitDiffUnified: event.gitDiffUnified,
            ok: event.ok,
            status: statusFromToolResult(event.ok),
          });
          break;
        }
      }
      pushItem(next, {
        kind: 'tool_call',
        status: statusFromToolResult(event.ok),
        summary: event.summary,
        toolName: event.toolName,
        detail: event.detail,
        callId: event.callId,
        resultPreview: event.resultPreview,
        durationMs: event.durationMs,
        gitDiffUnified: event.gitDiffUnified,
        ok: event.ok,
      });
      break;
    }
    case 'file_change': {
      const incoming: AgentFeedItem = {
        kind: 'file_change',
        path: event.path,
        summary: event.summary ?? `file · ${event.path}`,
        parentCallId: event.parentCallId,
        gitDiffUnified: event.gitDiffUnified,
      };
      const last = next[next.length - 1];
      if (last?.kind === 'file_change' && fileChangeStableKey(last) === fileChangeStableKey(incoming)) {
        if (incoming.gitDiffUnified !== undefined) last.gitDiffUnified = incoming.gitDiffUnified;
      } else {
        pushItem(next, incoming);
      }
      break;
    }
    case 'tool':
      appendLegacyToolEvent(next, event);
      break;
    case 'turn_result':
      pushItem(next, {
        kind: 'turn_result',
        ok: event.ok,
        durationMs: event.durationMs ?? undefined,
        error: event.error,
      });
      break;
    case 'user_turn':
      break;
    case 'todo_snapshot': {
      const items = event.items.map((item) => ({ ...item }));
      const last = next[next.length - 1];
      if (last?.kind === 'todo') last.items = items;
      else pushItem(next, { kind: 'todo', items });
      break;
    }
    default:
      break;
  }

  trimFeed(next);
  return next;
}

function firstNonEmptyLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0) ?? text.trim();
}

function summarizeBlock(text: string, maxChars = 140): string {
  const line = firstNonEmptyLine(text);
  if (line.length <= maxChars) return line;
  return `${line.slice(0, maxChars - 1)}…`;
}

function previewLineCount(text: string, previewLines = 4): { previewText?: string; omittedCount: number } {
  const trimmed = text.trim();
  if (!trimmed) return { previewText: undefined, omittedCount: 0 };
  const lines = trimmed.split(/\r?\n/);
  if (lines.length <= previewLines) return { previewText: trimmed, omittedCount: 0 };
  return {
    previewText: lines.slice(0, previewLines).join('\n'),
    omittedCount: lines.length - previewLines,
  };
}

function isOperationalAssistant(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 240 || /\n\s*[-*#]|```/.test(trimmed)) return false;
  if (trimmed.length > 90) return false;
  if (/[，,。.!?]/.test(trimmed)) return false;
  return /^(i('| a)?m |i will |i'm |checking|reading|searching|reviewing|inspecting|exploring|updating|running|continuing|looking|now |next )/i.test(
    trimmed
  );
}

function commandLower(command: string, summary: string): string {
  return `${command} ${summary}`.toLowerCase();
}

function classifyLowValueCommand(command: string, summary: string, actions?: AgentCommandAction[]): boolean {
  if (actions && actions.length > 0) {
    return actions.every((action) => action.type !== 'unknown');
  }
  const lower = commandLower(command, summary);
  return /(^|\s)(rg|grep|find|fd|ls|cat|sed|head|tail|wc|pwd|tree|git status|git diff --stat|git diff --name-only|git show)(\s|$)/.test(
    lower
  );
}

function classifyLowValueTool(toolName: string, summary: string, detail?: string): boolean {
  const lower = `${toolName} ${summary} ${detail ?? ''}`.toLowerCase();
  return /(read|search|grep|glob|find|list|ls|status|inspect|open|view|tool_search|stat)/.test(lower);
}

function summarizeActivityGroup(entries: AgentTranscriptDisplayItem[]): {
  summary: string;
  groupType: AgentActivityGroupType;
} {
  let searches = 0;
  let reads = 0;
  let lists = 0;
  let commands = 0;
  let assistant = 0;
  for (const entry of entries) {
    if (entry.kind === 'assistant') {
      assistant += 1;
      continue;
    }
    if (entry.kind === 'command') {
      const actions = entry.commandActions ?? parseCommandActions(entry.command);
      for (const action of actions) {
        if (action.type === 'search') searches += 1;
        else if (action.type === 'read') reads += 1;
        else if (action.type === 'list_files') lists += 1;
        else commands += 1;
      }
      continue;
    }
    if (entry.kind === 'tool_call') {
      const lower = `${entry.toolName} ${entry.summary} ${entry.detail ?? ''}`.toLowerCase();
      if (/(search|grep|glob|find)/.test(lower)) searches += 1;
      else if (/(read|open|view)/.test(lower)) reads += 1;
      else if (/(list|ls)/.test(lower)) lists += 1;
      else commands += 1;
    }
  }

  if (assistant > 0 && searches + reads + lists + commands === 0) {
    return {
      summary: assistant === 1 ? 'Shared 1 progress update' : `Shared ${assistant} progress updates`,
      groupType: 'assistant_progress',
    };
  }

  const parts: string[] = [];
  if (reads > 0) parts.push(`${reads} ${reads === 1 ? 'file' : 'files'}`);
  if (searches > 0) parts.push(`${searches} ${searches === 1 ? 'search' : 'searches'}`);
  if (lists > 0) parts.push(`${lists} ${lists === 1 ? 'listing' : 'listings'}`);
  if (commands > 0) parts.push(`${commands} ${commands === 1 ? 'command' : 'commands'}`);
  return {
    summary:
      parts.length > 0
        ? `Explored ${parts.join(', ')}`
        : `Explored ${entries.length} low-signal steps`,
    groupType: 'tool_activity',
  };
}

function parseDiffPath(line: string): { oldPath?: string; newPath?: string; path: string } {
  const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (match) {
    return { oldPath: match[1], newPath: match[2], path: match[2] || match[1] };
  }
  return { path: 'changed file' };
}

export function parseUnifiedDiff(diff: string): AgentParsedDiffFile[] {
  const lines = diff.trimEnd().split('\n');
  const files: AgentParsedDiffFile[] = [];
  let current: AgentParsedDiffFile | null = null;
  let oldLine: number | null = null;
  let newLine: number | null = null;

  const pushRow = (row: AgentDiffRow) => {
    if (!current) {
      current = { path: 'changed file', added: 0, removed: 0, rows: [] };
    }
    current.rows.push(row);
    if (row.kind === 'added') current.added += 1;
    if (row.kind === 'removed') current.removed += 1;
  };

  const flush = () => {
    if (current) files.push(current);
    current = null;
    oldLine = null;
    newLine = null;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush();
      const { path, oldPath, newPath } = parseDiffPath(line);
      current = { path, oldPath, newPath, added: 0, removed: 0, rows: [{ kind: 'file', text: line }] };
      continue;
    }
    if (!current) {
      current = { path: 'changed file', added: 0, removed: 0, rows: [] };
    }
    if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      pushRow({ kind: 'meta', text: line });
      continue;
    }
    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLine = match ? Number(match[1]) : null;
      newLine = match ? Number(match[2]) : null;
      pushRow({ kind: 'hunk', text: line });
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      pushRow({
        kind: 'added',
        text: line.slice(1),
        sign: '+',
        oldLineNumber: null,
        newLineNumber: newLine,
      });
      if (newLine != null) newLine += 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      pushRow({
        kind: 'removed',
        text: line.slice(1),
        sign: '-',
        oldLineNumber: oldLine,
        newLineNumber: null,
      });
      if (oldLine != null) oldLine += 1;
      continue;
    }
    const text = line.startsWith(' ') ? line.slice(1) : line;
    pushRow({
      kind: 'context',
      text,
      sign: ' ',
      oldLineNumber: oldLine,
      newLineNumber: newLine,
    });
    if (oldLine != null) oldLine += 1;
    if (newLine != null) newLine += 1;
  }

  flush();
  return files;
}

function displayMeta(
  importance: AgentTranscriptDisplayMeta['importance'],
  options: Omit<AgentTranscriptDisplayMeta, 'importance'> = {}
): AgentTranscriptDisplayMeta {
  return { importance, ...options };
}

function dedupeConsecutiveSessions(items: AgentTranscriptDisplayItem[]): AgentTranscriptDisplayItem[] {
  if (items.length < 2) return items;
  const out: AgentTranscriptDisplayItem[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (
      item.kind === 'session' &&
      prev?.kind === 'session' &&
      prev.model === item.model &&
      prev.cwd === item.cwd
    ) {
      continue;
    }
    out.push(item);
  }
  return out;
}

function normalizeDisplayItems(feed: AgentFeedItem[]): AgentTranscriptDisplayItem[] {
  const items: AgentTranscriptDisplayItem[] = [];
  for (const item of feed) {
    switch (item.kind) {
      case 'session':
      case 'init':
        items.push({
          kind: 'session',
          model: item.model,
          cwd: item.cwd,
          display: displayMeta('secondary'),
        });
        break;
      case 'assistant': {
        const summary = summarizeBlock(item.text);
        const operational = isOperationalAssistant(item.text);
        const preview = previewLineCount(item.text);
        items.push({
          kind: 'assistant',
          text: item.text,
          summary,
          display: displayMeta(operational ? 'secondary' : 'primary', {
            collapsed: operational,
            expandable: preview.omittedCount > 0 || summary !== item.text.trim(),
            previewText: preview.previewText ?? summary,
            omittedCount: preview.omittedCount,
          }),
        });
        break;
      }
      case 'reasoning':
      case 'thinking': {
        const text = item.kind === 'reasoning' ? item.text : item.text;
        const summary = item.kind === 'reasoning' ? item.summary : summarizeReasoning(item.text);
        const preview = previewLineCount(text, 3);
        items.push({
          kind: 'reasoning',
          text,
          summary,
          status: item.kind === 'reasoning' ? item.status : 'completed',
          display: displayMeta('secondary', {
            collapsed: item.kind !== 'reasoning' || item.status !== 'running',
            expandable: preview.omittedCount > 0 || text.trim() !== summary,
            previewText: preview.previewText ?? summary,
            omittedCount: preview.omittedCount,
          }),
        });
        break;
      }
      case 'command': {
        const preview = previewLineCount(item.resultPreview ?? '', 4);
        const commandActions = item.commandActions ?? parseCommandActions(item.command);
        const lowValue = classifyLowValueCommand(item.command, item.summary, commandActions);
        items.push({
          ...item,
          commandActions,
          display: displayMeta(lowValue ? 'secondary' : 'primary', {
            collapsed: item.status !== 'running',
            expandable: Boolean(item.resultPreview && preview.omittedCount > 0),
            previewText: preview.previewText ?? summarizeBlock(item.resultPreview ?? item.summary, 110),
            omittedCount: preview.omittedCount,
          }),
        });
        break;
      }
      case 'tool_call': {
        const preview = previewLineCount(item.resultPreview ?? '', 4);
        const lowValue = !item.gitDiffUnified && classifyLowValueTool(item.toolName, item.summary, item.detail);
        items.push({
          ...item,
          display: displayMeta(lowValue ? 'secondary' : 'primary', {
            collapsed: item.status !== 'running' && !item.gitDiffUnified,
            expandable: Boolean(item.resultPreview && preview.omittedCount > 0),
            previewText: preview.previewText ?? summarizeBlock(item.resultPreview ?? item.summary, 110),
            omittedCount: preview.omittedCount,
          }),
        });
        if (item.gitDiffUnified) {
          const diffFiles = parseUnifiedDiff(item.gitDiffUnified);
          const filePath = item.detail ?? diffFiles[0]?.path ?? 'changed file';
          items.push({
            kind: 'file_change',
            path: filePath,
            summary: item.detail ? `Changed ${item.detail}` : `Changed ${filePath}`,
            parentCallId: item.callId,
            gitDiffUnified: item.gitDiffUnified,
            diffFiles,
            display: displayMeta('primary', {
              collapsed: true,
              expandable: diffFiles.some((file) => file.rows.length > 10),
            }),
          });
        }
        break;
      }
      case 'file_change': {
        const diffFiles = item.gitDiffUnified ? parseUnifiedDiff(item.gitDiffUnified) : [];
        items.push({
          kind: 'file_change',
          path: item.path,
          summary: item.summary,
          parentCallId: item.parentCallId,
          gitDiffUnified: item.gitDiffUnified,
          diffFiles,
          display: displayMeta('primary', {
            collapsed: true,
            expandable: diffFiles.some((file) => file.rows.length > 10),
          }),
        });
        break;
      }
      case 'todo':
        items.push({
          kind: 'todo',
          items: item.items,
          display: displayMeta('primary', {
            collapsed: !item.items.some((entry) => entry.status === 'in_progress'),
          }),
        });
        break;
      case 'turn_result':
      case 'result':
        items.push({
          kind: 'turn_result',
          ok: item.ok,
          durationMs: item.durationMs,
          error: 'error' in item ? item.error : undefined,
          display: displayMeta('primary'),
        });
        break;
      case 'tool':
      case 'user_turn':
        break;
      default:
        break;
    }
  }
  return dedupeConsecutiveSessions(items);
}

function shouldGroupSecondaryActivity(item: AgentTranscriptDisplayItem): boolean {
  if (item.kind === 'assistant') return item.display.importance === 'secondary';
  if (item.kind === 'command') {
    return item.display.importance === 'secondary';
  }
  if (item.kind === 'tool_call') {
    return item.display.importance === 'secondary' && !item.gitDiffUnified;
  }
  return false;
}

function detailLabel(item: AgentTranscriptDisplayItem): string {
  switch (item.kind) {
    case 'assistant':
      return item.summary;
    case 'command':
      if (item.commandActions && item.commandActions.length > 0) {
        const lines = item.commandActions.map((action) => summarizeCommandAction(action));
        const unique = [...new Set(lines)];
        if (unique.length === 1) return unique[0];
        return unique.join('\n');
      }
      return item.command;
    case 'tool_call':
      return item.detail ?? item.summary;
    default:
      return '';
  }
}

function mergeConsecutiveFileChanges(items: AgentTranscriptDisplayItem[]): AgentTranscriptDisplayItem[] {
  const out: AgentTranscriptDisplayItem[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (
      item.kind === 'file_change' &&
      prev?.kind === 'file_change' &&
      prev.path === item.path &&
      prev.gitDiffUnified &&
      item.gitDiffUnified
    ) {
      prev.gitDiffUnified = item.gitDiffUnified;
      prev.diffFiles = item.diffFiles;
      prev.summary = item.summary;
      continue;
    }
    out.push(item);
  }
  return out;
}

export function buildAgentTranscriptDisplayItems(feed: AgentFeedItem[]): AgentTranscriptDisplayItem[] {
  const normalized = mergeConsecutiveFileChanges(normalizeDisplayItems(feed));
  const out: AgentTranscriptDisplayItem[] = [];
  let groupBuffer: AgentTranscriptDisplayItem[] = [];

  const flushGroup = () => {
    if (groupBuffer.length === 0) return;
    if (groupBuffer.length === 1) {
      out.push(groupBuffer[0]);
    } else {
      const { summary, groupType } = summarizeActivityGroup(groupBuffer);
      out.push({
        kind: 'activity_group',
        summary,
        groupType,
        entries: groupBuffer.flatMap((entry) =>
          detailLabel(entry)
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        ),
        display: displayMeta('collapsed_group', {
          collapsed: true,
          expandable: true,
          groupLabel: groupType === 'assistant_progress' ? 'PROGRESS' : 'ACTIVITY',
        }),
      });
    }
    groupBuffer = [];
  };

  for (const item of normalized) {
    if (shouldGroupSecondaryActivity(item)) {
      groupBuffer.push(item);
      continue;
    }
    flushGroup();
    out.push(item);
  }
  flushGroup();
  return out;
}
