import { useState, useEffect } from 'react';
import { mergeDetectedPathsIntoProfile } from '../../../contracts/settings/cli-detect-merge.js';
import type { DetectionResult } from '../../../domain/tooling.js';
import type { ToolType } from '../../../domain/tooling.js';
import type { CLIProfile, LLMConfig } from '../../../domain/tooling.js';
import { TOOL_TYPES, TOOL_META } from '../../../domain/tooling.js';
import { useAppStore } from '../../store/app-store';
import { api } from '../../lib/api';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { ModalCloseButton } from '../ui/ModalCloseButton';

export function CLIProfileSetup({
  embedded = false,
  section = 'all',
  onClose,
}: {
  embedded?: boolean;
  section?: 'all' | 'general' | 'agents' | 'planner';
  onClose?: () => void;
} = {}) {
  const { setShowSettings, llmConfig, profile, t, theme, setTheme, locale, setLocale } = useAppStore();
  const close = onClose ?? (() => setShowSettings(false));
  useEscapeToClose(close, !embedded);
  const [detecting, setDetecting] = useState(false);
  const [detectRows, setDetectRows] = useState<DetectionResult[] | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [llm, setLlm] = useState<LLMConfig>(llmConfig);
  const [plannerTool, setPlannerTool] = useState<ToolType>(() => {
    if (!profile?.planner) return 'cursor';
    const exe = profile.planner.executable;
    if (exe.includes('claude')) return 'claude';
    if (exe.includes('codex')) return 'codex';
    return 'cursor';
  });
  const [plannerModel, setPlannerModel] = useState(profile?.planner?.defaultModel || '');
  const [toolModels, setToolModels] = useState<Record<ToolType, string>>({
    cursor: profile?.cursor?.defaultModel || '',
    claude: profile?.claude?.defaultModel || '',
    codex: profile?.codex?.defaultModel || '',
  });
  const [toolBaseArgs, setToolBaseArgs] = useState<Record<ToolType, string>>({
    cursor: profile?.cursor?.baseArgs?.join(' ') || '',
    claude: profile?.claude?.baseArgs?.join(' ') || '',
    codex: profile?.codex?.baseArgs?.join(' ') || '',
  });
  const [stepTimeout, setStepTimeout] = useState<number>(profile?.stepTimeout || 1800);

  useEffect(() => {
    if (profile) {
      setToolModels({
        cursor: profile.cursor?.defaultModel || '',
        claude: profile.claude?.defaultModel || '',
        codex: profile.codex?.defaultModel || '',
      });
      setToolBaseArgs({
        cursor: profile.cursor?.baseArgs?.join(' ') || '',
        claude: profile.claude?.baseArgs?.join(' ') || '',
        codex: profile.codex?.baseArgs?.join(' ') || '',
      });
      setStepTimeout(profile.stepTimeout || 1800);
      setPlannerModel(profile.planner?.defaultModel || '');
      const exe = profile.planner?.executable || '';
      if (exe.includes('claude')) setPlannerTool('claude');
      else if (exe.includes('codex')) setPlannerTool('codex');
      else setPlannerTool('cursor');
    }
  }, [profile]);

  const detect = async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const r = await api.detectEnvironment();
      const rows = Array.isArray(r) ? r : [];
      setDetectRows(rows);

      const p = useAppStore.getState().profile;
      if (!p) return;

      const { next, changed } = mergeDetectedPathsIntoProfile(p, rows);
      if (changed) {
        await api.updateProfile(next as unknown as Record<string, unknown>);
        useAppStore.setState({ profile: next });
      }
    } catch (e) {
      setDetectRows(null);
      setDetectError((e as Error).message || 'Detect failed');
    } finally {
      setDetecting(false);
    }
  };

  const saveLLM = async () => {
    await api.updateLLMConfig(llm as unknown as Record<string, unknown>);
    useAppStore.setState({ llmConfig: llm });
  };

  const saveToolModel = async (tool: ToolType, model: string) => {
    if (!profile) return;
    const updated = {
      ...profile,
      [tool]: { ...profile[tool], defaultModel: model || undefined },
    };
    await api.updateProfile(updated as unknown as Record<string, unknown>);
    useAppStore.setState({ profile: updated });
  };

  const saveToolBaseArgs = async (tool: ToolType, argsStr: string) => {
    if (!profile) return;
    const args = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];
    const updated = {
      ...profile,
      [tool]: { ...profile[tool], baseArgs: args },
    };
    await api.updateProfile(updated as unknown as Record<string, unknown>);
    useAppStore.setState({ profile: updated });
  };

  const savePlannerConfig = async (tool: ToolType, model: string) => {
    if (!profile) return;
    // Copy the tool's CLI config as the planner config, override model
    const sourceConfig = profile[tool];
    const updated = {
      ...profile,
      planner: { ...sourceConfig, defaultModel: model || sourceConfig.defaultModel },
    };
    await api.updateProfile(updated as unknown as Record<string, unknown>);
    useAppStore.setState({ profile: updated });
  };

  const saveStepTimeout = async (seconds: number) => {
    if (!profile) return;
    const clamped = Math.max(60, Math.min(7200, seconds));
    const updated = { ...profile, stepTimeout: clamped };
    await api.updateProfile(updated as unknown as Record<string, unknown>);
    useAppStore.setState({ profile: updated });
  };

  const content = (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-6 max-h-[70vh] overflow-y-auto'}>
      {(section === 'all' || section === 'general') && (
        <section>
          <div className="flex items-center gap-4 mb-3">
            <div>
              <label className="block text-xs theme-text-secondary mb-1.5">{t.settings.theme}</label>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => setTheme('light')}
                  className={`px-4 py-1.5 text-xs font-medium transition-all ${theme === 'light' ? 'theme-active-bg theme-text' : 'theme-text-tertiary theme-hover'}`}
                  style={theme === 'light' ? { boxShadow: 'inset 0 0 0 1px var(--color-accent-border)' } : undefined}
                >
                  {t.settings.themeLight}
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`px-4 py-1.5 text-xs font-medium transition-all ${theme === 'dark' ? 'theme-active-bg theme-text' : 'theme-text-tertiary theme-hover'}`}
                  style={theme === 'dark' ? { boxShadow: 'inset 0 0 0 1px var(--color-accent-border)' } : undefined}
                >
                  {t.settings.themeDark}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs theme-text-secondary mb-1.5">{t.settings.language}</label>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => setLocale('zh')}
                  className={`px-4 py-1.5 text-xs font-medium transition-all ${locale === 'zh' ? 'theme-active-bg theme-text' : 'theme-text-tertiary theme-hover'}`}
                  style={locale === 'zh' ? { boxShadow: 'inset 0 0 0 1px var(--color-accent-border)' } : undefined}
                >
                  中文
                </button>
                <button
                  onClick={() => setLocale('en')}
                  className={`px-4 py-1.5 text-xs font-medium transition-all ${locale === 'en' ? 'theme-active-bg theme-text' : 'theme-text-tertiary theme-hover'}`}
                  style={locale === 'en' ? { boxShadow: 'inset 0 0 0 1px var(--color-accent-border)' } : undefined}
                >
                  English
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {(section === 'all' || section === 'agents') && (
        <>
          <section>
            <h3 className="text-sm font-medium theme-text mb-1 text-balance">{t.settings.cliProfile}</h3>
            <p className="text-xs theme-text-secondary mb-3 text-pretty">{t.settings.cliProfileHint}</p>
            <button type="button" onClick={detect} disabled={detecting} className="text-xs theme-text-tertiary hover:theme-text-secondary flex items-center gap-1.5">
              {detecting ? <><div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: 'color-mix(in srgb, var(--color-accent-solid) 24%, transparent)', borderTopColor: 'var(--color-accent-solid)' }} />{t.settings.detecting}</>
              : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>{t.settings.detectEnv}</>}
            </button>
            {detectError && <p className="mt-2 text-xs text-red-400/90">{detectError}</p>}
            {detectRows && detectRows.length > 0 && (
              <div className="mt-3 space-y-1.5 animate-fade-in">
                {detectRows.map((row) => (
                  <div key={row.executable} className="flex items-center gap-2 text-xs min-w-0">
                    <span className="theme-text-tertiary shrink-0 font-mono text-xs">{row.executable}</span>
                    <span className={`font-mono text-xs truncate ${row.found && row.path ? 'text-status-completed' : 'text-status-failed'}`}>
                      {row.path || t.settings.notFound}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-medium theme-text mb-1 text-balance">{t.settings.toolDefaultModels}</h3>
            <p className="text-xs theme-text-secondary mb-3 text-pretty">{t.settings.toolDefaultModelsHint}</p>
            <div className="space-y-3">
              {TOOL_TYPES.map((tool) => {
                const meta = TOOL_META[tool];
                return (
                  <div key={tool} className="p-3 rounded-lg space-y-2" style={{ border: '1px solid var(--color-border)' }}>
                    <span className="text-sm font-semibold" style={{ color: meta.tintColor }}>{meta.displayName}</span>
                    <div className="flex items-center gap-2">
                      <label className="text-xs theme-text-tertiary w-12 shrink-0">{t.settings.model}</label>
                      <input
                        className="input-field text-sm flex-1"
                        placeholder={meta.defaultModels[0] || 'auto'}
                        value={toolModels[tool]}
                        onChange={(e) => setToolModels({ ...toolModels, [tool]: e.target.value })}
                        onBlur={() => saveToolModel(tool, toolModels[tool])}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs theme-text-tertiary w-12 shrink-0">{t.settings.baseArgs}</label>
                      <input
                        className="input-field text-sm flex-1 font-mono"
                        placeholder={t.settings.baseArgsPlaceholder}
                        value={toolBaseArgs[tool]}
                        onChange={(e) => setToolBaseArgs({ ...toolBaseArgs, [tool]: e.target.value })}
                        onBlur={() => saveToolBaseArgs(tool, toolBaseArgs[tool])}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium theme-text mb-1 text-balance">{t.settings.stepTimeout}</h3>
            <p className="text-xs theme-text-secondary mb-3 text-pretty">{t.settings.stepTimeoutHint}</p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={60}
                max={7200}
                className="input-field text-sm w-24 text-center"
                value={stepTimeout}
                onChange={(e) => setStepTimeout(parseInt(e.target.value) || 1800)}
                onBlur={() => saveStepTimeout(stepTimeout)}
              />
              <span className="text-xs theme-text-tertiary tabular-nums">{t.settings.seconds} ({Math.floor(stepTimeout / 60)} {t.settings.minutes})</span>
            </div>
          </section>
        </>
      )}

      {(section === 'all' || section === 'planner') && (
        <section>
          <h3 className="text-sm font-medium theme-text mb-1 text-balance">{t.settings.plannerConfig}</h3>
          <p className="text-xs theme-text-secondary mb-3 text-pretty">{t.settings.plannerConfigHint}</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs theme-text-secondary mb-1.5">{t.settings.plannerTool}</label>
              <div className="grid grid-cols-3 gap-2">
                {TOOL_TYPES.map((tt) => {
                  const m = TOOL_META[tt];
                  return (
                    <button key={tt} onClick={() => { setPlannerTool(tt); savePlannerConfig(tt, plannerModel); }}
                      className={`p-2 rounded-lg text-center transition-all text-xs font-medium ${plannerTool === tt ? 'theme-active-bg theme-text' : 'theme-text-tertiary theme-hover'}`}
                      style={{ border: plannerTool === tt ? '1px solid var(--color-accent-border)' : '1px solid var(--color-border)' }}>
                      <span style={{ color: m.tintColor }}>{m.displayName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs theme-text-secondary mb-1.5">{t.settings.plannerModel}</label>
              <input className="input-field text-sm" placeholder={TOOL_META[plannerTool].defaultModels[0] || 'auto'} value={plannerModel} onChange={(e) => setPlannerModel(e.target.value)} onBlur={() => savePlannerConfig(plannerTool, plannerModel)} />
            </div>
            <div><label className="block text-xs theme-text-secondary mb-1.5">{t.settings.customPolicy}</label><textarea className="input-field text-sm min-h-[60px] resize-y" placeholder={t.settings.customPolicyPlaceholder} value={llm.customPolicy} onChange={(e) => setLlm({ ...llm, customPolicy: e.target.value })} onBlur={saveLLM} /></div>
          </div>
        </section>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center theme-backdrop backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg glass-panel-strong shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg theme-bg-2 flex items-center justify-center">
              <svg className="w-4 h-4 theme-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <h2 className="text-base font-semibold theme-text text-balance">{t.settings.title}</h2>
          </div>
          <ModalCloseButton onClick={close} label={t.stepDetail.close} />
        </div>
        {content}
      </div>
    </div>
  );
}
