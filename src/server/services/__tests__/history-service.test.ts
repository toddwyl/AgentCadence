import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveExecutionRunPayload } from '../../../domain/run.js';
import type { Pipeline } from '../../../domain/pipeline.js';

const loadPipelines = vi.fn<() => Pipeline[]>(() => []);
const getActiveRunSnapshots = vi.fn<() => ActiveExecutionRunPayload[]>(() => []);

vi.mock('../store.js', () => ({
  loadPipelines,
}));

vi.mock('../live-run-buffer.js', () => ({
  getActiveRunSnapshots,
}));

describe('history-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges persisted and active runs with newest first', async () => {
    loadPipelines.mockReturnValue([
      {
        id: 'pipe-1',
        name: 'Build',
        stages: [],
        workingDirectory: '/tmp/build',
        isAIGenerated: false,
        createdAt: '2026-04-15T08:00:00.000Z',
        globalVariables: {},
        runHistory: [
          {
            id: 'run-old',
            startedAt: '2026-04-15T09:00:00.000Z',
            endedAt: '2026-04-15T09:03:00.000Z',
            status: 'completed',
            triggerType: 'manual',
            stageRuns: [],
            durationMs: 180000,
          },
        ],
      },
    ]);
    getActiveRunSnapshots.mockReturnValue([
      {
        pipelineID: 'pipe-1',
        pipelineName: 'Build',
        runID: 'run-live',
        triggerType: 'webhook',
        startedAt: '2026-04-15T10:00:00.000Z',
        stepStatuses: {},
        stepOutputs: {},
        stepRetryRecords: {},
        stepRetryMaxAttempts: {},
      },
    ]);

    const { listHistoryRuns } = await import('../app/history-service.js');
    const result = listHistoryRuns();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      runId: 'run-live',
      pipelineId: 'pipe-1',
      status: 'running',
      triggerType: 'webhook',
      isActive: true,
    });
    expect(result[1]).toMatchObject({
      runId: 'run-old',
      status: 'completed',
      triggerType: 'manual',
      isActive: false,
    });
  });

  it('returns step detail from persisted run history', async () => {
    loadPipelines.mockReturnValue([
      {
        id: 'pipe-1',
        name: 'Build',
        stages: [],
        workingDirectory: '/tmp/build',
        isAIGenerated: false,
        createdAt: '2026-04-15T08:00:00.000Z',
        globalVariables: {},
        runHistory: [
          {
            id: 'run-1',
            startedAt: '2026-04-15T09:00:00.000Z',
            status: 'failed',
            triggerType: 'schedule',
            stageRuns: [
              {
                id: 'stage-1',
                stageID: 'stage-1',
                stageName: 'Verify',
                stepRuns: [
                  {
                    id: 'step-run-1',
                    stepID: 'step-1',
                    stepName: 'Harness',
                    status: 'failed',
                    rawOutput: 'boom',
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    getActiveRunSnapshots.mockReturnValue([]);

    const { getHistoryRunStep } = await import('../app/history-service.js');
    const step = getHistoryRunStep('run-1', 'step-1');

    expect(step).toMatchObject({
      stepID: 'step-1',
      stepName: 'Harness',
      status: 'failed',
      rawOutput: 'boom',
    });
  });

  it('reads active run detail and step detail from live snapshots', async () => {
    loadPipelines.mockReturnValue([
      {
        id: 'pipe-1',
        name: 'Build',
        stages: [
          {
            id: 'stage-1',
            name: 'Verify',
            executionMode: 'sequential',
            steps: [
              {
                id: 'step-1',
                name: 'Harness',
                prompt: 'Run harness',
                tool: 'codex',
                dependsOnStepIDs: [],
                failureMode: 'stop',
                retryCount: 0,
                reviewMode: 'auto',
                status: 'pending',
              },
            ],
          },
        ],
        workingDirectory: '/tmp/build',
        isAIGenerated: false,
        createdAt: '2026-04-15T08:00:00.000Z',
        globalVariables: {},
        runHistory: [],
      },
    ]);
    getActiveRunSnapshots.mockReturnValue([
      {
        pipelineID: 'pipe-1',
        pipelineName: 'Build',
        runID: 'run-live',
        triggerType: 'manual',
        startedAt: '2026-04-15T10:00:00.000Z',
        stepStatuses: {
          'step-1': 'running',
        },
        stepOutputs: {
          'step-1': 'still going',
        },
        stepRetryRecords: {
          'step-1': [],
        },
        stepRetryMaxAttempts: {
          'step-1': 2,
        },
      },
    ]);

    const { getHistoryRun, getHistoryRunStep } = await import('../app/history-service.js');
    const detail = getHistoryRun('run-live');
    const step = getHistoryRunStep('run-live', 'step-1');

    expect(detail).toMatchObject({
      pipelineId: 'pipe-1',
      pipelineName: 'Build',
      isActive: true,
      run: expect.objectContaining({
        id: 'run-live',
        status: 'running',
        triggerType: 'manual',
      }),
    });
    expect(step).toMatchObject({
      stepID: 'step-1',
      stepName: 'Harness',
      status: 'running',
      rawOutput: 'still going',
      maxAttempts: 2,
    });
  });
});
