import cron, { type ScheduledTask } from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import type { Schedule, ScheduleRun } from '../../contracts/api/schedules.js';
import { loadSchedules, saveSchedules, loadScheduleRuns, saveScheduleRuns, loadPipelines } from './store.js';
import { broadcast } from '../ws.js';

// Re-use the pipeline execution logic
import { runPipelineForTrigger } from './app/execution-service.js';

const activeJobs = new Map<string, ScheduledTask>();

export function startAllSchedules() {
  const schedules = loadSchedules();
  for (const schedule of schedules) {
    if (schedule.enabled) {
      registerSchedule(schedule);
    }
  }
}

export function registerSchedule(schedule: Schedule) {
  stopScheduleJob(schedule.id);
  if (!schedule.enabled || !cron.validate(schedule.cron_expression)) return;

  const task = cron.schedule(schedule.cron_expression, () => {
    triggerSchedule(schedule.id);
  }, { timezone: schedule.timezone || undefined });

  activeJobs.set(schedule.id, task);
}

export function stopScheduleJob(id: string) {
  const existing = activeJobs.get(id);
  if (existing) {
    existing.stop();
    activeJobs.delete(id);
  }
}

export function stopAllSchedules() {
  for (const [id] of activeJobs) {
    stopScheduleJob(id);
  }
}

async function triggerSchedule(scheduleId: string) {
  const schedules = loadSchedules();
  const schedule = schedules.find((s) => s.id === scheduleId);
  if (!schedule || !schedule.enabled) return;

  const pipelines = loadPipelines();
  const pipeline = pipelines.find((p) => p.id === schedule.pipeline_id);
  if (!pipeline) {
    updateScheduleStatus(scheduleId, 'error');
    return;
  }

  const run: ScheduleRun = {
    id: uuidv4(),
    schedule_id: scheduleId,
    pipeline_run_id: '',
    started_at: new Date().toISOString(),
    finished_at: null,
    status: 'running',
    error: '',
  };

  const runs = loadScheduleRuns();
  runs.push(run);
  saveScheduleRuns(runs);

  updateScheduleStatus(scheduleId, 'running');
  broadcast({
    type: 'schedule_run_started',
    payload: { scheduleId, runId: run.id },
  });

  try {
    const result = await runPipelineForTrigger(pipeline, 'schedule');
    run.pipeline_run_id = result.runId;
    run.status = result.success ? 'success' : 'failed';
    run.error = result.error || '';
  } catch (err) {
    run.status = 'failed';
    run.error = (err as Error).message;
  }

  run.finished_at = new Date().toISOString();

  // Update run record
  const currentRuns = loadScheduleRuns();
  const idx = currentRuns.findIndex((r) => r.id === run.id);
  if (idx !== -1) currentRuns[idx] = run;
  saveScheduleRuns(currentRuns);

  // Update schedule timestamps
  const currentSchedules = loadSchedules();
  const sIdx = currentSchedules.findIndex((s) => s.id === scheduleId);
  if (sIdx !== -1) {
    currentSchedules[sIdx].last_run_at = new Date().toISOString();
    currentSchedules[sIdx].status = 'idle';
    saveSchedules(currentSchedules);
  }

  broadcast({
    type: 'schedule_run_finished',
    payload: { scheduleId, runId: run.id, status: run.status, error: run.error },
  });
}

function updateScheduleStatus(id: string, status: Schedule['status']) {
  const schedules = loadSchedules();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx !== -1) {
    schedules[idx].status = status;
    schedules[idx].updated_at = new Date().toISOString();
    saveSchedules(schedules);
    broadcast({
      type: 'schedule_status_changed',
      payload: { scheduleId: id, status },
    });
  }
}
