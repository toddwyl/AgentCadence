import type {
  CLIProfile,
  ExecutionNotificationSettings,
  LLMConfig,
} from '../../../domain/settings.js';
import {
  loadLLMConfig,
  loadNotificationSettings,
  loadProfile,
  saveLLMConfig,
  saveNotificationSettings,
  saveProfile,
} from '../store.js';

export interface SettingsSnapshot {
  profile: CLIProfile;
  llmConfig: LLMConfig;
  notificationSettings: ExecutionNotificationSettings;
}

export function getSettingsSnapshot(): SettingsSnapshot {
  return {
    profile: loadProfile(),
    llmConfig: loadLLMConfig(),
    notificationSettings: loadNotificationSettings(),
  };
}

export function getSettingByPath(path: string): unknown {
  const snapshot = getSettingsSnapshot() as unknown as Record<string, unknown>;
  return readPath(snapshot, normalizeSettingsPath(path));
}

export function setSettingByPath(path: string, value: unknown): SettingsSnapshot {
  const snapshot = getSettingsSnapshot();
  const next = structuredClone(snapshot) as unknown as Record<string, unknown>;
  writePath(next, normalizeSettingsPath(path), value);

  saveProfile(next.profile as CLIProfile);
  saveLLMConfig(next.llmConfig as LLMConfig);
  saveNotificationSettings(next.notificationSettings as ExecutionNotificationSettings);

  return next as unknown as SettingsSnapshot;
}

function readPath(input: Record<string, unknown>, path: string): unknown {
  const parts = normalizePath(path);
  let current: unknown = input;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in (current as Record<string, unknown>))) {
      throw new Error(`Unknown settings path "${path}".`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function writePath(input: Record<string, unknown>, path: string, value: unknown): void {
  const parts = normalizePath(path);
  let current: Record<string, unknown> = input;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = current[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      throw new Error(`Unknown settings path "${path}".`);
    }
    current = next as Record<string, unknown>;
  }

  const last = parts[parts.length - 1];
  if (!(last in current)) {
    throw new Error(`Unknown settings path "${path}".`);
  }
  current[last] = coerceToExistingType(current[last], value);
}

function normalizePath(path: string): string[] {
  return path.split('.').map((part) => part.trim()).filter(Boolean);
}

function normalizeSettingsPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (trimmed === 'stepTimeout') return 'profile.stepTimeout';
  return trimmed;
}

function coerceToExistingType(existing: unknown, value: unknown): unknown {
  if (typeof existing === 'number') {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Expected numeric value, received "${String(value)}".`);
    }
    return parsed;
  }
  if (typeof existing === 'boolean') {
    if (typeof value === 'boolean') return value;
    const raw = String(value).trim().toLowerCase();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    throw new Error(`Expected boolean value, received "${String(value)}".`);
  }
  if (Array.isArray(existing)) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    }
    throw new Error(`Expected array value, received "${String(value)}".`);
  }
  return value;
}
