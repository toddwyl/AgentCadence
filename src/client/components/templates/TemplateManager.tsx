import { useState, useEffect } from 'react';
import type { PipelineTemplate } from '@shared/types';
import { api } from '../../lib/api';
import { pickWorkingDirectory } from '../../lib/pick-folder';
import { useAppStore } from '../../store/app-store';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { ModalCloseButton } from '../ui/ModalCloseButton';

export function TemplateManager({ embedded = false }: { embedded?: boolean }) {
  const { t, pipelines, refreshPipelines, selectPipeline } = useAppStore();
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [showUseForm, setShowUseForm] = useState<string | null>(null);
  const [savePipelineId, setSavePipelineId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [importMd, setImportMd] = useState('');
  const [useWorkDir, setUseWorkDir] = useState('');
  const setShowTemplates = useAppStore((s) => s.setShowTemplates);
  const close = () => setShowTemplates(false);
  useEscapeToClose(close, !embedded);

  const reload = async () => {
    const data = await api.getTemplates();
    setTemplates(data);
  };

  useEffect(() => { reload(); }, []);

  const handleSave = async () => {
    if (!savePipelineId || !templateName.trim()) return;
    await api.saveAsTemplate(savePipelineId, templateName.trim(), templateDesc.trim());
    setShowSaveForm(false); setTemplateName(''); setTemplateDesc(''); setSavePipelineId('');
    reload();
  };

  const handleImport = async () => {
    if (!importMd.trim()) return;
    await api.importTemplateMd(importMd.trim());
    setShowImportForm(false); setImportMd('');
    reload();
  };

  const handleExport = async (id: string) => {
    const { markdown } = await api.exportTemplateMd(id);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const tmpl = templates.find((t) => t.id === id);
    a.download = `${tmpl?.name || 'template'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    await api.deleteTemplate(id);
    reload();
  };

  const handleUseTemplate = async (templateId: string) => {
    if (!useWorkDir.trim()) return;
    const pipeline = await api.createFromTemplate(templateId, useWorkDir.trim());
    await refreshPipelines();
    selectPipeline(pipeline.id);
    setShowUseForm(null); setUseWorkDir('');
    if (!embedded) close();
  };

  const content = (
    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Save form */}
          {showSaveForm && (
            <div className="p-4 rounded-lg space-y-3 animate-fade-in" style={{ border: '1px solid var(--color-accent-border)' }}>
              <select className="input-field text-sm w-full" value={savePipelineId} onChange={(e) => setSavePipelineId(e.target.value)}>
                <option value="">-- Select Pipeline --</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input className="input-field text-sm" placeholder={t.templates.templateName} value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              <input className="input-field text-sm" placeholder={t.templates.templateDesc} value={templateDesc} onChange={(e) => setTemplateDesc(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={handleSave} className="btn-primary text-xs">{t.templates.save}</button>
                <button onClick={() => setShowSaveForm(false)} className="btn-ghost text-xs">{t.sidebar.cancel}</button>
              </div>
            </div>
          )}

          {/* Import form */}
          {showImportForm && (
            <div className="p-4 rounded-lg space-y-3 animate-fade-in" style={{ border: '1px solid var(--color-accent-border)' }}>
              <label className="block text-xs font-medium theme-text-secondary">{t.templates.importTitle}</label>
              <textarea className="input-field text-sm min-h-[120px] resize-y font-mono" placeholder={t.templates.importPlaceholder}
                value={importMd} onChange={(e) => setImportMd(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={handleImport} className="btn-primary text-xs">{t.templates.import}</button>
                <button onClick={() => setShowImportForm(false)} className="btn-ghost text-xs">{t.sidebar.cancel}</button>
              </div>
            </div>
          )}

          {/* Template list */}
          {templates.length === 0 && !showSaveForm && !showImportForm ? (
            <div className="text-center py-12">
              <p className="text-sm theme-text-muted">{t.templates.noTemplates}</p>
              <p className="text-xs theme-text-muted mt-1">{t.templates.noTemplatesDesc}</p>
            </div>
          ) : templates.map((tmpl) => (
            <div key={tmpl.id} className="p-4 rounded-lg theme-bg-0 theme-hover transition-all" style={{ border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-medium theme-text">{tmpl.name}</h3>
                  {tmpl.description && <p className="text-xs theme-text-muted mt-0.5">{tmpl.description}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setShowUseForm(showUseForm === tmpl.id ? null : tmpl.id)} className="btn-primary text-[10px] py-1 px-2">{t.templates.useTemplate}</button>
                  <button onClick={() => handleExport(tmpl.id)} className="btn-ghost text-[10px] py-1 px-2">{t.templates.export}</button>
                  <button onClick={() => handleDelete(tmpl.id)} className="btn-ghost text-[10px] py-1 px-2 text-red-500 hover:text-red-400">{t.templates.delete}</button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] theme-text-muted">
                <span>{tmpl.stages.length} {t.sidebar.stages}</span>
                <span>{tmpl.stages.reduce((s, st) => s + st.steps.length, 0)} {t.sidebar.steps}</span>
                <span>{new Date(tmpl.createdAt).toLocaleDateString()}</span>
              </div>

              {showUseForm === tmpl.id && (
                <div className="mt-3 flex flex-wrap gap-2 animate-fade-in items-center">
                  <input className="input-field text-sm flex-1 min-w-[120px]" placeholder={t.templates.workingDir}
                    value={useWorkDir} onChange={(e) => setUseWorkDir(e.target.value)} autoFocus />
                  <button type="button" className="btn-ghost text-xs" onClick={async () => { const p = await pickWorkingDirectory(); if (p) setUseWorkDir(p); }}>{t.header.browseFolder}</button>
                  <button onClick={() => handleUseTemplate(tmpl.id)} className="btn-primary text-xs">{t.templates.createPipeline}</button>
                </div>
              )}
            </div>
          ))}
        </div>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold theme-text">{t.templates.title}</h2>
            <p className="text-xs theme-text-muted text-pretty">{t.templates.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowImportForm(true)} className="btn-ghost text-xs">{t.templates.import}</button>
            <button onClick={() => setShowSaveForm(true)} className="btn-ghost text-xs theme-accent-text">{t.templates.saveAsTemplate}</button>
          </div>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center theme-backdrop backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-3xl glass-panel-strong shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="text-sm font-semibold theme-text">{t.templates.title}</h2>
            <p className="text-xs theme-text-muted text-pretty">{t.templates.subtitle}</p>
          </div>
          <ModalCloseButton onClick={close} label={t.stepDetail.close} />
        </div>
        <div className="px-6 pt-4 flex flex-wrap gap-2">
          <button onClick={() => setShowImportForm(true)} className="btn-ghost text-xs">{t.templates.import}</button>
          <button onClick={() => setShowSaveForm(true)} className="btn-ghost text-xs theme-accent-text">{t.templates.saveAsTemplate}</button>
        </div>
        {content}
      </div>
    </div>
  );
}
