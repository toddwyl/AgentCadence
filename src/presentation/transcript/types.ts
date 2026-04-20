export type AgentTranscriptStatus = 'running' | 'completed' | 'failed';
export type AgentTranscriptImportance = 'primary' | 'secondary' | 'collapsed_group' | 'preview_only';
export type AgentActivityGroupType = 'tool_activity' | 'assistant_progress';
export type AgentDiffRowKind = 'file' | 'meta' | 'hunk' | 'context' | 'added' | 'removed';
export type AgentCommandActionType = 'read' | 'list_files' | 'search' | 'unknown';

export type AgentTodoSnapshotItem = {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
};

export interface AgentTranscriptDisplayMeta {
  importance: AgentTranscriptImportance;
  collapsed?: boolean;
  expandable?: boolean;
  previewText?: string;
  omittedCount?: number;
  groupLabel?: string;
}

export interface AgentDiffRow {
  kind: AgentDiffRowKind;
  text: string;
  sign?: '+' | '-' | ' ';
  oldLineNumber?: number | null;
  newLineNumber?: number | null;
}

export interface AgentParsedDiffFile {
  path: string;
  oldPath?: string;
  newPath?: string;
  added: number;
  removed: number;
  rows: AgentDiffRow[];
}

export interface AgentCommandAction {
  type: AgentCommandActionType;
  command: string;
  path?: string;
  query?: string;
  name?: string;
}

export type AgentFeedItem =
  | { kind: 'session'; model?: string; cwd?: string }
  /** Legacy persisted snapshot item kept for backward compatibility. */
  | { kind: 'init'; model?: string; cwd?: string }
  | { kind: 'user_turn' }
  | { kind: 'reasoning'; text: string; summary: string; status: AgentTranscriptStatus }
  /** Legacy persisted snapshot item kept for backward compatibility. */
  | { kind: 'thinking'; text: string }
  | { kind: 'assistant'; text: string }
  | {
      kind: 'command';
      status: AgentTranscriptStatus;
      summary: string;
      command: string;
      callId?: string;
      commandActions?: AgentCommandAction[];
      resultPreview?: string;
      durationMs?: number | null;
      exitCode?: number | null;
      ok?: boolean;
    }
  | {
      kind: 'tool_call';
      status: AgentTranscriptStatus;
      /** One-line description; also used as merge key when callId is absent */
      summary: string;
      /** Canonical tool id from the CLI, e.g. read_file, write */
      toolName: string;
      /** Path, command preview, or other primary argument */
      detail?: string;
      /** Stable id from the agent stream when present (preferred merge key) */
      callId?: string;
      resultPreview?: string;
      durationMs?: number | null;
      /** Unified diff from `git diff` after edit-like tools (runtime transcript). */
      gitDiffUnified?: string;
      ok?: boolean;
    }
  | {
      kind: 'file_change';
      path: string;
      summary: string;
      parentCallId?: string;
      gitDiffUnified?: string;
    }
  /** Legacy persisted snapshot item kept for backward compatibility. */
  | {
      kind: 'tool';
      phase: 'started' | 'completed' | 'update';
      summary: string;
      toolName?: string;
      detail?: string;
      callId?: string;
      resultPreview?: string;
      gitDiffUnified?: string;
      ok?: boolean;
    }
  | { kind: 'turn_result'; ok: boolean; durationMs?: number | null; error?: string }
  /** Legacy persisted snapshot item kept for backward compatibility. */
  | { kind: 'result'; ok: boolean; durationMs?: number | null }
  | { kind: 'todo'; items: AgentTodoSnapshotItem[] };

export type AgentTranscriptDisplayItem =
  | { kind: 'session'; model?: string; cwd?: string; display: AgentTranscriptDisplayMeta }
  | { kind: 'assistant'; text: string; summary: string; display: AgentTranscriptDisplayMeta }
  | {
      kind: 'reasoning';
      text: string;
      summary: string;
      status: AgentTranscriptStatus;
      display: AgentTranscriptDisplayMeta;
    }
  | {
      kind: 'command';
      status: AgentTranscriptStatus;
      summary: string;
      command: string;
      callId?: string;
      commandActions?: AgentCommandAction[];
      resultPreview?: string;
      durationMs?: number | null;
      exitCode?: number | null;
      ok?: boolean;
      display: AgentTranscriptDisplayMeta;
    }
  | {
      kind: 'tool_call';
      status: AgentTranscriptStatus;
      summary: string;
      toolName: string;
      detail?: string;
      callId?: string;
      resultPreview?: string;
      durationMs?: number | null;
      gitDiffUnified?: string;
      ok?: boolean;
      display: AgentTranscriptDisplayMeta;
    }
  | {
      kind: 'file_change';
      path: string;
      summary: string;
      parentCallId?: string;
      gitDiffUnified?: string;
      diffFiles: AgentParsedDiffFile[];
      display: AgentTranscriptDisplayMeta;
    }
  | {
      kind: 'activity_group';
      summary: string;
      groupType: AgentActivityGroupType;
      entries: string[];
      display: AgentTranscriptDisplayMeta;
    }
  | { kind: 'todo'; items: AgentTodoSnapshotItem[]; display: AgentTranscriptDisplayMeta }
  | {
      kind: 'turn_result';
      ok: boolean;
      durationMs?: number | null;
      error?: string;
      display: AgentTranscriptDisplayMeta;
    };

/** Single parsed JSONL-derived event before merging into {@link AgentFeedItem} blocks. */
export type AgentStreamUiEvent =
  | { kind: 'session_init'; model?: string; cwd?: string }
  | { kind: 'assistant_delta'; text: string }
  | { kind: 'reasoning_delta'; text: string }
  | {
      kind: 'command';
      phase: 'started' | 'completed' | 'update';
      summary: string;
      command: string;
      callId?: string;
      commandActions?: AgentCommandAction[];
      resultPreview?: string;
      durationMs?: number | null;
      exitCode?: number | null;
      ok?: boolean;
    }
  | {
      kind: 'tool_call';
      phase: 'started' | 'completed' | 'update';
      summary: string;
      toolName: string;
      detail?: string;
      callId?: string;
      durationMs?: number | null;
      ok?: boolean;
    }
  | {
      kind: 'tool_result';
      summary: string;
      toolName: string;
      detail?: string;
      callId?: string;
      resultPreview?: string;
      durationMs?: number | null;
      gitDiffUnified?: string;
      ok?: boolean;
    }
  | {
      kind: 'file_change';
      path: string;
      summary?: string;
      parentCallId?: string;
      gitDiffUnified?: string;
    }
  /** Legacy event shape emitted by older presenters; merged as tool_call/tool_result. */
  | { kind: 'thinking_delta'; text: string }
  | {
      kind: 'tool';
      phase: 'started' | 'completed' | 'update';
      summary: string;
      subtype?: string;
      toolName?: string;
      detail?: string;
      callId?: string;
      resultPreview?: string;
      gitDiffUnified?: string;
      ok?: boolean;
    }
  | { kind: 'turn_result'; ok: boolean; durationMs?: number | null; error?: string }
  | { kind: 'user_turn' }
  | { kind: 'todo_snapshot'; items: AgentTodoSnapshotItem[] };

/** @deprecated Use {@link AgentStreamUiEvent} */
export type CursorStreamUiEvent = AgentStreamUiEvent;
