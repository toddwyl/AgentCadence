// ============================================================
// AgentFlow — Shared Type Definitions
// ============================================================

// MARK: - ToolType

export type ToolType = 'codex' | 'claude' | 'cursor';

export const TOOL_TYPES: ToolType[] = ['codex', 'claude', 'cursor'];

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
    tintColor: '#22c55e',
  },
  claude: {
    displayName: 'Claude',
    defaultModels: ['sonnet', 'opus', 'haiku'],
    iconName: 'brain',
    tintColor: '#f97316',
  },
  cursor: {
    displayName: 'Cursor',
    defaultModels: ['opus-4.6', 'gpt-5', 'sonnet-4'],
    iconName: 'mouse-pointer',
    tintColor: '#3b82f6',
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
  output?: string;
  retryRecords?: RetryRecord[];
  totalAttempts?: number;
  /** Planned max attempts when failureMode is retry (for live UI) */
  maxAttempts?: number;
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
}

export function profileConfigForTool(profile: CLIProfile, tool: ToolType): ToolCLIConfig {
  return profile[tool];
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
  cursor: {
    executable: 'cursor-agent',
    baseArgs: ['--trust'],
    promptFlag: '-p',
    modelFlag: '--model',
    promptMode: 'inline',
    defaultModel: 'opus-4.6',
  },
  codex: {
    executable: 'codex',
    baseArgs: ['exec', '--sandbox', 'workspace-write'],
    modelFlag: '--model',
    promptMode: 'argument',
  },
  claude: {
    executable: 'claude',
    baseArgs: ['--print', '--permission-mode', 'bypassPermissions', '--add-dir', '.'],
    promptFlag: '-p',
    modelFlag: '--model',
    promptMode: 'inline',
  },
  planner: {
    executable: 'cursor-agent',
    baseArgs: ['--trust'],
    promptFlag: '-p',
    modelFlag: '--model',
    promptMode: 'inline',
    defaultModel: 'opus-4.6',
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
  model: 'opus-4.6',
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

export type WSEventType =
  | 'step_status_changed'
  | 'step_output'
  | 'step_retry'
  | 'pipeline_run_started'
  | 'pipeline_run_finished'
  | 'planning_phase'
  | 'planning_log'
  | 'planning_complete'
  | 'planning_error'
  | 'execution_error';

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
