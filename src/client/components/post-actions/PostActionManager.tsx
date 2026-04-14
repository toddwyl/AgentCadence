import { useState, useEffect } from 'react';
import type { PostAction, PostActionBinding, PostActionRun, Pipeline } from '@shared/types';
import { api } from '../../lib/api';
import { useAppStore } from '../../store/app-store';

export function PostActionManager() {
  const { t, pipelines } = useAppStore();
  const setShowPostActions = useAppStore((s) => s.setShowPostActions);

  const [actions, setActions] = useState<(PostAction & { bindings_count?: number })[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<PostActionRun[]>([]);
  const [bindings, setBindings] = useState<PostActionBinding[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showBindingForm, setShowBindingForm] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState('POST');
  const [url, setUrl] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [authType, setAuthType] = useState<string>('none');
  const [authToken, setAuthToken] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authHeaderName, setAuthHeaderName] = useState('');
  const [authHeaderValue, setAuthHeaderValue] = useState('');
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [retryCount, setRetryCount] = useState(0);
  const [enabled, setEnabled] = useState(true);

  // Binding form state
  const [bindTriggerType, setBindTriggerType] = useState<string>('manual');
  const [bindTriggerId, setBindTriggerId] = useState('');
  const [bindTriggerOn, setBindTriggerOn] = useState<string>('any');

  const reload = async () => {
    const data = await api.getPostActions();
    setActions(data);
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (selectedId) {
      api.getPostActionRuns(selectedId).then(setRuns).catch(() => setRuns([]));
      api.getPostActionBindings(selectedId).then(setBindings).catch(() => setBindings([]));
    }
  }, [selectedId]);

  const resetForm = () => {
    setName(''); setDescription(''); setMethod('POST'); setUrl('');
    setBodyTemplate(''); setAuthType('none'); setAuthToken('');
    setAuthUsername(''); setAuthPassword(''); setAuthHeaderName('');
    setAuthHeaderValue(''); setTimeoutSeconds(30); setRetryCount(0);
    setEnabled(true); setEditId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (a: PostAction) => {
    setEditId(a.id);
    setName(a.name);
    setDescription(a.description);
    setMethod(a.method);
    setUrl(a.url);
    setBodyTemplate(a.body_template);
    setAuthType(a.auth_type);
    setAuthToken(a.auth_config?.token || '');
    setAuthUsername(a.auth_config?.username || '');
    setAuthPassword(a.auth_config?.password || '');
    setAuthHeaderName(a.auth_config?.header_name || '');
    setAuthHeaderValue(a.auth_config?.header_value || '');
    setTimeoutSeconds(a.timeout_seconds);
    setRetryCount(a.retry_count);
    setEnabled(a.enabled);
    setShowForm(true);
  };

  const buildAuthConfig = () => {
    switch (authType) {
      case 'bearer': return { token: authToken };
      case 'basic': return { username: authUsername, password: authPassword };
      case 'header': return { header_name: authHeaderName, header_value: authHeaderValue };
      default: return {};
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !method || !url.trim()) return;
    const data = {
      name: name.trim(), description, method, url: url.trim(),
      headers: {}, body_template: bodyTemplate, auth_type: authType,
      auth_config: buildAuthConfig(), timeout_seconds: timeoutSeconds,
      retry_count: retryCount, enabled,
    };
    if (editId) {
      await api.updatePostAction(editId, data);
    } else {
      await api.createPostAction(data);
    }
    setShowForm(false);
    resetForm();
    reload();
  };

  const handleDelete = async (id: string) => {
    await api.deletePostAction(id);
    if (selectedId === id) { setSelectedId(null); setRuns([]); setBindings([]); }
    reload();
  };

  const handleToggle = async (id: string) => {
    await api.togglePostAction(id);
    reload();
  };

  const handleAddBinding = async () => {
    if (!selectedId || !bindTriggerId.trim()) return;
    await api.createPostActionBinding(selectedId, {
      trigger_type: bindTriggerType,
      trigger_id: bindTriggerId.trim(),
      trigger_on: bindTriggerOn,
    });
    setShowBindingForm(false);
    setBindTriggerId('');
    api.getPostActionBindings(selectedId).then(setBindings);
  };

  const handleDeleteBinding = async (bindingId: string) => {
    if (!selectedId) return;
    await api.deletePostActionBinding(selectedId, bindingId);
    api.getPostActionBindings(selectedId).then(setBindings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center theme-backdrop backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl glass-panel-strong shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="text-sm font-semibold theme-text">{t.postActions.title}</h2>
            <p className="text-[10px] theme-text-muted">{t.postActions.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openCreate} className="btn-ghost text-xs text-accent-glow">{t.postActions.create}</button>
            <button onClick={() => setShowPostActions(false)} className="btn-ghost text-xs">{t.stepDetail.close}</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Form */}
          {showForm && (
            <div className="mx-6 my-4 p-4 glass-panel space-y-3 animate-fade-in">
              <div className="grid grid-cols-2 gap-3">
                <input className="input-field text-sm" placeholder={t.postActions.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <input className="input-field text-sm" placeholder={t.postActions.descPlaceholder} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <select className="input-field text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
                </select>
                <input className="input-field text-sm" placeholder={t.postActions.urlPlaceholder} value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] theme-text-tertiary mb-1">{t.postActions.bodyTemplate}</label>
                <textarea className="input-field text-sm w-full font-mono" rows={3} placeholder={t.postActions.bodyPlaceholder} value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] theme-text-tertiary mb-1">{t.postActions.authType}</label>
                  <select className="input-field text-sm w-full" value={authType} onChange={(e) => setAuthType(e.target.value)}>
                    <option value="none">{t.postActions.authNone}</option>
                    <option value="bearer">{t.postActions.authBearer}</option>
                    <option value="basic">{t.postActions.authBasic}</option>
                    <option value="header">{t.postActions.authHeader}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] theme-text-tertiary mb-1">{t.postActions.timeout}</label>
                  <input type="number" className="input-field text-sm w-full" value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-[10px] theme-text-tertiary mb-1">{t.postActions.retryCount}</label>
                  <input type="number" className="input-field text-sm w-full" min={0} value={retryCount} onChange={(e) => setRetryCount(Number(e.target.value))} />
                </div>
              </div>
              {authType === 'bearer' && (
                <input className="input-field text-sm w-full" placeholder="Bearer Token" value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
              )}
              {authType === 'basic' && (
                <div className="grid grid-cols-2 gap-3">
                  <input className="input-field text-sm" placeholder="Username" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} />
                  <input className="input-field text-sm" type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
                </div>
              )}
              {authType === 'header' && (
                <div className="grid grid-cols-2 gap-3">
                  <input className="input-field text-sm" placeholder="Header Name" value={authHeaderName} onChange={(e) => setAuthHeaderName(e.target.value)} />
                  <input className="input-field text-sm" placeholder="Header Value" value={authHeaderValue} onChange={(e) => setAuthHeaderValue(e.target.value)} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs theme-text-secondary">
                  <input type="checkbox" checked={enabled} onChange={() => setEnabled(!enabled)} className="rounded" />
                  {enabled ? t.postActions.enabled : t.postActions.disabled}
                </label>
                <div className="flex gap-2">
                  <button onClick={handleSave} className="btn-primary text-xs">{t.postActions.save}</button>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-ghost text-xs">{t.sidebar.cancel}</button>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          {actions.length === 0 && !showForm ? (
            <div className="p-12 text-center">
              <p className="text-sm theme-text-secondary">{t.postActions.noActions}</p>
              <p className="text-xs theme-text-muted mt-1">{t.postActions.noActionsDesc}</p>
            </div>
          ) : (
            <div className="p-6 space-y-2">
              {actions.map((a) => (
                <div key={a.id} onClick={() => setSelectedId(selectedId === a.id ? null : a.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${selectedId === a.id ? 'theme-active-bg' : 'theme-hover'}`}
                  style={{ border: selectedId === a.id ? '1px solid rgba(99,102,241,0.2)' : '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button onClick={(e) => { e.stopPropagation(); handleToggle(a.id); }}
                        className={`w-8 h-4 rounded-full relative transition-colors ${a.enabled ? 'bg-green-500' : 'bg-gray-600'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${a.enabled ? 'left-4' : 'left-0.5'}`} />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium theme-text truncate">{a.name}</span>
                          <span className="text-[10px] px-1.5 py-px rounded bg-blue-500/10 text-blue-400">{a.method}</span>
                          {a.bindings_count !== undefined && (
                            <span className="text-[10px] theme-text-muted">{a.bindings_count} {t.postActions.bindingsCount}</span>
                          )}
                        </div>
                        <div className="text-[10px] theme-text-muted truncate">{a.url}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(a); }} className="btn-ghost text-xs p-1" title="Edit">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }} className="btn-ghost text-xs p-1 hover:text-red-500" title="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {selectedId === a.id && (
                    <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                      {/* Bindings */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] theme-text-muted">{t.postActions.bindings}</p>
                          <button onClick={(e) => { e.stopPropagation(); setShowBindingForm(!showBindingForm); }} className="btn-ghost text-[10px] text-accent-glow">{t.postActions.addBinding}</button>
                        </div>
                        {showBindingForm && (
                          <div className="p-2 rounded glass-panel space-y-2 mb-2 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                            <div className="grid grid-cols-3 gap-2">
                              <select className="input-field text-xs" value={bindTriggerType} onChange={(e) => setBindTriggerType(e.target.value)}>
                                <option value="manual">Manual</option>
                                <option value="schedule">Schedule</option>
                                <option value="webhook">Webhook</option>
                              </select>
                              <input className="input-field text-xs" placeholder={t.postActions.triggerId} value={bindTriggerId} onChange={(e) => setBindTriggerId(e.target.value)} />
                              <select className="input-field text-xs" value={bindTriggerOn} onChange={(e) => setBindTriggerOn(e.target.value)}>
                                <option value="any">{t.postActions.triggerOnAny}</option>
                                <option value="success">{t.postActions.triggerOnSuccess}</option>
                                <option value="failure">{t.postActions.triggerOnFailure}</option>
                              </select>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={handleAddBinding} className="btn-primary text-[10px]">{t.postActions.save}</button>
                              <button onClick={() => setShowBindingForm(false)} className="btn-ghost text-[10px]">{t.sidebar.cancel}</button>
                            </div>
                          </div>
                        )}
                        {bindings.length === 0 ? (
                          <p className="text-xs theme-text-muted">{t.postActions.noBindings}</p>
                        ) : (
                          <div className="space-y-1">
                            {bindings.map((b) => (
                              <div key={b.id} className="flex items-center justify-between text-[11px] py-1">
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-px rounded bg-purple-500/10 text-purple-400">{b.trigger_type}</span>
                                  <span className="theme-text-secondary font-mono">{b.trigger_id}</span>
                                  <span className="theme-text-muted">on {b.trigger_on}</span>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteBinding(b.id); }} className="btn-ghost text-[10px] hover:text-red-500">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Runs */}
                      <div>
                        <p className="text-[10px] theme-text-muted mb-2">{t.postActions.runs}</p>
                        {runs.length === 0 ? (
                          <p className="text-xs theme-text-muted">{t.postActions.noRuns}</p>
                        ) : (
                          <div className="space-y-1 max-h-40 overflow-auto">
                            {runs.map((r) => (
                              <div key={r.id} className="flex items-center gap-3 text-[11px] py-1">
                                <StatusDot status={r.status} />
                                <span className="theme-text-secondary font-mono">{new Date(r.triggered_at).toLocaleString()}</span>
                                {r.status_code > 0 && <span className="theme-text-muted">HTTP {r.status_code}</span>}
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
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'success' ? 'bg-green-400' : status === 'failed' ? 'bg-red-400' : status === 'retrying' ? 'bg-yellow-400' : 'bg-gray-400';
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
}
