// ============================================================
// AgentCadence — Shared Type Definitions
// ============================================================

// MARK: - ToolType

export type ToolType = 'codex' | 'claude' | 'cursor';

export const TOOL_TYPES: ToolType[] = ['cursor', 'claude', 'codex'];

// MARK: - Prompt mentions (/, skills, slash commands, subagents)

export type PromptMentionKind = 'skill' | 'command' | 'subagent';

export interface PromptMentionItem {
  id: string;
  kind: PromptMentionKind;
  /** Token after / in the prompt */
  name: string;
  description: string;
  source: 'project' | 'user';
  tool: ToolType | 'all';
}

export interface PromptMentionsResponse {
  skills: PromptMentionItem[];
  commands: PromptMentionItem[];
  subagents: PromptMentionItem[];
}

export const TOOL_META: Record<ToolType, {
  displayName: string;
  defaultModels: string[];
  iconName: string;
  tintColor: string;
}> = {
  codex: {
    displayName: 'Codex',
    defaultModels: ['gpt-5-codex', 'o3', 'gpt-4.1'],
    iconName: 'terminal',
    tintColor: '#6366f1',
  },
  claude: {
    displayName: 'Claude',
    defaultModels: ['sonnet', 'opus', 'haiku'],
    iconName: 'brain',
    tintColor: '#f97316',
  },
  cursor: {
    displayName: 'Cursor',
    defaultModels: ['auto', 'gpt-5.2-codex', 'claude-4.6-sonnet-medium'],
    iconName: 'mouse-pointer',
    tintColor: '#374151',
  },
};

/** Safe lookup for UI when persisted data may have missing/invalid tool. */
export function safeToolMeta(tool: ToolType | string | undefined): (typeof TOOL_META)[ToolType] {
  if (tool && tool in TOOL_META) return TOOL_META[tool as ToolType];
  return TOOL_META.cursor;
}

export function toolFromKeyword(keyword: string): ToolType {
  const lower = keyword.toLowerCase();
  if (lower.includes('cursor') || lower.includes('agent')) return 'cursor';
  if (lower.includes('codex') || lower.includes('openai')) return 'codex';
  if (lower.includes('claude')) return 'claude';
  return 'codex';
}

export function detectToolFromCommandLine(commandLine: string): ToolType | null {
  const lower = commandLine.toLowerCase();
  if (
    lower.includes('cursor-agent') ||
    lower.startsWith('cursor ') ||
    lower.includes(' cursor ') ||
    lower.startsWith('agent ') ||
    lower.includes(' agent ')
  ) return 'cursor';
  if (lower.includes('codex')) return 'codex';
  if (lower.includes('claude')) return 'claude';
  return null;
}

// MARK: - Pipeline Models

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type ExecutionMode = 'parallel' | 'sequential';
export type PipelineRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface PipelineStep {
  id: string;
  name: string;
  command?: string;
  prompt: string;
  tool: ToolType;
  model?: string;
  dependsOnStepIDs: string[];
  failureMode: 'stop' | 'skip' | 'retry';
  retryCount: number;
  reviewMode: 'auto' | 'review';
  status: StepStatus;
  output?: string;
  error?: string;
}

export interface RetryRecord {
  attempt: number;
  error: string;
  timestamp: string;
}

export function stepHasCustomCommand(step: PipelineStep): boolean {
  return !!(step.command && step.command.trim().length > 0);
}

export function stepDisplayTool(step: PipelineStep): ToolType | null {
  if (stepHasCustomCommand(step) && step.command) {
    return detectToolFromCommandLine(step.command);
  }
  return step.tool;
}

export interface PipelineStage {
  id: string;
  name: string;
  steps: PipelineStep[];
  executionMode: ExecutionMode;
}

export interface StepRunRecord {
  id: string;
  stepID: string;
  stepName: string;
  status: StepStatus;
  startedAt?: string;
  endedAt?: string;
  /** Legacy summary output kept for backward compatibility. */
  output?: string;
  /** Full raw terminal/log text for new runs. */
  rawOutput?: string;
  /** Structured activity transcript for new runs. */
  agentFeed?: AgentFeedItem[];
  retryRecords?: RetryRecord[];
  totalAttempts?: number;
  /** Planned max attempts when failureMode is retry (for live UI) */
  maxAttempts?: number;
  reviewResult?: 'accepted' | 'rejected';
  changedFiles?: string[];
}

export interface StageRunRecord {
  id: string;
  stageID: string;
  stageName: string;
  stepRuns: StepRunRecord[];
  startedAt?: string;
  endedAt?: string;
}

export interface PipelineRunRecord {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: PipelineRunStatus;
  stageRuns: StageRunRecord[];
  errorMessage?: string;
  durationMs?: number;
}

export interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
  workingDirectory: string;
  isAIGenerated: boolean;
  createdAt: string;
  runHistory: PipelineRunRecord[];
  /** Key-value pairs; reference in prompts/commands as {{key}} (identifier: letter/underscore + alphanumeric) */
  globalVariables?: Record<string, string>;
}

/** Replace `{{varName}}` with values from `vars`. Unknown names stay unchanged. */
export function interpolatePromptVariables(text: string, vars: Record<string, string> | undefined): string {
  if (!text) return text;
  if (!vars || Object.keys(vars).length === 0) return text;
  return text.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (full, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : full
  );
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  stages: PipelineStage[];
  createdAt: string;
  updatedAt: string;
}

export function pipelineAllSteps(pipeline: Pipeline): PipelineStep[] {
  return pipeline.stages.flatMap((s) => s.steps);
}

export function pipelineProjectDisplayName(pipeline: Pipeline): string {
  const trimmed = pipeline.workingDirectory.trim();
  if (!trimmed) return 'No project selected';
  const parts = trimmed.split('/');
  return parts[parts.length - 1] || 'Unknown';
}

export interface ResolvedStep {
  step: PipelineStep;
  allDependencies: Set<string>;
  stageID: string;
}

export function resolveAllSteps(pipeline: Pipeline): ResolvedStep[] {
  const resolved: ResolvedStep[] = [];
  let prevStageStepIDs: string[] = [];

  for (const stage of pipeline.stages) {
    for (let i = 0; i < stage.steps.length; i++) {
      const step = stage.steps[i];
      const deps = new Set(step.dependsOnStepIDs);

      if (stage.executionMode === 'sequential' && i > 0) {
        deps.add(stage.steps[i - 1].id);
      }

      for (const prevID of prevStageStepIDs) {
        deps.add(prevID);
      }

      resolved.push({ step, allDependencies: deps, stageID: stage.id });
    }
    prevStageStepIDs = stage.steps.map((s) => s.id);
  }
  return resolved;
}

// MARK: - CLI Profile

export type PromptMode = 'inline' | 'stdin' | 'argument';

export interface ToolCLIConfig {
  executable: string;
  baseArgs: string[];
  promptFlag?: string;
  modelFlag: string;
  promptMode: PromptMode;
  defaultModel?: string;
}

export interface CLIProfile {
  id: string;
  name: string;
  cursor: ToolCLIConfig;
  codex: ToolCLIConfig;
  claude: ToolCLIConfig;
  planner: ToolCLIConfig;
  /** Per-step execution timeout in seconds (default 1800 = 30 min) */
  stepTimeout: number;
}

export function profileConfigForTool(profile: CLIProfile, tool: ToolType): ToolCLIConfig {
  return profile[tool];
}

/**
 * Older AgentCadence builds defaulted Cursor steps to `opus-4.6`, which current cursor-agent builds may reject.
 * Treat as unset so `config.defaultModel` (e.g. `auto`) applies.
 */
export function normalizeCursorModelForCLI(model: string | undefined, tool: ToolType): string | undefined {
  if (tool === 'cursor' && model === 'opus-4.6') return undefined;
  return model;
}

export function buildToolArguments(
  config: ToolCLIConfig,
  prompt: string,
  model?: string,
  workingDirectory?: string
): string[] {
  const args = config.baseArgs.map((a) =>
    a === '.' && workingDirectory ? workingDirectory : a
  );
  const resolvedModel = model || config.defaultModel;
  if (resolvedModel) {
    args.push(config.modelFlag, resolvedModel);
  }
  switch (config.promptMode) {
    case 'inline':
      if (config.promptFlag) {
        args.push(config.promptFlag, prompt);
      } else {
        args.push(prompt);
      }
      break;
    case 'argument':
      if (prompt) args.push(prompt);
      break;
    case 'stdin':
      break;
  }
  return args;
}

export function buildCommandTemplate(config: ToolCLIConfig, model?: string): string {
  const parts = [config.executable, ...config.baseArgs];
  const resolvedModel = model || config.defaultModel;
  if (resolvedModel) {
    parts.push(config.modelFlag, resolvedModel);
  }
  switch (config.promptMode) {
    case 'inline':
      if (config.promptFlag) {
        parts.push(config.promptFlag, '{{prompt}}');
      } else {
        parts.push('{{prompt}}');
      }
      break;
    case 'argument':
      parts.push('{{prompt}}');
      break;
    case 'stdin':
      break;
  }
  return parts.join(' ');
}

export const DEFAULT_CLI_PROFILE: CLIProfile = {
  id: 'default',
  name: 'Default',
  stepTimeout: 1800,
  cursor: {
    executable: 'cursor-agent',
    // Headless: --force applies file edits without interactive confirm (otherwise agent may block in PTY).
    // stream-json: NDJSON events; server prettifies for the web terminal (omit --stream-partial-output to avoid duplicate fragments).
    baseArgs: ['--trust', '--force', '--output-format', 'stream-json'],
    promptFlag: '-p',
    modelFlag: '--model',
    promptMode: 'inline',
    defaultModel: 'auto',
  },
  codex: {
    executable: 'codex',
    // --json: JSONL on stdout for services/cli-output prettifier (omit if using an older codex CLI).
    baseArgs: ['exec', '--json', '--sandbox', 'workspace-write'],
    modelFlag: '--model',
    promptMode: 'argument',
  },
  claude: {
    executable: 'claude',
    baseArgs: [
      '--print',
      '--verbose',
      '--output-format',
      'stream-json',
      '--permission-mode',
      'bypassPermissions',
      '--add-dir',
      '.',
    ],
    promptFlag: '-p',
    modelFlag: '--model',
    promptMode: 'inline',
  },
  planner: {
    executable: 'cursor-agent',
    baseArgs: ['--trust', '--force', '--output-format', 'stream-json'],
    promptFlag: '-p',
    modelFlag: '--model',
    promptMode: 'inline',
    defaultModel: 'auto',
  },
};

// MARK: - Auto Planner Models

export type PlanningPhase =
  | 'preparingContext'
  | 'invokingAgentCLI'
  | 'generatingStructure'
  | 'parsingResult'
  | 'creatingPipeline';

export const PLANNING_PHASE_TITLES: Record<PlanningPhase, string> = {
  preparingContext: 'Prepare task context',
  invokingAgentCLI: 'Invoke Agent CLI',
  generatingStructure: 'Generate pipeline structure',
  parsingResult: 'Parse structured Markdown',
  creatingPipeline: 'Create pipeline in app',
};

export interface PlanRequest {
  userPrompt: string;
  workingDirectory: string;
  availableTools: ToolType[];
}

export interface PlanResponse {
  pipelineName: string;
  stages: PlannedStage[];
}

export interface PlannedStage {
  name: string;
  executionMode: string;
  steps: PlannedStep[];
}

export interface PlannedStep {
  name: string;
  prompt: string;
  recommendedTool: string;
  model?: string;
  command?: string;
  dependsOn?: string[];
  failureMode?: 'stop' | 'skip' | 'retry';
}

export interface LLMConfig {
  model: string;
  customPolicy: string;
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  model: 'auto',
  customPolicy: '',
};

// MARK: - Notification Models

export interface ExecutionNotificationSettings {
  isEnabled: boolean;
  notifyOnCompleted: boolean;
  notifyOnFailed: boolean;
  notifyOnCancelled: boolean;
  playSound: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: ExecutionNotificationSettings = {
  isEnabled: false,
  notifyOnCompleted: true,
  notifyOnFailed: true,
  notifyOnCancelled: true,
  playSound: true,
};

// MARK: - WebSocket Event Types

/** Snapshot of one in-flight pipeline run (server buffer + reconnect hydrate). */

/** Row in a todo list snapshot from the agent stream or merged feed block. */
export type AgentTodoSnapshotItem = {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
};

export type AgentTranscriptStatus = 'running' | 'completed' | 'failed';
export type AgentTranscriptImportance = 'primary' | 'secondary' | 'collapsed_group' | 'preview_only';
export type AgentActivityGroupType = 'tool_activity' | 'assistant_progress';
export type AgentDiffRowKind = 'file' | 'meta' | 'hunk' | 'context' | 'added' | 'removed';
export type AgentCommandActionType = 'read' | 'list_files' | 'search' | 'unknown';

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

function stripShellWrapper(command: string): string {
  const trimmed = command.trim();
  const shellMatch = trimmed.match(/^(?:\/bin\/)?(?:ba|z|fi)?sh\s+-lc\s+(['"])([\s\S]*)\1$/i);
  if (shellMatch?.[2]) return shellMatch[2].trim();
  return trimmed;
}

function truncateActionValue(value: string, max = 120): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function splitCommandClauses(command: string): string[] {
  return command
    .split(/\s*(?:&&|\|\||;)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanToken(token: string): string {
  return token.replace(/^['"]|['"]$/g, '').trim();
}

function parseSearchQuery(command: string): string | undefined {
  const quoted = command.match(/['"]([^'"]{2,})['"]/);
  if (quoted?.[1]) return truncateActionValue(quoted[1]);
  const token = command
    .split(/\s+/)
    .map(cleanToken)
    .find((part) => part && !part.startsWith('-') && !part.includes('/') && !part.includes('*'));
  return token ? truncateActionValue(token) : undefined;
}

function parsePathishToken(command: string): string | undefined {
  const tokens = command.split(/\s+/).map(cleanToken).filter(Boolean);
  for (let i = tokens.length - 1; i >= 1; i--) {
    const token = tokens[i];
    if (!token || token.startsWith('-')) continue;
    if (token === '.' || token === '..' || token.includes('/') || token.includes('.')) {
      return truncateActionValue(token);
    }
  }
  const fallback = tokens.at(-1);
  return fallback && !fallback.startsWith('-') ? truncateActionValue(fallback) : undefined;
}

function parseReadClause(clause: string): AgentCommandAction | null {
  const readMatch = clause.match(/^(cat|bat|less|more|head|tail)\b/i);
  if (readMatch) {
    const path = parsePathishToken(clause);
    return {
      type: 'read',
      command: truncateActionValue(clause),
      path,
      name: path ? path.split('/').at(-1) : undefined,
    };
  }

  const sedMatch = clause.match(/^sed\b/i);
  if (sedMatch) {
    const path = parsePathishToken(clause);
    if (path) {
      return {
        type: 'read',
        command: truncateActionValue(clause),
        path,
        name: path.split('/').at(-1),
      };
    }
  }

  return null;
}

function parseListClause(clause: string): AgentCommandAction | null {
  if (/^(ls|tree)\b/i.test(clause)) {
    return {
      type: 'list_files',
      command: truncateActionValue(clause),
      path: parsePathishToken(clause),
    };
  }

  if (/^(fd|find)\b/i.test(clause) && !/\b(name|iname|grep|exec)\b/i.test(clause)) {
    return {
      type: 'list_files',
      command: truncateActionValue(clause),
      path: parsePathishToken(clause),
    };
  }

  if (/^rg\b/i.test(clause) && /\s--files(?:\s|$)/.test(clause)) {
    return {
      type: 'list_files',
      command: truncateActionValue(clause),
      path: parsePathishToken(clause),
    };
  }

  return null;
}

function parseSearchClause(clause: string): AgentCommandAction | null {
  if (/^(rg|grep)\b/i.test(clause) || (/^find\b/i.test(clause) && /\b(name|iname)\b/i.test(clause))) {
    return {
      type: 'search',
      command: truncateActionValue(clause),
      query: parseSearchQuery(clause),
      path: parsePathishToken(clause),
    };
  }

  return null;
}

export function parseCommandActions(command: string): AgentCommandAction[] {
  const normalized = stripShellWrapper(command);
  const clauses = splitCommandClauses(normalized);
  if (clauses.length === 0) {
    return [{ type: 'unknown', command: truncateActionValue(normalized || command) }];
  }

  const parsed = clauses.map((clause) => {
    return (
      parseReadClause(clause) ??
      parseListClause(clause) ??
      parseSearchClause(clause) ?? {
        type: 'unknown' as const,
        command: truncateActionValue(clause),
      }
    );
  });

  const deduped: AgentCommandAction[] = [];
  for (const action of parsed) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.type === action.type &&
      prev.command === action.command &&
      prev.path === action.path &&
      prev.query === action.query &&
      prev.name === action.name
    ) {
      continue;
    }
    deduped.push(action);
  }
  return deduped;
}

export function summarizeCommandAction(action: AgentCommandAction): string {
  switch (action.type) {
    case 'read':
      return `Read ${action.name ?? action.path ?? action.command}`;
    case 'list_files':
      return `List ${action.path ?? action.command}`;
    case 'search':
      if (action.query && action.path) return `Search ${action.query} in ${action.path}`;
      return `Search ${action.query ?? action.command}`;
    default:
      return `Run ${action.command}`;
  }
}

/** Structured agent JSONL → transcript-style timeline for the runtime monitor. */
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

export interface ActiveExecutionRunPayload {
  pipelineID: string;
  runID: string;
  stepStatuses: Record<string, StepStatus>;
  stepOutputs: Record<string, string>;
  /** Merged agent/tool/thinking blocks for the live “conversation” pane */
  stepAgentFeeds?: Record<string, AgentFeedItem[]>;
  stepRetryRecords: Record<string, RetryRecord[]>;
  stepRetryMaxAttempts: Record<string, number>;
}

export type WSEventType =
  | 'step_status_changed'
  | 'step_output'
  | 'step_retry'
  | 'step_review_requested'
  | 'step_review_response'
  | 'pipeline_run_started'
  | 'pipeline_run_finished'
  | 'planning_phase'
  | 'planning_log'
  | 'planning_complete'
  | 'planning_error'
  | 'execution_error'
  | 'execution_state_snapshot'
  | 'agent_stream_event'
  | 'schedule_status_changed'
  | 'schedule_run_started'
  | 'schedule_run_finished'
  | 'webhook_triggered'
  | 'webhook_run_finished'
  | 'post_action_triggered'
  | 'post_action_finished';

export interface WSMessage {
  type: WSEventType;
  payload: Record<string, unknown>;
}

// MARK: - API Request/Response types

export interface CreatePipelineRequest {
  name: string;
  workingDirectory: string;
}

export interface AddStageRequest {
  name: string;
  executionMode: ExecutionMode;
}

export interface AddStepRequest {
  name: string;
  prompt: string;
  tool: ToolType;
  command?: string;
  model?: string;
  dependsOnStepIDs?: string[];
  failureMode?: 'stop' | 'skip' | 'retry';
  retryCount?: number;
  reviewMode?: 'auto' | 'review';
}

export interface GeneratePipelineRequest {
  userPrompt: string;
  workingDirectory: string;
  llmConfig: LLMConfig;
}

export interface DetectionResult {
  executable: string;
  found: boolean;
  path?: string;
}

export interface AppState {
  pipelines: Pipeline[];
  activeProfile: CLIProfile;
  llmConfig: LLMConfig;
  notificationSettings: ExecutionNotificationSettings;
}

// MARK: - Schedule Models

export type ScheduleStatus = 'idle' | 'running' | 'error';
export type ScheduleRunStatus = 'running' | 'success' | 'failed' | 'timeout';

export interface Schedule {
  id: string;
  name: string;
  pipeline_id: string;
  prompt_override?: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  status: ScheduleStatus;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRun {
  id: string;
  schedule_id: string;
  pipeline_run_id: string;
  started_at: string;
  finished_at: string | null;
  status: ScheduleRunStatus;
  error: string;
}

export interface CreateScheduleRequest {
  name: string;
  pipeline_id: string;
  prompt_override?: string;
  cron_expression: string;
  timezone: string;
  enabled?: boolean;
}

export interface UpdateScheduleRequest {
  name?: string;
  pipeline_id?: string;
  prompt_override?: string;
  cron_expression?: string;
  timezone?: string;
  enabled?: boolean;
}

// MARK: - Webhook Models

export type WebhookStatus = 'idle' | 'running';
export type WebhookRunStatus = 'running' | 'success' | 'failed' | 'timeout';

export interface Webhook {
  id: string;
  name: string;
  pipeline_id: string;
  prompt_template: string;
  token: string;
  enabled: boolean;
  timeout_seconds: number;
  max_concurrent: number;
  last_triggered_at: string | null;
  status: WebhookStatus;
  created_at: string;
  updated_at: string;
}

export interface WebhookRun {
  id: string;
  webhook_id: string;
  pipeline_run_id: string;
  started_at: string;
  finished_at: string | null;
  status: WebhookRunStatus;
  error: string;
  request_payload?: string;
  caller_ip?: string;
}

export interface CreateWebhookRequest {
  name: string;
  pipeline_id: string;
  prompt_template: string;
  timeout_seconds?: number;
  max_concurrent?: number;
  enabled?: boolean;
}

export interface UpdateWebhookRequest {
  name?: string;
  pipeline_id?: string;
  prompt_template?: string;
  timeout_seconds?: number;
  max_concurrent?: number;
  enabled?: boolean;
}

// MARK: - Post-Action Models

export type PostActionAuthType = 'none' | 'bearer' | 'basic' | 'header';
export type PostActionRunStatus = 'success' | 'failed' | 'retrying';
export type TriggerType = 'webhook' | 'schedule' | 'manual';
export type TriggerOn = 'success' | 'failure' | 'any';

export interface PostAction {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body_template: string;
  auth_type: PostActionAuthType;
  auth_config: Record<string, string>;
  timeout_seconds: number;
  retry_count: number;
  enabled: boolean;
  created_at: string;
}

export interface PostActionBinding {
  id: string;
  post_action_id: string;
  trigger_type: TriggerType;
  trigger_id: string;
  trigger_on: TriggerOn;
  body_override: string;
  enabled: boolean;
  created_at: string;
}

export interface PostActionRun {
  id: string;
  post_action_id: string;
  binding_id: string;
  triggered_at: string;
  completed_at: string | null;
  status: PostActionRunStatus;
  status_code: number;
  response_body: string;
  error: string;
}

export interface CreatePostActionRequest {
  name: string;
  description?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body_template?: string;
  auth_type?: PostActionAuthType;
  auth_config?: Record<string, string>;
  timeout_seconds?: number;
  retry_count?: number;
  enabled?: boolean;
}

export interface CreateBindingRequest {
  trigger_type: TriggerType;
  trigger_id: string;
  trigger_on?: TriggerOn;
  body_override?: string;
  enabled?: boolean;
}
