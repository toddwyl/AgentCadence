import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { PipelineStep, ToolType, RetryRecord, PromptMentionItem, PromptMentionsResponse } from '@shared/types';
import { TOOL_META, TOOL_TYPES } from '@shared/types';
import { useAppStore } from '../../store/app-store';
import { api } from '../../lib/api';

type FailureMode = 'stop' | 'skip' | 'retry';

export function StepDetailPanel({ step, pipelineId, allSteps }: { step: PipelineStep; pipelineId: string; allSteps: PipelineStep[]; }) {
  const {
    updateStep,
    deleteStep,
    selectStep,
    stepStatuses,
    stepOutputs,
    stepRetryRecords,
    stepRetryMaxAttempts,
    isExecuting,
    executingPipelineID,
    pipelines,
    selectedPipeline,
    t,
  } = useAppStore();
  const [name, setName] = useState(step.name);
  const [prompt, setPrompt] = useState(step.prompt);
  const [tool, setTool] = useState<ToolType>(step.tool);
  const [command, setCommand] = useState(step.command || '');
  const [model, setModel] = useState(step.model || '');
  const [failureMode, setFailureMode] = useState<FailureMode>(step.failureMode || 'retry');
  const [retryCount, setRetryCount] = useState(step.retryCount ?? 3);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [mentionData, setMentionData] = useState<PromptMentionsResponse | null>(null);
  const [mentionsLoaded, setMentionsLoaded] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [skillFilter, setSkillFilter] = useState('');
  const [skillPickerIdx, setSkillPickerIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashPosRef = useRef<number>(-1);

  const pipeline = selectedPipeline();

  useEffect(() => {
    setName(step.name); setPrompt(step.prompt); setTool(step.tool);
    setCommand(step.command || ''); setModel(step.model || '');
    setFailureMode(step.failureMode || 'retry'); setRetryCount(step.retryCount ?? 3);
  }, [step.id]);

  useEffect(() => {
    if (pipeline?.workingDirectory) {
      api.getPromptMentions(pipeline.workingDirectory).then((data) => {
        setMentionData(data);
        setMentionsLoaded(true);
      }).catch(() => setMentionsLoaded(true));
    }
  }, [pipeline?.workingDirectory]);

  const matchesTool = (item: PromptMentionItem) => item.tool === tool || item.tool === 'all';

  const allMentionsForTool = useMemo(() => {
    if (!mentionData) return [];
    return [
      ...mentionData.skills.filter(matchesTool),
      ...mentionData.commands.filter(matchesTool),
      ...mentionData.subagents.filter(matchesTool),
    ];
  }, [mentionData, tool]);

  const countMentionsForTool = (tt: ToolType) => {
    if (!mentionData) return 0;
    const m = (items: PromptMentionItem[]) => items.filter((i) => i.tool === tt || i.tool === 'all').length;
    return m(mentionData.skills) + m(mentionData.commands) + m(mentionData.subagents);
  };

  const save = () => {
    updateStep(pipelineId, step.id, { name, prompt, tool, command: command || undefined, model: model || undefined, failureMode, retryCount });
  };
  const isDirty = name !== step.name || prompt !== step.prompt || tool !== step.tool || command !== (step.command || '') || model !== (step.model || '') || failureMode !== (step.failureMode || 'retry') || retryCount !== (step.retryCount ?? 3);
  const status = stepStatuses[step.id];
  const output = stepOutputs[step.id];
  const retryRecords = useMemo(() => {
    const live = stepRetryRecords[step.id];
    if (isExecuting && executingPipelineID === pipelineId && live?.length) {
      return live;
    }
    return getRetryRecordsFromHistory(pipelineId, step.id, pipelines);
  }, [
    isExecuting,
    executingPipelineID,
    pipelineId,
    step.id,
    stepRetryRecords,
    pipelines,
  ]);
  const liveRetryMax = stepRetryMaxAttempts[step.id];

  const filteredMentions = useMemo(
    () =>
      allMentionsForTool.filter((item) => {
        if (!skillFilter) return true;
        const q = skillFilter.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      }),
    [allMentionsForTool, skillFilter]
  );

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setPrompt(value);

    const textBefore = value.slice(0, cursorPos);
    const lastSlashIdx = textBefore.lastIndexOf('/');

    if (lastSlashIdx >= 0) {
      const charBefore = lastSlashIdx > 0 ? textBefore[lastSlashIdx - 1] : '\n';
      if (charBefore === '\n' || charBefore === ' ' || charBefore === undefined || lastSlashIdx === 0) {
        const query = textBefore.slice(lastSlashIdx + 1);
        if (!query.includes('\n') && !query.includes(' ')) {
          slashPosRef.current = lastSlashIdx;
          setSkillFilter(query);
          setShowSkillPicker(true);
          setSkillPickerIdx(0);
          return;
        }
      }
    }
    setShowSkillPicker(false);
  }, []);

  const insertMention = useCallback((item: PromptMentionItem) => {
    const slashPos = slashPosRef.current;
    if (slashPos < 0) return;

    const ta = textareaRef.current;
    const cursorPos = ta?.selectionStart ?? prompt.length;
    const before = prompt.slice(0, slashPos);
    const after = prompt.slice(cursorPos);
    const insertion = `/${item.name} `;
    const newPrompt = before + insertion + after;
    setPrompt(newPrompt);
    setShowSkillPicker(false);
    slashPosRef.current = -1;

    setTimeout(() => {
      if (ta) {
        const newPos = before.length + insertion.length;
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [prompt]);

  const handlePromptKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSkillPicker || filteredMentions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSkillPickerIdx((prev) => Math.min(prev + 1, filteredMentions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSkillPickerIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(filteredMentions[skillPickerIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSkillPicker(false);
    }
  }, [showSkillPicker, filteredMentions, skillPickerIdx, insertMention]);

  return (
    <div className="w-[420px] flex flex-col animate-slide-in theme-bg-1" style={{ borderLeft: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h3 className="text-sm font-semibold theme-text">{t.stepDetail.title}</h3>
        <div className="flex items-center gap-2">
          {isDirty && <button onClick={save} className="btn-primary text-xs py-1">{t.stepDetail.save}</button>}
          <button onClick={() => selectStep(null)} className="btn-ghost text-xs">{t.stepDetail.close}</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {status && (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${statusStyle(status)}`}>
            <span className={`status-dot ${statusDotColor(status)}`} />
            {(t.status as Record<string, string>)[status] || status}
          </div>
        )}
        <div><label className="block text-xs theme-text-tertiary mb-1.5">{t.stepDetail.name}</label><input className="input-field text-sm" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} /></div>
        <div>
          <label className="block text-xs theme-text-tertiary mb-1.5">{t.stepDetail.tool}</label>
          <div className="grid grid-cols-3 gap-2">
            {TOOL_TYPES.map((tt) => {
              const m = TOOL_META[tt];
              const skillCount = countMentionsForTool(tt);
              return (
                <button key={tt} onClick={() => setTool(tt)}
                  className={`p-2.5 rounded-lg text-center transition-all text-xs font-medium ${tool === tt ? 'theme-active-bg theme-text' : 'theme-text-tertiary theme-hover'}`}
                  style={{ border: tool === tt ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--color-border)' }}>
                  <div className="w-5 h-5 rounded mx-auto mb-1" style={{ backgroundColor: m.tintColor + '25' }}>
                    <div className="w-full h-full flex items-center justify-center text-[10px]" style={{ color: m.tintColor }}>{tt === 'codex' ? '⌘' : tt === 'claude' ? '◉' : '▸'}</div>
                  </div>
                  {m.displayName}
                  {skillCount > 0 && <span className="ml-1 text-[9px] theme-text-muted">({skillCount})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Prompt with skill autocomplete */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs theme-text-tertiary">{t.stepDetail.prompt}</label>
            {allMentionsForTool.length > 0 && (
              <span className="text-[10px] theme-text-muted">{t.stepDetail.promptHint}</span>
            )}
          </div>
          {pipeline && Object.keys(pipeline.globalVariables ?? {}).length > 0 && (
            <p className="text-[10px] theme-text-muted mb-1.5 font-mono">
              {t.stepDetail.promptVarHint}{' '}
              {Object.keys(pipeline.globalVariables ?? {}).map((k) => (
                <span key={k} className="text-accent-glow/90 mr-1.5">{`{{${k}}}`}</span>
              ))}
            </p>
          )}
          <textarea
            ref={textareaRef}
            className="input-field text-sm min-h-[120px] resize-y font-mono leading-relaxed w-full"
            value={prompt}
            onChange={handlePromptChange}
            onKeyDown={handlePromptKeyDown}
            onBlur={() => { setTimeout(() => setShowSkillPicker(false), 200); save(); }}
          />

          {showSkillPicker && (
            <div className="absolute left-0 right-0 z-30 mt-1 max-h-[280px] overflow-y-auto rounded-lg shadow-lg theme-bg-1 animate-fade-in"
              style={{ border: '1px solid var(--color-border)' }}>
              {!mentionsLoaded ? (
                <div className="p-3 text-xs theme-text-muted text-center">{t.stepDetail.loadingSkills}</div>
              ) : filteredMentions.length === 0 ? (
                <div className="p-3 text-xs theme-text-muted text-center">{t.stepDetail.noMentions}</div>
              ) : (
                filteredMentions.map((item, i) => (
                  <div key={item.id}>
                    {(i === 0 || filteredMentions[i - 1].kind !== item.kind) && (
                      <div className="px-2 py-1.5 text-[10px] font-semibold theme-text-muted uppercase tracking-wide theme-bg-0 sticky top-0">
                        {item.kind === 'skill'
                          ? t.stepDetail.mentionSkills
                          : item.kind === 'command'
                            ? t.stepDetail.mentionCommands
                            : t.stepDetail.mentionSubagents}
                      </div>
                    )}
                    <div
                      className={`px-3 py-2 cursor-pointer transition-colors ${i === skillPickerIdx ? 'theme-active-bg' : 'theme-hover'}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(item);
                      }}
                      onMouseEnter={() => setSkillPickerIdx(i)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                            item.kind === 'skill'
                              ? 'bg-violet-500/15 text-violet-400'
                              : item.kind === 'command'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          {item.kind === 'skill'
                            ? t.stepDetail.badgeSkill
                            : item.kind === 'command'
                              ? t.stepDetail.badgeCommand
                              : t.stepDetail.badgeSubagent}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${item.source === 'project' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'}`}>
                          {item.source === 'project' ? t.stepDetail.skillProject : t.stepDetail.skillUser}
                        </span>
                        <span className="text-xs font-medium theme-text font-mono">/{item.name}</span>
                      </div>
                      {item.description && (
                        <p className="text-[10px] theme-text-muted mt-0.5 line-clamp-2">{item.description}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Failure handling - radio style */}
        <div className="space-y-3 p-3 rounded-lg" style={{ border: '1px solid var(--color-border)' }}>
          <label className="block text-xs font-medium theme-text-secondary mb-2">{t.stepDetail.failureHandling}</label>

          <label className="flex items-center gap-2 text-sm theme-text-secondary cursor-pointer">
            <input type="radio" name={`failureMode-${step.id}`} checked={failureMode === 'retry'} onChange={() => setFailureMode('retry')} className="accent-accent-primary" />
            {t.stepDetail.failureRetry}
          </label>
          {failureMode === 'retry' && (
            <div className="flex items-center gap-3 pl-6 animate-fade-in">
              <label className="text-xs theme-text-tertiary whitespace-nowrap">{t.stepDetail.retryCount}</label>
              <input type="number" min={1} max={10} className="input-field text-sm w-20 text-center" value={retryCount}
                onChange={(e) => setRetryCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} onBlur={save} />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm theme-text-secondary cursor-pointer">
            <input type="radio" name={`failureMode-${step.id}`} checked={failureMode === 'skip'} onChange={() => setFailureMode('skip')} className="accent-accent-primary" />
            {t.stepDetail.failureSkip}
          </label>

          <label className="flex items-center gap-2 text-sm theme-text-secondary cursor-pointer">
            <input type="radio" name={`failureMode-${step.id}`} checked={failureMode === 'stop'} onChange={() => setFailureMode('stop')} className="accent-accent-primary" />
            {t.stepDetail.failureStop}
          </label>
        </div>

        {retryRecords.length > 0 && (
          <div className="space-y-2 p-3 rounded-lg bg-amber-500/[0.04]" style={{ border: '1px solid rgba(245,158,11,0.2)' }}>
            <label className="block text-xs font-medium text-amber-500">{t.stepDetail.retryRecords}</label>
            {liveRetryMax && isExecuting && executingPipelineID === pipelineId && (
              <p className="text-[10px] text-amber-400/90">
                {t.stepDetail.retryInfo
                  .replace('{current}', String(retryRecords.length))
                  .replace('{total}', String(liveRetryMax))}
              </p>
            )}
            {retryRecords.map((record, i) => (
              <div key={i} className="text-xs p-2 rounded theme-bg-0" style={{ border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium theme-text-secondary">
                    {t.stepDetail.retryAttempt.replace('{n}', String(record.attempt))}
                  </span>
                  <span className="text-[10px] theme-text-muted">{new Date(record.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-red-400 font-mono text-[11px] break-all">{record.error}</p>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs theme-text-tertiary flex items-center gap-1">
          <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          {t.stepDetail.advanced}
        </button>
        {showAdvanced && (
          <div className="space-y-3 pl-4 animate-fade-in" style={{ borderLeft: '2px solid var(--color-border)' }}>
            <div><label className="block text-xs theme-text-tertiary mb-1.5">{t.stepDetail.customCommand}</label><input className="input-field text-sm font-mono" placeholder={t.stepDetail.customCommandPlaceholder} value={command} onChange={(e) => setCommand(e.target.value)} onBlur={save} /></div>
            <div><label className="block text-xs theme-text-tertiary mb-1.5">{t.stepDetail.modelOverride}</label><input className="input-field text-sm" placeholder={t.stepDetail.modelPlaceholder} value={model} onChange={(e) => setModel(e.target.value)} onBlur={save} /></div>
          </div>
        )}
        {output && (<div><label className="block text-xs theme-text-tertiary mb-1.5">{t.stepDetail.output}</label><pre className="p-3 theme-bg-0 rounded-lg text-xs font-mono theme-text-secondary max-h-[300px] overflow-auto whitespace-pre-wrap break-all">{output}</pre></div>)}
        <button onClick={() => { deleteStep(pipelineId, step.id); selectStep(null); }} className="btn-danger text-xs w-full">{t.stepDetail.deleteStep}</button>
      </div>
    </div>
  );
}

function getRetryRecordsFromHistory(pipelineId: string, stepId: string, pipelines: any[]): RetryRecord[] {
  const pipeline = pipelines.find((p: any) => p.id === pipelineId);
  if (!pipeline?.runHistory?.length) return [];
  const lastRun = pipeline.runHistory[pipeline.runHistory.length - 1];
  for (const stageRun of lastRun.stageRuns || []) {
    for (const stepRun of stageRun.stepRuns || []) {
      if (stepRun.stepID === stepId && stepRun.retryRecords?.length) {
        return stepRun.retryRecords;
      }
    }
  }
  return [];
}

function statusStyle(status: string): string {
  const m: Record<string, string> = { running: 'bg-status-running/10 text-status-running', completed: 'bg-status-completed/10 text-status-completed', failed: 'bg-status-failed/10 text-status-failed', skipped: 'bg-status-skipped/10 text-status-skipped' };
  return m[status] || 'bg-status-pending/10 text-status-pending';
}
function statusDotColor(status: string): string {
  const m: Record<string, string> = { running: 'bg-status-running animate-pulse', completed: 'bg-status-completed', failed: 'bg-status-failed', skipped: 'bg-status-skipped' };
  return m[status] || 'bg-status-pending';
}
