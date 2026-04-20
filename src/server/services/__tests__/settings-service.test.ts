import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CLIProfile, ExecutionNotificationSettings, LLMConfig } from '../../../domain/settings.js';

const loadProfile = vi.fn<() => CLIProfile>();
const loadLLMConfig = vi.fn<() => LLMConfig>();
const loadNotificationSettings = vi.fn<() => ExecutionNotificationSettings>();
const saveProfile = vi.fn<(profile: CLIProfile) => void>();
const saveLLMConfig = vi.fn<(config: LLMConfig) => void>();
const saveNotificationSettings = vi.fn<(settings: ExecutionNotificationSettings) => void>();

vi.mock('../store.js', () => ({
  loadProfile,
  loadLLMConfig,
  loadNotificationSettings,
  saveProfile,
  saveLLMConfig,
  saveNotificationSettings,
}));

describe('settings-service', () => {
  const profile = {
    id: 'default',
    name: 'Default',
    cursor: {
      executable: 'cursor-agent',
      baseArgs: ['--trust'],
      modelFlag: '--model',
      promptMode: 'inline' as const,
      promptFlag: '-p',
      defaultModel: 'auto',
    },
    codex: {
      executable: 'codex',
      baseArgs: ['exec'],
      modelFlag: '--model',
      promptMode: 'argument' as const,
    },
    claude: {
      executable: 'claude',
      baseArgs: ['--print'],
      modelFlag: '--model',
      promptMode: 'stdin' as const,
    },
    planner: {
      executable: 'planner',
      baseArgs: [],
      modelFlag: '--model',
      promptMode: 'stdin' as const,
    },
    stepTimeout: 1800,
  } satisfies CLIProfile;

  const llmConfig = {
    model: 'gpt-5',
    customPolicy: '',
  } satisfies LLMConfig;

  const notificationSettings = {
    isEnabled: true,
    notifyOnCompleted: true,
    notifyOnFailed: true,
    notifyOnCancelled: true,
    playSound: true,
  } satisfies ExecutionNotificationSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    loadProfile.mockReturnValue(structuredClone(profile));
    loadLLMConfig.mockReturnValue(structuredClone(llmConfig));
    loadNotificationSettings.mockReturnValue(structuredClone(notificationSettings));
  });

  it('reads the stepTimeout alias through the profile path', async () => {
    const { getSettingByPath } = await import('../app/settings-service.js');

    expect(getSettingByPath('stepTimeout')).toBe(1800);
    expect(getSettingByPath('profile.stepTimeout')).toBe(1800);
  });

  it('writes the stepTimeout alias back to profile.stepTimeout with numeric coercion', async () => {
    const { setSettingByPath } = await import('../app/settings-service.js');

    const next = setSettingByPath('stepTimeout', '2400');

    expect(next.profile.stepTimeout).toBe(2400);
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ stepTimeout: 2400 }));
    expect(saveLLMConfig).toHaveBeenCalledTimes(1);
    expect(saveNotificationSettings).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown settings paths', async () => {
    const { getSettingByPath, setSettingByPath } = await import('../app/settings-service.js');

    expect(() => getSettingByPath('profile.doesNotExist')).toThrow(
      'Unknown settings path "profile.doesNotExist".'
    );
    expect(() => setSettingByPath('profile.doesNotExist', 'value')).toThrow(
      'Unknown settings path "profile.doesNotExist".'
    );
  });
});
