import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  Pipeline,
  PipelineTemplate,
  CLIProfile,
  LLMConfig,
  ExecutionNotificationSettings,
  Schedule,
  ScheduleRun,
  Webhook,
  WebhookRun,
  PostAction,
  PostActionBinding,
  PostActionRun,
} from '../../shared/types.js';
import {
  DEFAULT_CLI_PROFILE,
  DEFAULT_LLM_CONFIG,
  DEFAULT_NOTIFICATION_SETTINGS,
} from '../../shared/types.js';

const DATA_DIR = path.join(os.homedir(), '.agentcadence');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(name: string): string {
  ensureDir();
  return path.join(DATA_DIR, name);
}

function readJSON<T>(name: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath(name), 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(name: string, data: unknown) {
  ensureDir();
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf-8');
}

export function loadPipelines(): Pipeline[] {
  return readJSON<Pipeline[]>('pipelines.json', []);
}

export function savePipelines(pipelines: Pipeline[]) {
  writeJSON('pipelines.json', pipelines);
}

export function loadProfile(): CLIProfile {
  const data = readJSON<CLIProfile>('cli-profile.json', DEFAULT_CLI_PROFILE);
  if (!data.cursor || !data.claude || !data.codex) {
    return DEFAULT_CLI_PROFILE;
  }
  if (data.id === 'internal') {
    saveProfile(DEFAULT_CLI_PROFILE);
    return DEFAULT_CLI_PROFILE;
  }
  const normalized = normalizeProfile(data);
  if (JSON.stringify(normalized) !== JSON.stringify(data)) {
    saveProfile(normalized);
  }
  return normalized;
}

export function saveProfile(profile: CLIProfile) {
  writeJSON('cli-profile.json', normalizeProfile(profile));
}

export function loadLLMConfig(): LLMConfig {
  return readJSON<LLMConfig>('llm-config.json', DEFAULT_LLM_CONFIG);
}

export function saveLLMConfig(config: LLMConfig) {
  writeJSON('llm-config.json', config);
}


export function loadNotificationSettings(): ExecutionNotificationSettings {
  return readJSON<ExecutionNotificationSettings>('notification-settings.json', DEFAULT_NOTIFICATION_SETTINGS);
}

export function saveNotificationSettings(settings: ExecutionNotificationSettings) {
  writeJSON('notification-settings.json', settings);
}

export function loadTemplates(): PipelineTemplate[] {
  return readJSON<PipelineTemplate[]>('templates.json', []);
}

export function saveTemplates(templates: PipelineTemplate[]) {
  writeJSON('templates.json', templates);
}

// MARK: - Schedule Store

export function loadSchedules(): Schedule[] {
  return readJSON<Schedule[]>('schedules.json', []);
}

export function saveSchedules(schedules: Schedule[]) {
  writeJSON('schedules.json', schedules);
}

export function loadScheduleRuns(): ScheduleRun[] {
  return readJSON<ScheduleRun[]>('schedule-runs.json', []);
}

export function saveScheduleRuns(runs: ScheduleRun[]) {
  // Keep last 200 runs
  writeJSON('schedule-runs.json', runs.slice(-200));
}

// MARK: - Webhook Store

export function loadWebhooks(): Webhook[] {
  return readJSON<Webhook[]>('webhooks.json', []);
}

export function saveWebhooks(webhooks: Webhook[]) {
  writeJSON('webhooks.json', webhooks);
}

export function loadWebhookRuns(): WebhookRun[] {
  return readJSON<WebhookRun[]>('webhook-runs.json', []);
}

export function saveWebhookRuns(runs: WebhookRun[]) {
  writeJSON('webhook-runs.json', runs.slice(-200));
}

// MARK: - Post-Action Store

export function loadPostActions(): PostAction[] {
  return readJSON<PostAction[]>('post-actions.json', []);
}

export function savePostActions(actions: PostAction[]) {
  writeJSON('post-actions.json', actions);
}

export function loadPostActionBindings(): PostActionBinding[] {
  return readJSON<PostActionBinding[]>('post-action-bindings.json', []);
}

export function savePostActionBindings(bindings: PostActionBinding[]) {
  writeJSON('post-action-bindings.json', bindings);
}

export function loadPostActionRuns(): PostActionRun[] {
  return readJSON<PostActionRun[]>('post-action-runs.json', []);
}

export function savePostActionRuns(runs: PostActionRun[]) {
  writeJSON('post-action-runs.json', runs.slice(-200));
}

function normalizeProfile(profile: CLIProfile): CLIProfile {
  const claudeArgs = normalizeClaudeArgs(profile.claude.baseArgs ?? []);
  if (claudeArgs === profile.claude.baseArgs) return profile;
  return {
    ...profile,
    claude: {
      ...profile.claude,
      baseArgs: claudeArgs,
    },
  };
}

function normalizeClaudeArgs(args: string[]): string[] {
  const next = [...args];
  const hasPrint = next.includes('--print') || next.includes('-p');
  const streamJsonIdx = next.findIndex((arg, index) => {
    if (arg === '--output-format' && next[index + 1] === 'stream-json') return true;
    return arg === '--output-format=stream-json';
  });
  const hasVerbose = next.includes('--verbose');

  if (hasPrint && streamJsonIdx !== -1 && !hasVerbose) {
    const printIdx = next.findIndex((arg) => arg === '--print' || arg === '-p');
    const insertAt = printIdx === -1 ? 0 : printIdx + 1;
    next.splice(insertAt, 0, '--verbose');
    return next;
  }

  return args;
}
