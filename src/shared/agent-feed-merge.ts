import type { AgentFeedItem, AgentStreamUiEvent } from './types.js';

const MAX_FEED_ITEMS = 400;
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

function toolStableKey(item: {
  callId?: string;
  summary: string;
}): string {
  if (item.callId && item.callId.length > 0) return item.callId;
  return item.summary;
}

function mergeToolInto(
  target: AgentFeedItem & { kind: 'tool' },
  event: AgentStreamUiEvent & { kind: 'tool' }
): void {
  target.phase = event.phase;
  if (event.toolName) target.toolName = event.toolName;
  if (event.detail) target.detail = event.detail;
  if (event.callId) target.callId = event.callId;
  if (event.summary.length > target.summary.length) target.summary = event.summary;
  if (event.ok !== undefined) target.ok = event.ok;
  if (event.resultPreview !== undefined) target.resultPreview = event.resultPreview;
}

/** Open tool with same toolName and detail (strict). */
function findOpenToolByNameAndDetail(
  next: AgentFeedItem[],
  toolName: string | undefined,
  detail: string | undefined
): number {
  if (!toolName || detail === undefined || detail === '') return -1;
  for (let i = next.length - 1; i >= 0; i--) {
    const it = next[i];
    if (
      it.kind === 'tool' &&
      it.phase !== 'completed' &&
      it.toolName === toolName &&
      it.detail === detail
    ) {
      return i;
    }
  }
  return -1;
}

/** When exactly one in-flight tool matches toolName (for completed/update without stable callId). */
function findSingleOpenToolByName(next: AgentFeedItem[], toolName: string | undefined): number {
  if (!toolName) return -1;
  let found = -1;
  let count = 0;
  for (let i = next.length - 1; i >= 0; i--) {
    const it = next[i];
    if (it.kind === 'tool' && it.phase !== 'completed' && it.toolName === toolName) {
      count += 1;
      found = i;
    }
  }
  return count === 1 ? found : -1;
}

function mergeTail(
  next: AgentFeedItem[],
  kind: 'assistant' | 'thinking',
  text: string
): void {
  const t = capText(text);
  const last = next[next.length - 1];
  if (last?.kind === kind) {
    last.text = capText(last.text + t);
  } else {
    next.push({ kind, text: t });
  }
  trimFeed(next);
}

/** Client + server: merge one stream event into the activity feed. */
export function applyAgentStreamEvent(
  feed: AgentFeedItem[],
  event: AgentStreamUiEvent
): AgentFeedItem[] {
  const next = [...feed];

  switch (event.kind) {
    case 'session_init': {
      const last = next[next.length - 1];
      if (last?.kind === 'init') {
        if (event.model && event.model.length > 0) last.model = event.model;
        if (event.cwd && event.cwd.length > 0) last.cwd = event.cwd;
        trimFeed(next);
        break;
      }
      pushItem(next, { kind: 'init', model: event.model, cwd: event.cwd });
      break;
    }
    case 'assistant_delta':
      if (event.text) mergeTail(next, 'assistant', event.text);
      break;
    case 'thinking_delta':
      if (event.text) mergeTail(next, 'thinking', event.text);
      break;
    case 'tool': {
      const incoming: AgentFeedItem = {
        kind: 'tool',
        phase: event.phase,
        summary: event.summary,
        toolName: event.toolName,
        detail: event.detail,
        callId: event.callId,
        ...(event.ok !== undefined ? { ok: event.ok } : {}),
        ...(event.resultPreview !== undefined ? { resultPreview: event.resultPreview } : {}),
      };
      const key = toolStableKey(incoming);
      const last = next[next.length - 1];
      if (last?.kind === 'tool' && key.length > 0 && toolStableKey(last) === key) {
        if (event.phase === 'started') {
          if (last.phase !== 'completed') break;
        } else if (last.phase !== 'completed') {
          mergeToolInto(last, event);
          trimFeed(next);
          break;
        }
      }

      if (event.phase === 'started') {
        const dup = findOpenToolByNameAndDetail(next, event.toolName, event.detail);
        if (dup >= 0) break;
      } else {
        let j = findOpenToolByNameAndDetail(next, event.toolName, event.detail);
        if (j < 0) j = findSingleOpenToolByName(next, event.toolName);
        if (j >= 0) {
          const open = next[j];
          if (open.kind === 'tool') {
            mergeToolInto(open, event);
            trimFeed(next);
            break;
          }
        }
      }

      pushItem(next, incoming);
      break;
    }
    case 'turn_result':
      pushItem(next, {
        kind: 'result',
        ok: event.ok,
        durationMs: event.durationMs ?? undefined,
      });
      break;
    case 'user_turn':
      // Intentionally ignored: activity feed does not show user-turn placeholders.
      break;
    case 'todo_snapshot': {
      const items = event.items.map((i) => ({ ...i }));
      const last = next[next.length - 1];
      if (last?.kind === 'todo') {
        last.items = items;
      } else {
        pushItem(next, { kind: 'todo', items });
      }
      trimFeed(next);
      break;
    }
    default:
      break;
  }

  return next;
}
