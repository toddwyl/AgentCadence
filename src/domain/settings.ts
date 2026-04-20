import type { ToolType } from './pipeline.js';

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
  stepTimeout: number;
}

export function profileConfigForTool(profile: CLIProfile, tool: ToolType): ToolCLIConfig {
  return profile[tool];
}

export interface DetectionResult {
  executable: string;
  found: boolean;
  path?: string;
}

export interface LLMConfig {
  model: string;
  customPolicy: string;
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  model: 'auto',
  customPolicy: '',
};

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

export const DEFAULT_CLI_PROFILE: CLIProfile = {
  id: 'default',
  name: 'Default',
  stepTimeout: 1800,
  cursor: {
    executable: 'cursor-agent',
    baseArgs: ['--trust', '--force', '--output-format', 'stream-json'],
    promptFlag: '-p',
    modelFlag: '--model',
    promptMode: 'inline',
    defaultModel: 'auto',
  },
  codex: {
    executable: 'codex',
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
