import type { Schedule, ScheduleRun } from '../../../domain/triggers.js';
import { v4 as uuidv4 } from 'uuid';
import { loadSchedules, saveSchedules, loadScheduleRuns, saveScheduleRuns, loadPipelines } from '../store.js';
import { broadcast } from '../../ws.js';
import { runPipelineForTrigger } from './execution-service.js';

export function listSchedules(): Schedule[] {
  return loadSchedules();
}

export function getScheduleById(id: string): Schedule | null {
  return loadSchedules().find((schedule) => schedule.id === id) ?? null;
}

export function resolveScheduleSelector(selector: string): Schedule | null {
  const schedules = loadSchedules();

  const byId = schedules.find((schedule) => schedule.id === selector);
  if (byId) return byId;

  const exactNameMatches = schedules.filter((schedule) => schedule.name === selector);
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  if (exactNameMatches.length > 1) {
    throw new Error(`Schedule selector "${selector}" is ambiguous; use an id instead.`);
  }

  const caseInsensitiveMatches = schedules.filter(
    (schedule) => schedule.name.toLowerCase() === selector.toLowerCase()
  );
  if (caseInsensitiveMatches.length === 1) return caseInsensitiveMatches[0];
  if (caseInsensitiveMatches.length > 1) {
    throw new Error(`Schedule selector "${selector}" is ambiguous; use an id instead.`);
  }

  return null;
}

export async function runScheduleNowByIdOrName(selector: string): Promise<ScheduleRun> {
  const schedule = resolveScheduleSelector(selector);
  if (!schedule) {
    throw new Error(`Schedule "${selector}" not found.`);
  }

  const pipelines = loadPipelines();
  const pipeline = pipelines.find((p) => p.id === schedule.pipeline_id);
  if (!pipeline) {
    throw new Error('Pipeline not found');
  }

  const run: ScheduleRun = {
    id: uuidv4(),
    schedule_id: schedule.id,
    pipeline_run_id: '',
    started_at: new Date().toISOString(),
    finished_at: null,
    status: 'running',
    error: '',
  };

  const runs = loadScheduleRuns();
  runs.push(run);
  saveScheduleRuns(runs);

  const schedules = loadSchedules();
  const idx = schedules.findIndex((s) => s.id === schedule.id);
  if (idx !== -1) {
    schedules[idx].status = 'running';
    schedules[idx].updated_at = new Date().toISOString();
    saveSchedules(schedules);
  }

  broadcast({
    type: 'schedule_run_started',
    payload: { scheduleId: schedule.id, runId: run.id },
  });

  try {
    const result = await runPipelineForTrigger(pipeline, 'schedule');
    run.pipeline_run_id = result.runId;
    run.status = result.success ? 'success' : 'failed';
    run.error = result.error || '';
  } catch (err) {
    run.status = 'failed';
    run.error = (err as Error).message;
  } finally {
    run.finished_at = new Date().toISOString();

    const currentRuns = loadScheduleRuns();
    const runIdx = currentRuns.findIndex((r) => r.id === run.id);
    if (runIdx !== -1) currentRuns[runIdx] = run;
    saveScheduleRuns(currentRuns);

    const currentSchedules = loadSchedules();
    const scheduleIdx = currentSchedules.findIndex((s) => s.id === schedule.id);
    if (scheduleIdx !== -1) {
      currentSchedules[scheduleIdx].last_run_at = new Date().toISOString();
      currentSchedules[scheduleIdx].status = 'idle';
      currentSchedules[scheduleIdx].updated_at = new Date().toISOString();
      saveSchedules(currentSchedules);
    }

    broadcast({
      type: 'schedule_run_finished',
      payload: { scheduleId: schedule.id, runId: run.id, status: run.status, error: run.error },
    });
  }

  return run;
}
