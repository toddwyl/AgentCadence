import type { CLIProfile, ToolCLIConfig } from './settings.js';
import type { PipelineRunRecord, StepStatus } from './run.js';

export type ToolType = 'codex' | 'claude' | 'cursor';

export const TOOL_TYPES: ToolType[] = ['cursor', 'claude', 'codex'];

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

export type ExecutionMode = 'parallel' | 'sequential';

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

export interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
  workingDirectory: string;
  isAIGenerated: boolean;
  createdAt: string;
  runHistory: PipelineRunRecord[];
  globalVariables?: Record<string, string>;
}

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

export function normalizeCursorModelForCLI(model: string | undefined, tool: ToolType): string | undefined {
  if (tool === 'cursor' && model === 'opus-4.6') return undefined;
  return model;
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
