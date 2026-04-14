import { v4 as uuidv4 } from 'uuid';
import type { PipelineRunRecord, PostActionRun } from '../../shared/types.js';
import {
  loadPostActions,
  savePostActions,
  loadPostActionBindings,
  loadPostActionRuns,
  savePostActionRuns,
} from './store.js';
import { broadcast } from '../ws.js';

/**
 * After a pipeline run completes, find matching post-action bindings and execute them.
 */
export async function executePostActionsForRun(
  triggerType: 'schedule' | 'webhook' | 'manual',
  pipelineId: string,
  runRecord: PipelineRunRecord
) {
  const actions = loadPostActions();
  const bindings = loadPostActionBindings();
  const runStatus = runRecord.status;

  // Find bindings for this trigger
  const matchingBindings = bindings.filter((b) => {
    if (!b.enabled) return false;
    if (b.trigger_type !== triggerType) return false;
    // trigger_id matches pipeline_id for manual, or schedule/webhook id
    if (b.trigger_on === 'success' && runStatus !== 'completed') return false;
    if (b.trigger_on === 'failure' && runStatus !== 'failed') return false;
    return true;
  });

  for (const binding of matchingBindings) {
    const action = actions.find((a) => a.id === binding.post_action_id);
    if (!action || !action.enabled) continue;

    const run: PostActionRun = {
      id: uuidv4(),
      post_action_id: action.id,
      binding_id: binding.id,
      triggered_at: new Date().toISOString(),
      completed_at: null,
      status: 'retrying',
      status_code: 0,
      response_body: '',
      error: '',
    };

    broadcast({ type: 'post_action_triggered', payload: { actionId: action.id, runId: run.id } });

    const vars: Record<string, string> = {
      'run.status': runRecord.status,
      'run.duration': String(runRecord.durationMs ?? 0),
      'run.error': runRecord.errorMessage ?? '',
      'run.id': runRecord.id,
      'pipeline.id': pipelineId,
    };

    const bodyTemplate = binding.body_override || action.body_template || '';
    const body = interpolateVars(bodyTemplate, vars);

    const headers: Record<string, string> = { ...action.headers };
    applyAuth(headers, action.auth_type, action.auth_config);

    const maxAttempts = Math.max(1, action.retry_count + 1);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), (action.timeout_seconds || 30) * 1000);

        const res = await fetch(action.url, {
          method: action.method,
          headers,
          body: ['GET', 'HEAD'].includes(action.method.toUpperCase()) ? undefined : body,
          signal: controller.signal,
        });
        clearTimeout(timer);

        run.status_code = res.status;
        run.response_body = await res.text().catch(() => '');

        if (res.ok) {
          run.status = 'success';
          break;
        } else {
          run.error = `HTTP ${res.status}`;
          if (attempt >= maxAttempts) run.status = 'failed';
        }
      } catch (err) {
        run.error = (err as Error).message;
        if (attempt >= maxAttempts) run.status = 'failed';
      }
    }

    run.completed_at = new Date().toISOString();

    const runs = loadPostActionRuns();
    runs.push(run);
    savePostActionRuns(runs);

    broadcast({
      type: 'post_action_finished',
      payload: { actionId: action.id, runId: run.id, status: run.status },
    });
  }
}

function interpolateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (full, key: string) => {
    const trimmed = key.trim();
    return Object.prototype.hasOwnProperty.call(vars, trimmed) ? vars[trimmed] : full;
  });
}

function applyAuth(
  headers: Record<string, string>,
  authType: string,
  authConfig: Record<string, string>
) {
  switch (authType) {
    case 'bearer':
      if (authConfig.token) headers['Authorization'] = `Bearer ${authConfig.token}`;
      break;
    case 'basic':
      if (authConfig.username && authConfig.password) {
        const encoded = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
      }
      break;
    case 'header':
      if (authConfig.header_name && authConfig.header_value) {
        headers[authConfig.header_name] = authConfig.header_value;
      }
      break;
  }
}
