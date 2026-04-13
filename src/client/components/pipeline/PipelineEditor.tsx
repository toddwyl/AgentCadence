import { useState } from 'react';
import type { Pipeline, PipelineStage, PipelineStep, ToolType } from '@shared/types';
import { TOOL_META, TOOL_TYPES, safeToolMeta } from '@shared/types';
import { useAppStore } from '../../store/app-store';
import { StepDetailPanel } from './StepDetailPanel';
import { PipelineSettingsPanel } from './PipelineSettingsPanel';

export function PipelineEditor({ pipeline }: { pipeline: Pipeline }) {
  const { addStage, selectStep, selectedStepID, loadDemo, t } = useAppStore();
  const [showPipelineSettings, setShowPipelineSettings] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageMode, setNewStageMode] = useState('parallel');

  const selectedStep = pipeline.stages.flatMap((s) => s.steps).find((s) => s.id === selectedStepID);

  const handleAddStage = async () => {
    const name = newStageName.trim() || t.editor.defaultStageName;
    await addStage(pipeline.id, name, newStageMode);
    setNewStageName(''); setAddingStage(false);
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowPipelineSettings(!showPipelineSettings)}
            className="btn-ghost p-1.5 rounded-lg"
            title="Pipeline Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        </div>
        {pipeline.stages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl theme-bg-2 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 theme-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </div>
            <h3 className="text-lg font-semibold theme-text-secondary mb-1">{t.editor.noStages}</h3>
            <p className="text-sm theme-text-muted mb-6 max-w-sm">{t.editor.noStagesDesc}</p>
            <div className="flex gap-3">
              <button onClick={() => setAddingStage(true)} className="btn-primary text-sm">{t.editor.addStage}</button>
              <button onClick={() => loadDemo(pipeline.id)} className="btn-ghost text-sm" style={{ border: '1px solid var(--color-border)' }}>{t.editor.loadDemo}</button>
            </div>
          </div>
        ) : (
          pipeline.stages.map((stage, i) => (
            <StageCard key={stage.id} stage={stage} stageIndex={i} pipelineId={pipeline.id} onSelectStep={selectStep} selectedStepId={selectedStepID} />
          ))
        )}
        {addingStage ? (
          <div className="glass-panel p-4 space-y-3 animate-fade-in">
            <input className="input-field text-sm" placeholder={t.editor.stageName} value={newStageName} onChange={(e) => setNewStageName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && handleAddStage()} />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm theme-text-secondary cursor-pointer"><input type="radio" checked={newStageMode === 'parallel'} onChange={() => setNewStageMode('parallel')} className="accent-accent-primary" />{t.editor.parallel}</label>
              <label className="flex items-center gap-2 text-sm theme-text-secondary cursor-pointer"><input type="radio" checked={newStageMode === 'sequential'} onChange={() => setNewStageMode('sequential')} className="accent-accent-primary" />{t.editor.sequential}</label>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddStage} className="btn-primary text-xs">{t.editor.addStage}</button>
              <button onClick={() => setAddingStage(false)} className="btn-ghost text-xs">{t.sidebar.cancel}</button>
            </div>
          </div>
        ) : pipeline.stages.length > 0 && (
          <button onClick={() => setAddingStage(true)} className="w-full py-3 border-2 border-dashed rounded-xl theme-text-muted hover:theme-text-secondary transition-all text-sm flex items-center justify-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {t.editor.addStage}
          </button>
        )}
      </div>
      {showPipelineSettings && <PipelineSettingsPanel pipeline={pipeline} onClose={() => setShowPipelineSettings(false)} />}
      {selectedStep && <StepDetailPanel step={selectedStep} pipelineId={pipeline.id} allSteps={pipeline.stages.flatMap((s) => s.steps)} />}
    </div>
  );
}

function StageCard({ stage, stageIndex, pipelineId, onSelectStep, selectedStepId }: {
  stage: PipelineStage; stageIndex: number; pipelineId: string; onSelectStep: (id: string | null) => void; selectedStepId: string | null;
}) {
  const { deleteStage, updateStage, addStep, t } = useAppStore();
  const [addingStep, setAddingStep] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [newStepTool, setNewStepTool] = useState<ToolType>('cursor');
  const [newStepPrompt, setNewStepPrompt] = useState('');

  const handleAddStep = async () => {
    const name = newStepName.trim() || t.editor.defaultStepName;
    await addStep(pipelineId, stage.id, { name, prompt: newStepPrompt.trim(), tool: newStepTool });
    setNewStepName(''); setNewStepPrompt(''); setAddingStep(false);
  };

  return (
    <div className="glass-panel overflow-hidden animate-slide-in">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono theme-text-muted tabular-nums w-6 text-right" title={`#${stageIndex + 1}`}>
            {stageIndex + 1}
          </span>
          <h3 className="text-sm font-semibold theme-text">{stage.name}</h3>
          <span className={`badge text-[10px] ${stage.executionMode === 'parallel' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
            {stage.executionMode === 'parallel' ? `⇉ ${t.editor.parallel}` : `→ ${t.editor.sequential}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => updateStage(pipelineId, stage.id, { executionMode: stage.executionMode === 'parallel' ? 'sequential' : 'parallel' })} className="btn-ghost text-[10px]">{t.editor.toggleMode}</button>
          <button onClick={() => deleteStage(pipelineId, stage.id)} className="btn-ghost text-[10px] text-red-400/60 hover:text-red-500">{t.editor.delete}</button>
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        {stage.steps.map((step, i) => (
          <StepRow key={step.id} step={step} stepIndex={i} selected={selectedStepId === step.id} onClick={() => onSelectStep(step.id === selectedStepId ? null : step.id)} />
        ))}
        {addingStep ? (
          <div className="p-3 theme-bg-0 rounded-lg space-y-2 animate-fade-in" style={{ opacity: 0.9 }}>
            <input className="input-field text-sm" placeholder={t.editor.stepName} value={newStepName} onChange={(e) => setNewStepName(e.target.value)} autoFocus />
            <select className="input-field text-sm" value={newStepTool} onChange={(e) => setNewStepTool(e.target.value as ToolType)}>
              {TOOL_TYPES.map((tt) => <option key={tt} value={tt}>{TOOL_META[tt].displayName}</option>)}
            </select>
            <textarea className="input-field text-sm min-h-[60px] resize-y" placeholder={t.editor.promptPlaceholder} value={newStepPrompt} onChange={(e) => setNewStepPrompt(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={handleAddStep} className="btn-primary text-xs">{t.editor.addStep}</button>
              <button onClick={() => setAddingStep(false)} className="btn-ghost text-xs">{t.sidebar.cancel}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddingStep(true)} className="w-full py-2 text-xs theme-text-muted theme-hover rounded-lg transition-all flex items-center justify-center gap-1.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {t.editor.addStep}
          </button>
        )}
      </div>
    </div>
  );
}

function StepRow({ step, stepIndex, selected, onClick }: { step: PipelineStep; stepIndex: number; selected: boolean; onClick: () => void; }) {
  const meta = safeToolMeta(step.tool);
  return (
    <div onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150
        ${selected ? 'theme-active-bg glow-border' : 'theme-hover'}`}
      style={selected ? { border: '1px solid rgba(99,102,241,0.2)' } : { border: '1px solid transparent' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: meta.tintColor + '18', color: meta.tintColor }}>{stepIndex + 1}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm theme-text-secondary truncate">{step.name}</div>
        <div className="text-[10px] theme-text-muted truncate mt-0.5">{step.prompt.slice(0, 80)}</div>
      </div>
      <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ backgroundColor: meta.tintColor + '15', color: meta.tintColor }}>{meta.displayName}</span>
    </div>
  );
}
