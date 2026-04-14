import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Schedule, CreateScheduleRequest, UpdateScheduleRequest } from '../../shared/types.js';
import { loadSchedules, saveSchedules, loadScheduleRuns } from '../services/store.js';
import { registerSchedule, stopScheduleJob } from '../services/cron-scheduler.js';

const router = Router();

// List all schedules
router.get('/', (_req: Request, res: Response) => {
  res.json(loadSchedules());
});

// Get single schedule
router.get('/:id', (req: Request, res: Response) => {
  const schedule = loadSchedules().find((s) => s.id === req.params.id);
  if (!schedule) { res.status(404).json({ error: 'Schedule not found' }); return; }
  res.json(schedule);
});

// Create schedule
router.post('/', (req: Request, res: Response) => {
  const body = req.body as CreateScheduleRequest;
  if (!body.name || !body.pipeline_id || !body.cron_expression) {
    res.status(400).json({ error: 'name, pipeline_id, and cron_expression are required' });
    return;
  }

  const now = new Date().toISOString();
  const schedule: Schedule = {
    id: uuidv4(),
    name: body.name,
    pipeline_id: body.pipeline_id,
    prompt_override: body.prompt_override,
    cron_expression: body.cron_expression,
    timezone: body.timezone || 'UTC',
    enabled: body.enabled ?? true,
    last_run_at: null,
    next_run_at: null,
    status: 'idle',
    created_at: now,
    updated_at: now,
  };

  const schedules = loadSchedules();
  schedules.push(schedule);
  saveSchedules(schedules);

  if (schedule.enabled) registerSchedule(schedule);

  res.status(201).json(schedule);
});

// Update schedule
router.put('/:id', (req: Request, res: Response) => {
  const schedules = loadSchedules();
  const idx = schedules.findIndex((s) => s.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Schedule not found' }); return; }

  const body = req.body as UpdateScheduleRequest;
  const schedule = schedules[idx];

  if (body.name !== undefined) schedule.name = body.name;
  if (body.pipeline_id !== undefined) schedule.pipeline_id = body.pipeline_id;
  if (body.prompt_override !== undefined) schedule.prompt_override = body.prompt_override;
  if (body.cron_expression !== undefined) schedule.cron_expression = body.cron_expression;
  if (body.timezone !== undefined) schedule.timezone = body.timezone;
  if (body.enabled !== undefined) schedule.enabled = body.enabled;
  schedule.updated_at = new Date().toISOString();

  saveSchedules(schedules);

  // Re-register cron job
  if (schedule.enabled) {
    registerSchedule(schedule);
  } else {
    stopScheduleJob(schedule.id);
  }

  res.json(schedule);
});

// Toggle schedule enabled/disabled
router.patch('/:id/toggle', (req: Request, res: Response) => {
  const schedules = loadSchedules();
  const idx = schedules.findIndex((s) => s.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Schedule not found' }); return; }

  schedules[idx].enabled = !schedules[idx].enabled;
  schedules[idx].updated_at = new Date().toISOString();
  saveSchedules(schedules);

  if (schedules[idx].enabled) {
    registerSchedule(schedules[idx]);
  } else {
    stopScheduleJob(schedules[idx].id);
  }

  res.json(schedules[idx]);
});

// Delete schedule
router.delete('/:id', (req: Request, res: Response) => {
  const schedules = loadSchedules();
  const idx = schedules.findIndex((s) => s.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Schedule not found' }); return; }

  stopScheduleJob(req.params.id);
  schedules.splice(idx, 1);
  saveSchedules(schedules);
  res.status(204).end();
});

// List runs for a schedule
router.get('/:id/runs', (req: Request, res: Response) => {
  const runs = loadScheduleRuns()
    .filter((r) => r.schedule_id === req.params.id)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 50);
  res.json(runs);
});

export default router;
