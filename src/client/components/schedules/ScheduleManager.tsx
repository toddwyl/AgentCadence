import { useState, useEffect } from 'react';
import type { Schedule, ScheduleRun, Pipeline } from '@shared/types';
import { api } from '../../lib/api';
import { useAppStore } from '../../store/app-store';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { ModalCloseButton } from '../ui/ModalCloseButton';

export function ScheduleManager({
  embedded = false,
  onClose,
}: {
  embedded?: boolean;
  onClose?: () => void;
} = {}) {
  const { t, pipelines } = useAppStore();
  const setShowSchedules = useAppStore((s) => s.setShowSchedules);
  const close = onClose ?? (() => setShowSchedules(false));
  useEscapeToClose(close, !embedded);

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [cronExpression, setCronExpression] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [promptOverride, setPromptOverride] = useState('');
  const [enabled, setEnabled] = useState(true);

  const reload = async () => {
    const data = await api.getSchedules();
    setSchedules(data);
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (selectedId) {
      api.getScheduleRuns(selectedId).then(setRuns).catch(() => setRuns([]));
    }
  }, [selectedId]);

  const resetForm = () => {
    setName(''); setPipelineId(''); setCronExpression('');
    setTimezone('UTC'); setPromptOverride(''); setEnabled(true);
    setEditId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (s: Schedule) => {
    setEditId(s.id);
    setName(s.name);
    setPipelineId(s.pipeline_id);
    setCronExpression(s.cron_expression);
    setTimezone(s.timezone);
    setPromptOverride(s.prompt_override || '');
    setEnabled(s.enabled);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !pipelineId || !cronExpression.trim()) return;
    const data = { name: name.trim(), pipeline_id: pipelineId, cron_expression: cronExpression.trim(), timezone, prompt_override: promptOverride, enabled };
    if (editId) {
      await api.updateSchedule(editId, data);
    } else {
      await api.createSchedule(data);
    }
    setShowForm(false);
    resetForm();
    reload();
  };

  const handleDelete = async (id: string) => {
    await api.deleteSchedule(id);
    if (selectedId === id) { setSelectedId(null); setRuns([]); }
    reload();
  };

  const handleToggle = async (id: string) => {
    await api.toggleSchedule(id);
    reload();
  };

  const pipelineName = (id: string) => pipelines.find((p: Pipeline) => p.id === id)?.name || id;

  const statusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-status-running';
      case 'error': return 'text-red-400';
      default: return 'theme-text-muted';
    }
  };

  const content = (
    <div className="flex-1 overflow-auto">
          {/* Form */}
          {showForm && (
            <div className="mx-6 my-4 p-4 glass-panel space-y-3 animate-fade-in">
              <input className="input-field text-sm w-full" placeholder={t.schedules.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <div>
                <label className="block text-[10px] theme-text-tertiary mb-1">{t.schedules.pipeline}</label>
                <select className="input-field text-sm w-full" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                  <option value="">{t.schedules.selectPipeline}</option>
                  {pipelines.map((p: Pipeline) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] theme-text-tertiary mb-1">{t.schedules.cronExpression}</label>
                  <input className="input-field text-sm w-full font-mono" placeholder={t.schedules.cronPlaceholder} value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[10px] theme-text-tertiary mb-1">{t.schedules.timezone}</label>
                  <input className="input-field text-sm w-full" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] theme-text-tertiary mb-1">{t.schedules.promptOverride}</label>
                <textarea className="input-field text-sm w-full" rows={2} placeholder={t.schedules.promptPlaceholder} value={promptOverride} onChange={(e) => setPromptOverride(e.target.value)} />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs theme-text-secondary">
                  <input type="checkbox" checked={enabled} onChange={() => setEnabled(!enabled)} className="rounded" />
                  {enabled ? t.schedules.enabled : t.schedules.disabled}
                </label>
                <div className="flex gap-2">
                  <button onClick={handleSave} className="btn-primary text-xs">{t.schedules.save}</button>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-ghost text-xs">{t.sidebar.cancel}</button>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          {schedules.length === 0 && !showForm ? (
            <div className="p-12 text-center">
              <p className="text-sm theme-text-secondary">{t.schedules.noSchedules}</p>
              <p className="text-xs theme-text-muted mt-1">{t.schedules.noSchedulesDesc}</p>
            </div>
          ) : (
            <div className="p-6 space-y-2">
              {schedules.map((s) => (
                <div key={s.id} onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${selectedId === s.id ? 'theme-active-bg' : 'theme-hover'}`}
                  style={{ border: selectedId === s.id ? '1px solid var(--color-accent-border)' : '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button onClick={(e) => { e.stopPropagation(); handleToggle(s.id); }}
                        className={`w-8 h-4 rounded-full relative transition-colors ${s.enabled ? 'bg-green-500' : 'bg-gray-600'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${s.enabled ? 'left-4' : 'left-0.5'}`} />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium theme-text truncate">{s.name}</span>
                          <span className={`text-[10px] ${statusColor(s.status)}`}>{s.status}</span>
                        </div>
                        <div className="text-[10px] theme-text-muted truncate">
                          {pipelineName(s.pipeline_id)} · <span className="font-mono">{s.cron_expression}</span> · {s.timezone}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="btn-ghost text-xs p-1" title="Edit">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="btn-ghost text-xs p-1 hover:text-red-500" title="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* Runs panel */}
                  {selectedId === s.id && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <p className="text-[10px] theme-text-muted mb-2">{t.schedules.runs}</p>
                      {runs.length === 0 ? (
                        <p className="text-xs theme-text-muted">{t.schedules.noRuns}</p>
                      ) : (
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {runs.map((r) => (
                            <div key={r.id} className="flex items-center gap-3 text-[11px] py-1">
                              <StatusDot status={r.status} />
                              <span className="theme-text-secondary font-mono">{new Date(r.started_at).toLocaleString()}</span>
                              {r.finished_at && <span className="theme-text-muted">{formatDuration(r.started_at, r.finished_at)}</span>}
                              {r.error && <span className="text-red-400 truncate">{r.error}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold theme-text">{t.schedules.title}</h2>
            <p className="text-[10px] theme-text-muted">{t.schedules.subtitle}</p>
          </div>
          <div>
            <button onClick={openCreate} className="btn-ghost text-xs theme-accent-text">{t.schedules.create}</button>
          </div>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center theme-backdrop backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl glass-panel-strong shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="text-sm font-semibold theme-text">{t.schedules.title}</h2>
            <p className="text-[10px] theme-text-muted">{t.schedules.subtitle}</p>
          </div>
          <ModalCloseButton onClick={close} label={t.stepDetail.close} />
        </div>
        <div className="px-6 pt-4 shrink-0">
          <button onClick={openCreate} className="btn-ghost text-xs theme-accent-text">{t.schedules.create}</button>
        </div>
        {content}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'success' ? 'bg-green-400' : status === 'failed' ? 'bg-red-400' : status === 'running' ? 'bg-blue-400' : 'bg-yellow-400';
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function formatDuration(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
