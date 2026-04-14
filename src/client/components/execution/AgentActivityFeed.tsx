import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleAlert,
  Loader2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  parseCommandActions,
  summarizeCommandAction,
  type AgentParsedDiffFile,
  type AgentTranscriptDisplayItem,
  type AgentTranscriptStatus,
} from '@shared/types';
import { buildAgentTranscriptDisplayItems } from '@shared/agent-feed-merge';
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
  toolGitDiff: string;
  todoTitle: string;
  transcriptAll: string;
  transcriptChanges: string;
  changedFilesTitle: string;
  filesChangedCount: string;
  showMore: string;
  showLess: string;
  omittedLines: string;
};

export interface AgentActivityFeedProps {
  items: AgentFeedItem[];
  isLive?: boolean;
  initialPrompt?: string;
  noActivityText: string;
  labels: AgentActivityFeedLabels;
}

type TranscriptFilter = 'all' | 'changes';

const DIFF_PREVIEW_ROWS = 14;
const ACCENT_TEXT = 'var(--color-text-primary)';
const ACCENT_MUTED = 'var(--color-text-secondary)';
const ACCENT_BG = 'var(--color-active-bg)';
const BORDER_COLOR = 'var(--color-border)';

function itemKey(item: AgentTranscriptDisplayItem, index: number): string {
  switch (item.kind) {
    case 'session':
      return `session:${item.model ?? ''}:${item.cwd ?? ''}:${index}`;
    case 'assistant':
      return `assistant:${index}:${item.summary.slice(0, 32)}`;
    case 'reasoning':
      return `reasoning:${index}:${item.summary.slice(0, 32)}`;
    case 'command':
      return `command:${item.callId ?? item.command}:${index}`;
    case 'tool_call':
      return `tool:${item.callId ?? `${item.toolName}:${item.detail ?? ''}`}:${index}`;
    case 'file_change':
      return `file:${item.parentCallId ?? ''}:${item.path}:${index}`;
    case 'activity_group':
      return `group:${item.groupType}:${item.summary}:${index}`;
    case 'todo':
      return `todo:${index}:${item.items.length}`;
    case 'turn_result':
      return `turn:${index}:${item.ok ? 'ok' : 'fail'}`;
    default:
      return `item:${index}`;
  }
}

function isChangeItem(item: AgentTranscriptDisplayItem): boolean {
  return item.kind === 'file_change';
}

function lineStatsFromFiles(files: AgentParsedDiffFile[]): { added: number; removed: number } {
  return files.reduce(
    (acc, file) => ({ added: acc.added + file.added, removed: acc.removed + file.removed }),
    { added: 0, removed: 0 }
  );
}

function statusText(status: AgentTranscriptStatus, labels: AgentActivityFeedLabels): string {
  if (status === 'running') return labels.toolPhaseRunning;
  if (status === 'failed') return labels.failed;
  return labels.toolPhaseDone;
}

function actionText(item: AgentTranscriptDisplayItem, labels: AgentActivityFeedLabels): string {
  switch (item.kind) {
    case 'reasoning':
      return item.summary;
    case 'command': {
      const actions = item.commandActions ?? parseCommandActions(item.command);
      if (actions.length > 0 && actions.some((action) => action.type !== 'unknown')) {
        const lines = [...new Set(actions.map((action) => summarizeCommandAction(action)))];
        if (lines.length === 1) return lines[0];
        return `Explored ${lines.length} command actions`;
      }
      return `Ran ${item.command}`;
    }
    case 'tool_call': {
      const lower = item.toolName.toLowerCase();
      if (lower.includes('edit') || lower.includes('write')) return `Edited ${item.detail ?? item.summary}`;
      if (lower.includes('read') || lower.includes('open') || lower.includes('view')) return `Read ${item.detail ?? item.summary}`;
      if (lower.includes('search') || lower.includes('grep') || lower.includes('glob') || lower.includes('find')) {
        return `Searched ${item.detail ?? item.summary}`;
      }
      if (lower.includes('list') || lower === 'ls') return `Listed ${item.detail ?? item.summary}`;
      return `Used ${item.summary}`;
    }
    case 'file_change':
      return `Edited ${item.path}`;
    case 'activity_group':
      return item.summary;
    case 'todo': {
      const done = item.items.filter((todo) => todo.status === 'completed').length;
      return `${labels.todoTitle} ${done}/${item.items.length}`;
    }
    default:
      return '';
  }
}

function ExpandInlineButton({
  expanded,
  omittedCount,
  labels,
  onClick,
}: {
  expanded: boolean;
  omittedCount?: number;
  labels: AgentActivityFeedLabels;
  onClick: () => void;
}) {
  const text = expanded
    ? labels.showLess
    : omittedCount && omittedCount > 0
      ? labels.omittedLines.replace('{count}', String(omittedCount))
      : labels.showMore;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium"
      style={{ color: ACCENT_TEXT }}
    >
      {text}
    </button>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
      style={{
        background: active ? ACCENT_BG : 'transparent',
        color: active ? ACCENT_TEXT : ACCENT_MUTED,
        border: `1px solid ${BORDER_COLOR}`,
      }}
    >
      {children}
    </button>
  );
}

function InlineSummary({
  text,
  muted = true,
  trailing,
}: {
  text: string;
  muted?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="mt-[0.45rem] size-1.5 rounded-full shrink-0"
        style={{ background: muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
      />
      <div className="min-w-0 flex-1 flex items-start gap-3">
        <div className={`min-w-0 flex-1 text-sm leading-7 text-pretty ${muted ? 'theme-text-secondary' : 'theme-text'}`}>
          {text}
        </div>
        {trailing ? <div className="shrink-0 pt-1">{trailing}</div> : null}
      </div>
    </div>
  );
}

function DisclosureRow({
  summary,
  muted = true,
  expanded,
  onToggle,
  children,
  trailing,
}: {
  summary: string;
  muted?: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="py-1.5">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <InlineSummary
          text={summary}
          muted={muted}
          trailing={
            <div className="flex items-center gap-3">
              {trailing}
              <ChevronDown
                className={`w-4 h-4 theme-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </div>
          }
        />
      </button>
      {expanded ? <div className="ml-[1.05rem] mt-2">{children}</div> : null}
    </div>
  );
}

function DetailPanel({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{
        border: `1px solid ${BORDER_COLOR}`,
        background: 'color-mix(in srgb, var(--color-surface-0) 96%, var(--color-surface-1) 4%)',
      }}
    >
      {children}
    </div>
  );
}

function DiffRows({ files, expanded }: { files: AgentParsedDiffFile[]; expanded: boolean }) {
  return (
    <div className="space-y-3">
      {files.map((file) => {
        const rows = expanded ? file.rows : file.rows.slice(0, DIFF_PREVIEW_ROWS);
        return (
          <div
            key={`${file.path}-${file.rows.length}`}
            className="rounded-xl overflow-hidden"
            style={{
              border: `1px solid ${BORDER_COLOR}`,
              background: 'color-mix(in srgb, var(--color-surface-1) 92%, var(--color-surface-0) 8%)',
            }}
          >
            <div
              className="flex items-center justify-between gap-3 px-3 py-2"
              style={{
                background: 'color-mix(in srgb, var(--color-surface-0) 80%, var(--color-surface-1) 20%)',
                borderBottom: `1px solid ${BORDER_COLOR}`,
              }}
            >
              <div className="min-w-0">
                <div className="text-xs font-medium theme-text-secondary truncate">{file.path}</div>
                {file.oldPath && file.newPath && file.oldPath !== file.newPath ? (
                  <div className="text-xs font-mono theme-text-tertiary truncate">
                    {file.oldPath} → {file.newPath}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2 shrink-0 text-xs font-mono tabular-nums">
                <span className="text-emerald-700">+{file.added}</span>
                <span className="text-red-700">-{file.removed}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono text-xs leading-snug tabular-nums">
                <tbody>
                  {rows.map((row, index) => {
                    const sign = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : row.kind === 'hunk' ? '@' : ' ';
                    const bg =
                      row.kind === 'added'
                        ? 'rgba(22,163,74,0.12)'
                        : row.kind === 'removed'
                          ? 'rgba(220,38,38,0.12)'
                          : row.kind === 'hunk'
                            ? 'color-mix(in srgb, var(--color-active-bg) 82%, var(--color-surface-1) 18%)'
                            : row.kind === 'meta' || row.kind === 'file'
                              ? 'color-mix(in srgb, var(--color-surface-0) 84%, var(--color-surface-1) 16%)'
                              : 'transparent';
                    const color =
                      row.kind === 'added'
                        ? '#166534'
                        : row.kind === 'removed'
                          ? '#991b1b'
                          : row.kind === 'hunk'
                            ? 'var(--color-text-primary)'
                            : row.kind === 'meta' || row.kind === 'file'
                              ? 'var(--color-text-muted)'
                              : 'var(--color-text-secondary)';
                    return (
                      <tr key={`${file.path}-${index}-${row.text.slice(0, 16)}`} style={{ background: bg, color }}>
                        <td className="w-8 px-2 py-1 text-center opacity-80">{sign}</td>
                        <td className="w-12 px-2 py-1 text-right opacity-50">{row.oldLineNumber ?? ''}</td>
                        <td className="w-12 px-2 py-1 text-right opacity-50">{row.newLineNumber ?? ''}</td>
                        <td className="px-3 py-1 whitespace-pre">{row.text || ' '}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RunningMarker({
  status,
  labels,
}: {
  status: AgentTranscriptStatus;
  labels: AgentActivityFeedLabels;
}) {
  if (status === 'running') {
    return (
      <div className="flex items-center gap-1 text-xs" style={{ color: ACCENT_TEXT }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>{labels.toolPhaseRunning}</span>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="flex items-center gap-1 text-xs" style={{ color: '#b91c1c' }}>
        <CircleAlert className="w-3.5 h-3.5" />
        <span>{labels.failed}</span>
      </div>
    );
  }
  return (
    <div className="text-xs theme-text-tertiary">
      {labels.toolPhaseDone}
    </div>
  );
}

export function AgentActivityFeed({
  items,
  isLive,
  initialPrompt,
  noActivityText,
  labels,
}: AgentActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<TranscriptFilter>('all');
  const displayItems = useMemo(() => buildAgentTranscriptDisplayItems(items), [items]);
  const filteredItems = useMemo(
    () => (filter === 'changes' ? displayItems.filter(isChangeItem) : displayItems),
    [displayItems, filter]
  );
  const changeCount = useMemo(
    () => displayItems.filter((item) => item.kind === 'file_change').length,
    [displayItems]
  );

  useEffect(() => {
    if (!isLive || !bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [filteredItems, isLive]);

  const lastRunningReasoningKey = useMemo(() => {
    for (let i = filteredItems.length - 1; i >= 0; i--) {
      const item = filteredItems[i];
      if (item.kind === 'reasoning' && item.status === 'running') return itemKey(item, i);
    }
    return null;
  }, [filteredItems]);

  const lastRunningCallKey = useMemo(() => {
    for (let i = filteredItems.length - 1; i >= 0; i--) {
      const item = filteredItems[i];
      if ((item.kind === 'command' || item.kind === 'tool_call') && item.status === 'running') {
        return itemKey(item, i);
      }
    }
    return null;
  }, [filteredItems]);

  const isExpandedByDefault = (item: AgentTranscriptDisplayItem, key: string): boolean => {
    if (item.kind === 'reasoning') return item.status === 'running' || key === lastRunningReasoningKey;
    if (item.kind === 'command' || item.kind === 'tool_call') {
      return item.status === 'running' || key === lastRunningCallKey;
    }
    if (item.kind === 'todo') return item.items.some((todo) => todo.status === 'in_progress') || Boolean(isLive);
    return item.display.collapsed !== true;
  };

  const isOpen = (item: AgentTranscriptDisplayItem, key: string): boolean => {
    const stored = openItems[key];
    if (stored !== undefined) return stored;
    return isExpandedByDefault(item, key);
  };

  if (displayItems.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12 text-center">
        <p className="text-sm theme-text-muted max-w-sm">{noActivityText}</p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-6 py-5 min-h-0"
      style={{
        background: 'color-mix(in srgb, var(--color-surface-0) 97%, var(--color-surface-1) 3%)',
      }}
    >
      <div className="mx-auto max-w-[52rem]">
        <div className="flex items-center justify-between gap-3 pb-4 mb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
              {labels.transcriptAll}
            </FilterPill>
            <FilterPill active={filter === 'changes'} onClick={() => setFilter('changes')}>
              {labels.transcriptChanges}
            </FilterPill>
          </div>
          <div className="text-xs theme-text-tertiary tabular-nums">
            {labels.filesChangedCount.replace('{count}', String(changeCount))}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-sm theme-text-muted text-pretty">{noActivityText}</div>
        ) : (
          <div className="space-y-4">
            {initialPrompt?.trim() ? (
              <div className="flex justify-end">
                <div
                  className="max-w-[80%] rounded-[1.15rem] rounded-tr-md px-4 py-3 text-base leading-8 theme-text text-pretty"
                  style={{
                    background: 'color-mix(in srgb, var(--color-surface-1) 92%, var(--color-surface-0) 8%)',
                    border: `1px solid ${BORDER_COLOR}`,
                  }}
                >
                  <div className="whitespace-pre-wrap">{initialPrompt}</div>
                </div>
              </div>
            ) : null}
            {filteredItems.map((item, index) => {
              const key = itemKey(item, index);

              if (item.kind === 'session') {
                return (
                  <div key={key} className="text-xs theme-text-tertiary">
                    {item.model || labels.session}
                    {item.cwd ? <span className="font-mono"> · {item.cwd}</span> : null}
                  </div>
                );
              }

              if (item.kind === 'assistant') {
                const open = isOpen(item, key);
                const secondary = item.display.importance !== 'primary';
                return (
                  <div key={key} className="space-y-2">
                    <div
                      className={
                        secondary
                          ? 'text-sm leading-7 theme-text-secondary text-pretty'
                          : 'text-base leading-8 theme-text font-medium text-pretty'
                      }
                    >
                      {secondary ? (
                        <div className="whitespace-pre-wrap">{open ? item.text : item.display.previewText ?? item.summary}</div>
                      ) : (
                        <AgentMarkdownBody text={item.text} />
                      )}
                    </div>
                    {secondary && item.display.expandable ? (
                      <div>
                        <ExpandInlineButton
                          expanded={open}
                          omittedCount={item.display.omittedCount}
                          labels={labels}
                          onClick={() => setOpenItems((state) => ({ ...state, [key]: !open }))}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              }

              if (item.kind === 'reasoning') {
                const open = isOpen(item, key);
                return (
                  <DisclosureRow
                    key={key}
                    summary={actionText(item, labels)}
                    expanded={open}
                    onToggle={() => setOpenItems((state) => ({ ...state, [key]: !open }))}
                    trailing={<RunningMarker status={item.status} labels={labels} />}
                  >
                    <DetailPanel>
                      <div className="text-sm leading-7 theme-text-secondary text-pretty">
                        <AgentMarkdownBody variant="dim" text={item.text} />
                      </div>
                    </DetailPanel>
                  </DisclosureRow>
                );
              }

              if (item.kind === 'command') {
                const open = isOpen(item, key);
                return (
                  <DisclosureRow
                    key={key}
                    summary={actionText(item, labels)}
                    expanded={open}
                    muted
                    onToggle={() => setOpenItems((state) => ({ ...state, [key]: !open }))}
                    trailing={<RunningMarker status={item.status} labels={labels} />}
                  >
                    <DetailPanel>
                      <div className="space-y-3">
                        <div className="font-mono text-sm leading-6 theme-text-secondary whitespace-pre-wrap">
                          {item.command}
                        </div>
                        {item.resultPreview ? (
                          <div className="font-mono text-xs leading-6 whitespace-pre-wrap theme-text-tertiary">
                            {item.resultPreview}
                          </div>
                        ) : null}
                        {(item.durationMs != null || item.exitCode != null) ? (
                          <div className="text-xs font-mono theme-text-tertiary tabular-nums">
                            {item.durationMs != null ? `${item.durationMs}ms` : ''}
                            {item.durationMs != null && item.exitCode != null ? ' · ' : ''}
                            {item.exitCode != null ? `exit ${item.exitCode}` : ''}
                          </div>
                        ) : null}
                      </div>
                    </DetailPanel>
                  </DisclosureRow>
                );
              }

              if (item.kind === 'tool_call') {
                const open = isOpen(item, key);
                return (
                  <DisclosureRow
                    key={key}
                    summary={actionText(item, labels)}
                    expanded={open}
                    muted={item.display.importance !== 'primary'}
                    onToggle={() => setOpenItems((state) => ({ ...state, [key]: !open }))}
                    trailing={<RunningMarker status={item.status} labels={labels} />}
                  >
                    <DetailPanel>
                      <div className="space-y-3">
                        {item.detail ? (
                          <div className="font-mono text-sm leading-6 theme-text-secondary whitespace-pre-wrap break-all">
                            {item.detail}
                          </div>
                        ) : null}
                        {item.resultPreview ? (
                          <div className="font-mono text-xs leading-6 whitespace-pre-wrap theme-text-tertiary">
                            {item.resultPreview}
                          </div>
                        ) : null}
                        {item.durationMs != null ? (
                          <div className="text-xs font-mono theme-text-tertiary tabular-nums">{item.durationMs}ms</div>
                        ) : null}
                      </div>
                    </DetailPanel>
                  </DisclosureRow>
                );
              }

              if (item.kind === 'file_change') {
                const open = isOpen(item, key);
                const stats = lineStatsFromFiles(item.diffFiles);
                const omittedRows = item.diffFiles.reduce(
                  (count, file) => count + Math.max(file.rows.length - DIFF_PREVIEW_ROWS, 0),
                  0
                );
                return (
                  <DisclosureRow
                    key={key}
                    summary={actionText(item, labels)}
                    expanded={open}
                    muted
                    onToggle={() => setOpenItems((state) => ({ ...state, [key]: !open }))}
                    trailing={
                      <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                        <span className="text-emerald-700">+{stats.added}</span>
                        <span className="text-red-700">-{stats.removed}</span>
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      <DiffRows files={item.diffFiles} expanded={open} />
                      {item.diffFiles.length > 0 && (omittedRows > 0 || item.display.expandable) ? (
                        <div className="ml-1">
                          <ExpandInlineButton
                            expanded={open}
                            omittedCount={open ? undefined : omittedRows}
                            labels={labels}
                            onClick={() => setOpenItems((state) => ({ ...state, [key]: !open }))}
                          />
                        </div>
                      ) : null}
                    </div>
                  </DisclosureRow>
                );
              }

              if (item.kind === 'activity_group') {
                const open = isOpen(item, key);
                return (
                  <DisclosureRow
                    key={key}
                    summary={item.summary}
                    expanded={open}
                    muted
                    onToggle={() => setOpenItems((state) => ({ ...state, [key]: !open }))}
                  >
                    <DetailPanel>
                      <ul className="space-y-1.5">
                        {item.entries.map((entry, entryIndex) => (
                          <li key={`${key}-${entryIndex}`} className="font-mono text-sm leading-6 theme-text-tertiary break-all">
                            {entry}
                          </li>
                        ))}
                      </ul>
                    </DetailPanel>
                  </DisclosureRow>
                );
              }

              if (item.kind === 'todo') {
                const open = isOpen(item, key);
                return (
                  <DisclosureRow
                    key={key}
                    summary={actionText(item, labels)}
                    expanded={open}
                    muted
                    onToggle={() => setOpenItems((state) => ({ ...state, [key]: !open }))}
                  >
                    <DetailPanel>
                      <ul className="space-y-2">
                        {item.items.map((todo) => (
                          <li key={todo.id} className="list-none flex items-start gap-2 text-sm">
                            {todo.status === 'completed' ? (
                              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                            ) : todo.status === 'in_progress' ? (
                              <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin text-accent-primary" />
                            ) : (
                              <Circle className="w-4 h-4 mt-0.5 shrink-0 theme-text-muted" />
                            )}
                            <span
                              className={`leading-snug ${todo.status === 'completed' ? 'line-through opacity-60' : 'theme-text-secondary'}`}
                            >
                              {todo.content}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </DetailPanel>
                  </DisclosureRow>
                );
              }

              if (item.kind === 'turn_result') {
                return (
                  <div
                    key={key}
                    className="text-sm leading-7"
                    style={{ color: item.ok ? '#15803d' : '#b91c1c' }}
                  >
                    {item.ok ? labels.completed : labels.failed}
                    {item.error ? ` · ${item.error}` : ''}
                    {item.durationMs != null ? (
                      <span className="ml-2 font-mono text-xs opacity-75 tabular-nums">{item.durationMs}ms</span>
                    ) : null}
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
        <div ref={bottomRef} className="h-1" aria-hidden />
      </div>
    </div>
  );
}
