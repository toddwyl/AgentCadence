import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  Pipeline,
  PipelineTemplate,
  CLIProfile,
  LLMConfig,
  ExecutionNotificationSettings,
} from '../../shared/types.js';
import {
  DEFAULT_CLI_PROFILE,
  DEFAULT_LLM_CONFIG,
  DEFAULT_NOTIFICATION_SETTINGS,
} from '../../shared/types.js';

const LEGACY_AGENTFLOW = path.join(os.homedir(), '.agentflow');
const LEGACY_AGENTLINE = path.join(os.homedir(), '.agentline');
const DATA_DIR = path.join(os.homedir(), '.agentcadence');

/** One-time rename: prefer newest dir; migrate from AgentLine / AgentFlow if needed. */
function migrateDataDirFromLegacy() {
  try {
    if (fs.existsSync(DATA_DIR)) return;
    if (fs.existsSync(LEGACY_AGENTLINE)) {
      fs.renameSync(LEGACY_AGENTLINE, DATA_DIR);
      return;
    }
    if (fs.existsSync(LEGACY_AGENTFLOW)) {
      fs.renameSync(LEGACY_AGENTFLOW, DATA_DIR);
    }
  } catch {
    /* ignore e.g. cross-device rename */
  }
}
migrateDataDirFromLegacy();

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
  return data;
}

export function saveProfile(profile: CLIProfile) {
  writeJSON('cli-profile.json', profile);
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
