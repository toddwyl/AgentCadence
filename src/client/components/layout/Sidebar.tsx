import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { api } from '../../lib/api';
import { pickWorkingDirectory } from '../../lib/pick-folder';
import type { Pipeline, PipelineTemplate } from '@shared/types';

export function Sidebar() {
  const {
    projectGroups, selectedPipelineID, selectPipeline, deletePipeline,
    isExecuting, executingPipelineID, setShowAutoPlanner, setShowSettings,
    setShowAnalytics, setShowTemplates, t,
  } = useAppStore();

  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDir, setNewDir] = useState('');
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>('');

  const groups = projectGroups();

  useEffect(() => {
    if (!showNewProject) return;
    let cancelled = false;
    (async () => {
      try {
        const [tmplList, home] = await Promise.all([
          api.getTemplates(),
          api.getHomePath().catch(() => ({ path: '' })),
        ]);
        if (!cancelled) {
          setTemplates(tmplList);
          setNewDir((d) => (d.trim() ? d : home.path || ''));
        }
      } catch {
        if (!cancelled) setTemplates([]);
      }
    })();
    return () => { cancelled = true; };
  }, [showNewProject]);

  const handleBrowseDir = async () => {
    const p = await pickWorkingDirectory();
    if (p) setNewDir(p);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newDir.trim()) return;
    await useAppStore.getState().createPipeline(
      newName.trim(),
      newDir.trim(),
      templateId || null
    );
    setNewName('');
    setNewDir('');
    setTemplateId('');
    setShowNewProject(false);
  };

  return (
    <aside className="w-72 h-screen flex flex-col theme-sidebar">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h3.75m-3.75 6h7.5m-7.5 6h3.75" />
          </svg>
        </div>
        <div>
          <h1 className="font-display font-bold theme-text text-lg leading-tight">{t.app.name}</h1>
          <p className="text-[10px] theme-text-muted tracking-wider uppercase">{t.app.subtitle}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 mb-2 flex gap-2">
        <button onClick={() => setShowNewProject(true)} className="flex-1 btn-ghost text-xs flex items-center justify-center gap-1.5 theme-border" style={{ border: '1px solid var(--color-border)' }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          {t.sidebar.newPipeline}
        </button>
        <button onClick={() => setShowAutoPlanner(true)} className="flex-1 btn-ghost text-xs flex items-center justify-center gap-1.5 text-accent-glow" style={{ border: '1px solid rgba(99,102,241,0.2)' }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
          {t.sidebar.aiGenerate}
        </button>
      </div>

      {/* New pipeline form */}
      {showNewProject && (
        <div className="mx-3 mb-3 p-3 glass-panel space-y-2 animate-fade-in">
          <input className="input-field text-sm" placeholder={t.sidebar.pipelineName} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <label className="block text-[10px] theme-text-tertiary">{t.sidebar.pipelineTemplate}</label>
          <select
            className="input-field text-sm w-full"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">{t.sidebar.blankPipeline}</option>
            {templates.map((tm) => (
              <option key={tm.id} value={tm.id}>{tm.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              className="input-field text-sm flex-1 min-w-0"
              placeholder={t.sidebar.workingDir}
              value={newDir}
              onChange={(e) => setNewDir(e.target.value)}
            />
            <button type="button" onClick={handleBrowseDir} className="btn-ghost text-xs shrink-0 px-2" title={t.sidebar.browseFolder}>
              {t.sidebar.browseFolder}
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="btn-primary text-xs flex-1">{t.sidebar.create}</button>
            <button onClick={() => { setShowNewProject(false); setTemplateId(''); }} className="btn-ghost text-xs">{t.sidebar.cancel}</button>
          </div>
        </div>
      )}

      {/* Pipeline list */}
      <div className="flex-1 overflow-y-auto px-3 space-y-4">
        {groups.map((group) => (
          <div key={group.workingDirectory} className="animate-fade-in">
            <div className="flex items-center gap-2 mb-1.5 px-2">
              <svg className="w-3.5 h-3.5 theme-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
              <span className="text-xs font-medium theme-text-tertiary truncate">{group.displayName}</span>
            </div>
            <div className="space-y-0.5">
              {group.pipelines.map((pipeline) => (
                <PipelineItem key={pipeline.id} pipeline={pipeline}
                  selected={selectedPipelineID === pipeline.id}
                  running={isExecuting && executingPipelineID === pipeline.id}
                  onSelect={() => selectPipeline(pipeline.id)}
                  onDelete={() => deletePipeline(pipeline.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="p-3 flex gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button onClick={() => setShowSettings(true)} className="btn-ghost text-xs flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          {t.sidebar.settings}
        </button>
        <button onClick={() => setShowTemplates(true)} className="btn-ghost text-xs flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          {t.sidebar.templates}
        </button>
        <button onClick={() => setShowAnalytics(true)} className="btn-ghost text-xs flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
          {t.sidebar.insights}
        </button>
      </div>
    </aside>
  );
}

function PipelineItem({ pipeline, selected, running, onSelect, onDelete }: {
  pipeline: Pipeline; selected: boolean; running: boolean; onSelect: () => void; onDelete: () => void;
}) {
  const { t } = useAppStore();
  const stepCount = pipeline.stages.reduce((sum, s) => sum + s.steps.length, 0);
  const modeLabel = 'Pipeline';
  return (
    <div onClick={onSelect}
      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150
        ${selected ? 'theme-active-bg' : 'theme-hover'}`}
      style={selected ? { border: '1px solid rgba(99,102,241,0.2)' } : { border: '1px solid transparent' }}>
      {running && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-status-running rounded-full running-glow" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium truncate ${selected ? 'theme-text' : 'theme-text-secondary'}`}>{pipeline.name}</span>
          {pipeline.isAIGenerated && <span className="badge bg-accent-primary/15 text-accent-glow text-[9px]">AI</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] theme-text-muted">{pipeline.stages.length} {t.sidebar.stages} / {stepCount} {t.sidebar.steps}</span>
          <span className="text-[10px] px-1.5 py-px rounded bg-blue-500/10 text-blue-500">{modeLabel}</span>
        </div>
      </div>
      {!running && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 p-1 theme-text-muted hover:text-red-500 transition-all">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
        </button>
      )}
    </div>
  );
}
