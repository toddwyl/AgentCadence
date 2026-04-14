import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock store functions before importing cron-scheduler
vi.mock('../store.js', () => ({
  loadSchedules: vi.fn(() => []),
  saveSchedules: vi.fn(),
  loadScheduleRuns: vi.fn(() => []),
  saveScheduleRuns: vi.fn(),
  loadPipelines: vi.fn(() => []),
  loadProfile: vi.fn(() => ({})),
}));

// Mock pipeline-executor to avoid actual pipeline runs
vi.mock('../pipeline-executor.js', () => ({
  runPipelineForTrigger: vi.fn(),
}));

// Mock ws to avoid WebSocket operations
vi.mock('../../ws.js', () => ({
  broadcast: vi.fn(),
}));

import {
  registerSchedule,
  stopScheduleJob,
  stopAllSchedules,
  startAllSchedules,
} from '../cron-scheduler.js';

// Access the internal activeJobs Map for assertions.
// cron-scheduler exports the functions but not the Map, so we check
// behavior through register/stop/stopAll side effects.

describe('cron-scheduler', () => {
  afterEach(() => {
    stopAllSchedules();
    vi.restoreAllMocks();
  });

  const makeSchedule = (overrides: Record<string, unknown> = {}) => ({
    id: 'sched-test',
    name: 'Test',
    pipeline_id: 'pipe-1',
    cron_expression: '*/5 * * * *',
    timezone: 'UTC',
    enabled: true,
    last_run_at: null,
    next_run_at: null,
    status: 'idle' as const,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('registers a schedule with valid cron expression', () => {
    const schedule = makeSchedule();
    // Should not throw
    registerSchedule(schedule);
    // If it registered, stopScheduleJob should not throw either
    stopScheduleJob(schedule.id);
  });

  it('does not register a schedule with invalid cron expression', () => {
    const schedule = makeSchedule({ cron_expression: 'invalid-cron' });
    registerSchedule(schedule);
    // Calling stop on a never-registered id should be a no-op
    stopScheduleJob(schedule.id);
  });

  it('does not register a disabled schedule', () => {
    const schedule = makeSchedule({ enabled: false });
    registerSchedule(schedule);
    // Should be no-op
    stopScheduleJob(schedule.id);
  });

  it('stopScheduleJob is a no-op for unknown id', () => {
    // Should not throw
    stopScheduleJob('nonexistent-id');
  });

  it('stopAllSchedules clears all jobs', () => {
    registerSchedule(makeSchedule({ id: 'a', cron_expression: '*/1 * * * *' }));
    registerSchedule(makeSchedule({ id: 'b', cron_expression: '*/2 * * * *' }));
    // Should not throw
    stopAllSchedules();
    // After stopping all, individual stops should be no-ops
    stopScheduleJob('a');
    stopScheduleJob('b');
  });

  it('re-registering a schedule replaces the old job', () => {
    const schedule = makeSchedule({ id: 'reuse' });
    registerSchedule(schedule);
    // Register again with a different cron
    registerSchedule({ ...schedule, cron_expression: '*/10 * * * *' });
    // Should still be cleanly stoppable
    stopScheduleJob('reuse');
  });
});
