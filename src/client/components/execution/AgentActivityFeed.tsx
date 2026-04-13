import { CheckCircle2, ChevronDown, Circle, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AgentFeedItem } from '@shared/types';
import { AgentMarkdownBody } from './AgentMarkdownBody';

export type AgentActivityFeedLabels = {
  thinking: string;
  tool: string;
  session: string;
  completed: string;
  failed: string;
  toolPhaseRunning: string;
  toolPhaseDone: string;
  toolResult: string;
  todoTitle: string;
};

export interface AgentActivityFeedProps {
  items: AgentFeedItem[];
  isLive?: boolean;
  noActivityText: string;
  labels: AgentActivityFeedLabels;
}

function toolStripeColor(phase: 'started' | 'completed' | 'update'): string {
  if (phase === 'completed') return 'var(--status-completed, #3fb950)';
  if (phase === 'started') return 'var(--accent-primary, #58a6ff)';
  return 'var(--color-border)';
}

function toolPhaseBadgeText(
  phase: 'started' | 'completed' | 'update',
  labels: AgentActivityFeedLabels
): string {
  if (phase === 'completed') return labels.toolPhaseDone;
  return labels.toolPhaseRunning;
}

function firstLinePreview(text: string, maxLen: number): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? text;
  const t = line.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function toolCollapsedSummary(item: AgentFeedItem & { kind: 'tool' }): string {
  const primary = item.toolName ?? item.summary;
  const secondary =
    item.detail ??
    (item.toolName && item.summary !== item.toolName ? item.summary : undefined);
  if (secondary) {
    const short = secondary.length > 72 ? `${secondary.slice(0, 71)}…` : secondary;
    return `${primary} · ${short}`;
  }
  return primary;
}

export function AgentActivityFeed({
  items,
  isLive,
  noActivityText,
  labels,
}: AgentActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [openThinking, setOpenThinking] = useState<Record<number, boolean>>({});
  const [openTools, setOpenTools] = useState<Record<number, boolean>>({});
  const [openTodos, setOpenTodos] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!isLive || !bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isLive, items]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12 text-center">
        <p className="text-sm theme-text-muted max-w-sm">{noActivityText}</p>
      </div>
    );
  }

  const lastIdx = items.length - 1;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
      {items.map((item, i) => {
        switch (item.kind) {
          case 'init':
            return (
              <div
                key={`init-${i}`}
                className="rounded-lg px-3 py-2 text-[11px] theme-text-muted theme-bg-0"
                style={{ border: '1px solid var(--color-border)' }}
              >
                <span className="font-medium theme-text-secondary">{labels.session}</span>
                {item.model ? ` · ${item.model}` : ''}
                {item.cwd ? (
                  <div className="mt-1 font-mono text-[10px] opacity-80 truncate" title={item.cwd}>
                    {item.cwd}
                  </div>
                ) : null}
              </div>
            );
          case 'user_turn':
            return null;
          case 'thinking': {
            const substantial = item.text.length > 120;
            const open = openThinking[i] ?? !substantial;
            const isStreaming = Boolean(isLive && i === lastIdx);
            const preview = firstLinePreview(item.text, 96);
            return (
              <div
                key={`think-${i}`}
                className="rounded-xl overflow-hidden theme-bg-0"
                style={{ border: '1px solid var(--color-border)' }}
              >
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-medium theme-text-muted theme-hover"
                  onClick={() => setOpenThinking((s) => ({ ...s, [i]: !open }))}
                >
                  {isStreaming ? (
                    <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin opacity-80" aria-hidden />
                  ) : null}
                  <span className="shrink-0">{labels.thinking}</span>
                  {!open && preview ? (
                    <span className="flex-1 min-w-0 truncate text-[10px] opacity-70 font-normal">
                      {preview}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                {open ? (
                  <div className="px-3 pb-3 text-[11px] leading-relaxed theme-text-secondary border-t border-[var(--color-border)] border-opacity-50 pt-2">
                    <AgentMarkdownBody variant="dim" text={item.text} />
                  </div>
                ) : null}
              </div>
            );
          }
          case 'assistant':
            return (
              <div key={`asst-${i}`} className="flex justify-start">
                <div
                  className="max-w-[min(100%,52rem)] rounded-2xl rounded-tl-md px-3.5 py-2.5"
                  style={{
                    background: 'var(--color-bg-elevated, rgba(255,255,255,0.04))',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <AgentMarkdownBody text={item.text} />
                </div>
              </div>
            );
          case 'tool': {
            const stripe = toolStripeColor(item.phase);
            const primary = item.toolName ?? item.summary;
            const secondary =
              item.detail ??
              (item.toolName && item.summary !== item.toolName ? item.summary : undefined);
            const expanded = openTools[i] ?? false;
            const oneLine = toolCollapsedSummary(item);
            return (
              <div
                key={`tool-${i}`}
                className="rounded-lg overflow-hidden"
                style={{
                  borderLeft: `3px solid ${stripe}`,
                  background: 'var(--color-bg-0)',
                  border: '1px solid var(--color-border)',
                  borderLeftWidth: 3,
                }}
              >
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left theme-hover"
                  onClick={() => setOpenTools((s) => ({ ...s, [i]: !expanded }))}
                >
                  <span className="text-[9px] uppercase tracking-wider theme-text-muted shrink-0">
                    {labels.tool}
                  </span>
                  <span className="flex-1 min-w-0 text-[12px] font-mono theme-text-secondary truncate">
                    {expanded ? primary : oneLine}
                  </span>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded shrink-0 theme-bg-2 theme-text-muted"
                    style={{ border: '1px solid var(--color-border)' }}
                  >
                    {toolPhaseBadgeText(item.phase, labels)}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 opacity-60 theme-text-muted transition-transform ${
                      expanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  />
                </button>
                {expanded ? (
                  <div
                    className="px-3 pb-3 pt-0 space-y-1.5 border-t border-[var(--color-border)] border-opacity-50"
                  >
                    <div className="text-[12px] font-semibold font-mono theme-text-secondary break-all pt-2">
                      {primary}
                    </div>
                    {secondary ? (
                      <div className="text-[11px] theme-text-secondary/90 break-words font-mono leading-snug">
                        {secondary}
                      </div>
                    ) : null}
                    {item.resultPreview ? (
                      <div className="mt-2">
                        <div className="text-[10px] font-medium theme-text-muted mb-1">{labels.toolResult}</div>
                        <div
                          className={`text-[11px] font-mono rounded-md p-2 border theme-bg-0 whitespace-pre-wrap max-h-40 overflow-y-auto ${
                            item.ok === false
                              ? 'border-red-500/40 text-red-200/90'
                              : 'border-[var(--color-border)] theme-text-muted'
                          }`}
                        >
                          {item.resultPreview}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          }
          case 'todo': {
            const expanded = openTodos[i] ?? false;
            return (
              <div
                key={`todo-${i}`}
                className="rounded-lg overflow-hidden theme-bg-0"
                style={{ border: '1px solid var(--color-border)' }}
              >
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left theme-hover"
                  onClick={() => setOpenTodos((s) => ({ ...s, [i]: !expanded }))}
                >
                  <span className="text-[12px] font-medium theme-text-secondary">{labels.todoTitle}</span>
                  <span className="flex-1" />
                  <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 opacity-60 theme-text-muted transition-transform ${
                      expanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  />
                </button>
                {expanded ? (
                  <ul className="px-3 pb-3 pt-2 space-y-2 border-t border-[var(--color-border)] border-opacity-50 list-none m-0">
                    {item.items.map((todo) => (
                      <li key={todo.id} className="flex items-start gap-2 text-[11px] theme-text-secondary">
                        {todo.status === 'completed' ? (
                          <CheckCircle2
                            className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500/90"
                            aria-hidden
                          />
                        ) : todo.status === 'in_progress' ? (
                          <Loader2
                            className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-spin opacity-80"
                            aria-hidden
                          />
                        ) : (
                          <Circle className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60" aria-hidden />
                        )}
                        <span
                          className={`min-w-0 flex-1 leading-snug ${
                            todo.status === 'completed' ? 'line-through opacity-70' : ''
                          }`}
                        >
                          {todo.content}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          }
          case 'result': {
            const ok = item.ok;
            return (
              <div
                key={`res-${i}`}
                className={`rounded-lg px-3 py-2 text-xs font-medium ${
                  ok ? 'text-emerald-400/90' : 'text-red-400/90'
                }`}
                style={{
                  background: ok ? 'rgba(16, 185, 129, 0.08)' : 'rgba(248, 113, 113, 0.08)',
                  border: `1px solid ${ok ? 'rgba(16,185,129,0.25)' : 'rgba(248,113,113,0.25)'}`,
                }}
              >
                {ok ? labels.completed : labels.failed}
                {item.durationMs != null ? ` · ${item.durationMs}ms` : ''}
              </div>
            );
          }
          default:
            return null;
        }
      })}
      <div ref={bottomRef} className="h-1" aria-hidden />
    </div>
  );
}
