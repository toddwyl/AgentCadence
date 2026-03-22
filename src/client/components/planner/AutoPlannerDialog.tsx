import { useState } from 'react';
import { useAppStore } from '../../store/app-store';
import { pickWorkingDirectory } from '../../lib/pick-folder';
import type { PlanningPhase } from '@shared/types';

const PHASES: PlanningPhase[] = ['preparingContext', 'invokingAgentCLI', 'generatingStructure', 'parsingResult', 'creatingPipeline'];

export function AutoPlannerDialog() {
  const { setShowAutoPlanner, generatePipeline, isPlanningInProgress, planningPhase, planningLogs, planningError, pipelines, t } = useAppStore();
  const [prompt, setPrompt] = useState('');
  const [workDir, setWorkDir] = useState(() => pipelines.find((p) => p.workingDirectory.trim())?.workingDirectory || '');
  const handleGenerate = () => { if (prompt.trim() && workDir.trim()) generatePipeline(prompt.trim(), workDir.trim()); };
  const currentPhaseIndex = planningPhase ? PHASES.indexOf(planningPhase) : -1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center theme-backdrop backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl glass-panel-strong shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-primary/30 to-accent-secondary/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent-glow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            </div>
            <div><h2 className="text-sm font-semibold theme-text">{t.planner.title}</h2><p className="text-[10px] theme-text-muted">{t.planner.subtitle}</p></div>
          </div>
          <button onClick={() => setShowAutoPlanner(false)} className="btn-ghost text-xs">{t.stepDetail.close}</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs theme-text-tertiary mb-1.5">{t.planner.workingDir}</label>
            <div className="flex gap-2">
              <input className="input-field text-sm font-mono flex-1 min-w-0" placeholder={t.planner.workDirPlaceholder} value={workDir} onChange={(e) => setWorkDir(e.target.value)} disabled={isPlanningInProgress} />
              <button type="button" disabled={isPlanningInProgress} className="btn-ghost text-xs shrink-0 px-2" onClick={async () => { const p = await pickWorkingDirectory(); if (p) setWorkDir(p); }}>{t.header.browseFolder}</button>
            </div>
          </div>
          <div><label className="block text-xs theme-text-tertiary mb-1.5">{t.planner.taskDesc}</label><textarea className="input-field text-sm min-h-[100px] resize-y" placeholder={t.planner.taskPlaceholder} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={isPlanningInProgress} autoFocus /></div>
          {isPlanningInProgress && (
            <div className="space-y-2 animate-fade-in">{PHASES.map((phase, idx) => {
              const isActive = idx === currentPhaseIndex, isDone = idx < currentPhaseIndex;
              return (
                <div key={phase} className="flex items-center gap-3">
                  {isDone ? <div className="w-5 h-5 rounded-full bg-status-completed/20 flex items-center justify-center"><svg className="w-3 h-3 text-status-completed" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></div>
                  : isActive ? <div className="w-5 h-5 flex items-center justify-center"><div className="w-3.5 h-3.5 border-2 border-accent-glow border-t-transparent rounded-full animate-spin" /></div>
                  : <div className="w-5 h-5 rounded-full theme-bg-3" style={{ border: '1px solid var(--color-border)' }} />}
                  <span className={`text-xs ${isActive ? 'theme-text font-medium' : isDone ? 'theme-text-tertiary' : 'theme-text-muted'}`}>{t.planner.phases[phase]}</span>
                </div>
              );
            })}</div>
          )}
          {isPlanningInProgress && planningLogs && (<div><label className="block text-xs theme-text-tertiary mb-1.5">{t.planner.agentOutput}</label><pre className="p-3 theme-bg-0 rounded-lg text-[10px] font-mono theme-text-tertiary max-h-[150px] overflow-auto whitespace-pre-wrap">{planningLogs}</pre></div>)}
          {planningError && <div className="p-3 bg-red-500/[0.08] rounded-lg animate-fade-in" style={{ border: '1px solid rgba(239,68,68,0.2)' }}><p className="text-xs text-red-500">{planningError}</p></div>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button onClick={() => setShowAutoPlanner(false)} className="btn-ghost text-sm">{t.sidebar.cancel}</button>
          <button onClick={handleGenerate} disabled={isPlanningInProgress || !prompt.trim() || !workDir.trim()} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
            {isPlanningInProgress ? (<><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t.planner.generating}</>) : (<><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>{t.planner.generate}</>)}
          </button>
        </div>
      </div>
    </div>
  );
}
