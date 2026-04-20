import { useState, useEffect } from 'react';
import type { Pipeline } from '../../../domain/pipeline.js';
import type { Webhook, WebhookRun } from '../../../domain/triggers.js';
import { api } from '../../lib/api';
import { useAppStore } from '../../store/app-store';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { ModalCloseButton } from '../ui/ModalCloseButton';

export function WebhookManager({
  embedded = false,
  onClose,
}: {
  embedded?: boolean;
  onClose?: () => void;
} = {}) {
  const { t, pipelines } = useAppStore();
  const setShowWebhooks = useAppStore((s) => s.setShowWebhooks);
  const close = onClose ?? (() => setShowWebhooks(false));
  useEscapeToClose(close, !embedded);

  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<WebhookRun[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fullToken, setFullToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [promptTemplate, setPromptTemplate] = useState('');
  const [timeoutSeconds, setTimeoutSeconds] = useState(3600);
  const [maxConcurrent, setMaxConcurrent] = useState(1);
  const [enabled, setEnabled] = useState(true);

  const reload = async () => {
    const data = await api.getWebhooks();
    setWebhooks(data);
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (selectedId) {
      api.getWebhookRuns(selectedId).then(setRuns).catch(() => setRuns([]));
    }
  }, [selectedId]);

  const resetForm = () => {
    setName(''); setPipelineId(''); setPromptTemplate('');
    setTimeoutSeconds(3600); setMaxConcurrent(1); setEnabled(true);
    setEditId(null); setFullToken(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (w: Webhook) => {
    setEditId(w.id);
    setName(w.name);
    setPipelineId(w.pipeline_id);
    setPromptTemplate(w.prompt_template);
    setTimeoutSeconds(w.timeout_seconds);
    setMaxConcurrent(w.max_concurrent);
    setEnabled(w.enabled);
    setFullToken(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !pipelineId || !promptTemplate.trim()) return;
    const data = { name: name.trim(), pipeline_id: pipelineId, prompt_template: promptTemplate.trim(), timeout_seconds: timeoutSeconds, max_concurrent: maxConcurrent, enabled };
    if (editId) {
      await api.updateWebhook(editId, data);
      setShowForm(false);
      resetForm();
    } else {
      const result = await api.createWebhook(data);
      setShowForm(false);
      resetForm();
      setFullToken(result.token);
    }
    reload();
  };

  const handleDelete = async (id: string) => {
    await api.deleteWebhook(id);
    if (selectedId === id) { setSelectedId(null); setRuns([]); }
    reload();
  };

  const handleToggle = async (id: string) => {
    await api.toggleWebhook(id);
    reload();
  };

  const handleRegenerate = async (id: string) => {
    const result = await api.regenerateWebhookToken(id);
    setFullToken(result.token);
    reload();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const pipelineName = (id: string) => pipelines.find((p: Pipeline) => p.id === id)?.name || id;

  const getCurlExample = (w: Webhook) => {
    const baseUrl = window.location.origin;
    return `curl -X POST ${baseUrl}/api/webhooks/${w.id}/trigger \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "hello"}'`;
  };

  const content = (
    <div className="flex-1 overflow-auto">
          {/* Token display */}
          {fullToken && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 animate-fade-in">
              <p className="text-[10px] text-green-400 mb-1">Token (only shown once):</p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-green-300 break-all flex-1">{fullToken}</code>
                <button onClick={() => copyToClipboard(fullToken)} className="btn-ghost text-xs shrink-0">
                  {copiedToken ? t.webhooks.tokenCopied : t.webhooks.copyToken}
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          {showForm && (
            <div className="mx-6 my-4 p-4 glass-panel space-y-3 animate-fade-in">
              <input className="input-field text-sm w-full" placeholder={t.webhooks.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <div>
                <label className="block text-[10px] theme-text-tertiary mb-1">{t.webhooks.pipeline}</label>
                <select className="input-field text-sm w-full" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                  <option value="">{t.webhooks.selectPipeline}</option>
                  {pipelines.map((p: Pipeline) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] theme-text-tertiary mb-1">{t.webhooks.promptTemplate}</label>
                <textarea className="input-field text-sm w-full font-mono" rows={3} placeholder={t.webhooks.promptPlaceholder} value={promptTemplate} onChange={(e) => setPromptTemplate(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] theme-text-tertiary mb-1">{t.webhooks.timeout}</label>
                  <input type="number" className="input-field text-sm w-full" value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-[10px] theme-text-tertiary mb-1">{t.webhooks.maxConcurrent}</label>
                  <input type="number" className="input-field text-sm w-full" min={1} value={maxConcurrent} onChange={(e) => setMaxConcurrent(Number(e.target.value))} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs theme-text-secondary">
                  <input type="checkbox" checked={enabled} onChange={() => setEnabled(!enabled)} className="rounded" />
                  {enabled ? t.webhooks.enabled : t.webhooks.disabled}
                </label>
                <div className="flex gap-2">
                  <button onClick={handleSave} className="btn-primary text-xs">{t.webhooks.save}</button>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-ghost text-xs">{t.sidebar.cancel}</button>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          {webhooks.length === 0 && !showForm ? (
            <div className="p-12 text-center">
              <p className="text-sm theme-text-secondary">{t.webhooks.noWebhooks}</p>
              <p className="text-xs theme-text-muted mt-1">{t.webhooks.noWebhooksDesc}</p>
            </div>
          ) : (
            <div className="p-6 space-y-2">
              {webhooks.map((w) => (
                <div key={w.id} onClick={() => setSelectedId(selectedId === w.id ? null : w.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${selectedId === w.id ? 'theme-active-bg' : 'theme-hover'}`}
                  style={{ border: selectedId === w.id ? '1px solid var(--color-accent-border)' : '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button onClick={(e) => { e.stopPropagation(); handleToggle(w.id); }}
                        className={`w-8 h-4 rounded-full relative transition-colors ${w.enabled ? 'bg-green-500' : 'bg-gray-600'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${w.enabled ? 'left-4' : 'left-0.5'}`} />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium theme-text truncate">{w.name}</span>
                          <span className={`text-[10px] ${w.status === 'running' ? 'text-status-running' : 'theme-text-muted'}`}>{w.status}</span>
                        </div>
                        <div className="text-[10px] theme-text-muted truncate">
                          {pipelineName(w.pipeline_id)} · Token: {w.token}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); handleRegenerate(w.id); }} className="btn-ghost text-xs p-1" title={t.webhooks.regenerateToken}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openEdit(w); }} className="btn-ghost text-xs p-1" title="Edit">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(w.id); }} className="btn-ghost text-xs p-1 hover:text-red-500" title="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {selectedId === w.id && (
                    <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                      {/* cURL example */}
                      <div>
                        <p className="text-[10px] theme-text-muted mb-1">{t.webhooks.curlExample}</p>
                        <pre className="text-[11px] theme-text-secondary font-mono p-2 rounded bg-black/20 overflow-x-auto">{getCurlExample(w)}</pre>
                      </div>
                      {/* Runs */}
                      <div>
                        <p className="text-[10px] theme-text-muted mb-2">{t.webhooks.runs}</p>
                        {runs.length === 0 ? (
                          <p className="text-xs theme-text-muted">{t.webhooks.noRuns}</p>
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
            <h2 className="text-sm font-semibold theme-text">{t.webhooks.title}</h2>
            <p className="text-[10px] theme-text-muted">{t.webhooks.subtitle}</p>
          </div>
          <div>
            <button onClick={openCreate} className="btn-ghost text-xs theme-accent-text">{t.webhooks.create}</button>
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
            <h2 className="text-sm font-semibold theme-text">{t.webhooks.title}</h2>
            <p className="text-[10px] theme-text-muted">{t.webhooks.subtitle}</p>
          </div>
          <ModalCloseButton onClick={close} label={t.stepDetail.close} />
        </div>
        <div className="px-6 pt-4 shrink-0">
          <button onClick={openCreate} className="btn-ghost text-xs theme-accent-text">{t.webhooks.create}</button>
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
