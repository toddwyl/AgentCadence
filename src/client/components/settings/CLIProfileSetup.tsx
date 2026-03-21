import { useState, useEffect } from 'react';
import type { LLMConfig, DetectionResult } from '@shared/types';
import { useAppStore } from '../../store/app-store';
import { api } from '../../lib/api';

export function CLIProfileSetup() {
  const { setShowSettings, llmConfig, t, theme, setTheme, locale, setLocale } = useAppStore();
  const [detecting, setDetecting] = useState(false);
  const [detectRows, setDetectRows] = useState<DetectionResult[] | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [llm, setLlm] = useState<LLMConfig>(llmConfig);

  const detect = async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const r = await api.detectEnvironment();
      setDetectRows(Array.isArray(r) ? r : []);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center theme-backdrop backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg glass-panel-strong shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg theme-bg-2 flex items-center justify-center">
              <svg className="w-4 h-4 theme-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <h2 className="text-sm font-semibold theme-text">{t.settings.title}</h2>
          </div>
          <button onClick={() => setShowSettings(false)} className="btn-ghost text-xs">{t.stepDetail.close}</button>
        </div>
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Appearance */}
          <section>
            <div className="flex items-center gap-4 mb-3">
              <div>
                <label className="block text-xs theme-text-tertiary mb-1.5">{t.settings.theme}</label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                  <button onClick={() => setTheme('light')} className={`px-4 py-1.5 text-xs font-medium transition-all ${theme === 'light' ? 'bg-accent-primary/20 text-accent-glow' : 'theme-text-tertiary theme-hover'}`}>{t.settings.themeLight}</button>
                  <button onClick={() => setTheme('dark')} className={`px-4 py-1.5 text-xs font-medium transition-all ${theme === 'dark' ? 'bg-accent-primary/20 text-accent-glow' : 'theme-text-tertiary theme-hover'}`}>{t.settings.themeDark}</button>
                </div>
              </div>
              <div>
                <label className="block text-xs theme-text-tertiary mb-1.5">{t.settings.language}</label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                  <button onClick={() => setLocale('zh')} className={`px-4 py-1.5 text-xs font-medium transition-all ${locale === 'zh' ? 'bg-accent-primary/20 text-accent-glow' : 'theme-text-tertiary theme-hover'}`}>中文</button>
                  <button onClick={() => setLocale('en')} className={`px-4 py-1.5 text-xs font-medium transition-all ${locale === 'en' ? 'bg-accent-primary/20 text-accent-glow' : 'theme-text-tertiary theme-hover'}`}>English</button>
                </div>
              </div>
            </div>
          </section>

          {/* CLI detection (default profile: cursor-agent / codex / claude) */}
          <section>
            <h3 className="text-xs font-medium theme-text-secondary mb-1">{t.settings.cliProfile}</h3>
            <p className="text-[10px] theme-text-muted mb-3">{t.settings.cliProfileHint}</p>
            <button type="button" onClick={detect} disabled={detecting} className="text-xs theme-text-tertiary hover:theme-text-secondary flex items-center gap-1.5">
              {detecting ? <><div className="w-3 h-3 border-2 border-accent-glow/30 border-t-accent-glow rounded-full animate-spin" />{t.settings.detecting}</>
              : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>{t.settings.detectEnv}</>}
            </button>
            {detectError && <p className="mt-2 text-xs text-red-400/90">{detectError}</p>}
            {detectRows && detectRows.length > 0 && (
              <div className="mt-3 space-y-1.5 animate-fade-in">
                {detectRows.map((row) => (
                  <div key={row.executable} className="flex items-center gap-2 text-xs min-w-0">
                    <span className="theme-text-tertiary shrink-0 font-mono text-[10px]">{row.executable}</span>
                    <span className={`font-mono text-[10px] truncate ${row.found && row.path ? 'text-status-completed' : 'text-status-failed'}`}>
                      {row.path || t.settings.notFound}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Planner */}
          <section>
            <h3 className="text-xs font-medium theme-text-secondary mb-3">{t.settings.plannerConfig}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs theme-text-tertiary mb-1.5">{t.settings.plannerModel}</label><input className="input-field text-sm" value={llm.model} onChange={(e) => setLlm({ ...llm, model: e.target.value })} onBlur={saveLLM} /></div>
              <div><label className="block text-xs theme-text-tertiary mb-1.5">{t.settings.customPolicy}</label><textarea className="input-field text-sm min-h-[60px] resize-y" placeholder={t.settings.customPolicyPlaceholder} value={llm.customPolicy} onChange={(e) => setLlm({ ...llm, customPolicy: e.target.value })} onBlur={saveLLM} /></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
