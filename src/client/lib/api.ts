import type { PromptMentionsResponse, ActiveExecutionRunPayload } from '@shared/types';

const BASE = '/api';

export async function pickFolderRequest(): Promise<
  { path: string } | { cancelled: true }
> {
  const res = await fetch(`${BASE}/fs/pick-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const body = (await res.json().catch(() => ({}))) as {
    path?: string;
    cancelled?: boolean;
    error?: string;
  };
  if (res.status === 400 && body.cancelled) return { cancelled: true };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return { path: body.path || '' };
}

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getHomePath: () => request<{ path: string }>('/fs/home'),
  pickFolder: pickFolderRequest,
  getPipelines: () => request<any[]>('/pipelines'),
  createPipeline: (name: string, workingDirectory: string) =>
    request<any>('/pipelines', { method: 'POST', body: JSON.stringify({ name, workingDirectory }) }),
  updatePipeline: (id: string, data: Record<string, unknown>) =>
    request<any>(`/pipelines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePipeline: (id: string) =>
    request<any>(`/pipelines/${id}`, { method: 'DELETE' }),
  loadDemo: (id: string) =>
    request<any>(`/pipelines/${id}/demo`, { method: 'POST' }),

  addStage: (pipelineId: string, name: string, executionMode: string) =>
    request<any>(`/pipelines/${pipelineId}/stages`, {
      method: 'POST', body: JSON.stringify({ name, executionMode }),
    }),
  updateStage: (pipelineId: string, stageId: string, data: Record<string, unknown>) =>
    request<any>(`/pipelines/${pipelineId}/stages/${stageId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),
  deleteStage: (pipelineId: string, stageId: string) =>
    request<any>(`/pipelines/${pipelineId}/stages/${stageId}`, { method: 'DELETE' }),

  addStep: (pipelineId: string, stageId: string, data: Record<string, unknown>) =>
    request<any>(`/pipelines/${pipelineId}/stages/${stageId}/steps`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  updateStep: (pipelineId: string, stepId: string, data: Record<string, unknown>) =>
    request<any>(`/pipelines/${pipelineId}/steps/${stepId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),
  deleteStep: (pipelineId: string, stepId: string) =>
    request<any>(`/pipelines/${pipelineId}/steps/${stepId}`, { method: 'DELETE' }),

  runPipeline: (id: string, mode: string, ptySize?: { cols: number; rows: number }) =>
    request<any>(`/execution/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({
        mode,
        ...(ptySize ? { cols: ptySize.cols, rows: ptySize.rows } : {}),
      }),
    }),
  stopPipeline: (id: string) =>
    request<any>(`/execution/${id}/stop`, { method: 'POST' }),
  stopStage: (id: string, stageId: string) =>
    request<any>(`/execution/${id}/stop-stage/${stageId}`, { method: 'POST' }),
  getActiveExecution: () =>
    request<{ runs: ActiveExecutionRunPayload[] }>('/execution/active'),

  generatePipeline: (userPrompt: string, workingDirectory: string, llmConfig?: any) =>
    request<any>('/planner/generate', {
      method: 'POST', body: JSON.stringify({ userPrompt, workingDirectory, llmConfig }),
    }),

  getProfile: () => request<any>('/settings/profile'),
  updateProfile: (data: Record<string, unknown>) =>
    request<any>('/settings/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getLLMConfig: () => request<any>('/settings/llm-config'),
  updateLLMConfig: (data: Record<string, unknown>) =>
    request<any>('/settings/llm-config', { method: 'PUT', body: JSON.stringify(data) }),
  getNotificationSettings: () => request<any>('/settings/notification-settings'),
  updateNotificationSettings: (data: Record<string, unknown>) =>
    request<any>('/settings/notification-settings', { method: 'PUT', body: JSON.stringify(data) }),
  detectEnvironment: () => request<any[]>('/settings/detect'),

  exportPipelineMd: (id: string) =>
    request<{ markdown: string }>(`/pipelines/${id}/export-md`),

  getPromptMentions: (workingDirectory: string) =>
    request<PromptMentionsResponse>(
      `/prompt-mentions?workingDirectory=${encodeURIComponent(workingDirectory)}`
    ),

  getTemplates: () => request<any[]>('/templates'),
  createTemplate: (name: string, description: string, stages: any[]) =>
    request<any>('/templates', { method: 'POST', body: JSON.stringify({ name, description, stages }) }),
  saveAsTemplate: (pipelineId: string, name: string, description: string) =>
    request<any>(`/templates/from-pipeline/${pipelineId}`, { method: 'POST', body: JSON.stringify({ name, description }) }),
  createFromTemplate: (templateId: string, workingDirectory: string, name?: string) =>
    request<any>(`/templates/${templateId}/create-pipeline`, {
      method: 'POST',
      body: JSON.stringify({ workingDirectory, ...(name ? { name } : {}) }),
    }),
  deleteTemplate: (id: string) =>
    request<any>(`/templates/${id}`, { method: 'DELETE' }),
  exportTemplateMd: (id: string) =>
    request<{ markdown: string }>(`/templates/${id}/export-md`),
  importTemplateMd: (markdown: string) =>
    request<any>('/templates/import-md', { method: 'POST', body: JSON.stringify({ markdown }) }),
};
