import { describe, expect, it } from 'vitest';
import {
  flattenStepsWithStage,
  formatRunHeader,
  formatRunSummary,
  formatStageHeader,
  formatStepOutputLines,
  formatStepStatus,
} from '../run-transcript.js';
import type { PipelineRunRecord, StepRunRecord } from '../../../domain/run.js';

describe('run-transcript', () => {
  it('formats run header with pipeline context', () => {
    const lines = formatRunHeader({
      runId: 'run-1',
      pipelineName: 'Release Check',
      pipelineId: 'pipe-1',
      workingDirectory: '/tmp/demo',
      triggerType: 'manual',
    });

    expect(lines.join('\n')).toContain('AgentCadence · Release Check');
    expect(lines.join('\n')).toContain('Run:        run-1');
    expect(lines.join('\n')).toContain('Pipeline:   Release Check (pipe-1)');
    expect(lines.join('\n')).toContain('Workspace:  /tmp/demo');
    expect(lines.join('\n')).toContain('Trigger:    manual');
  });

  it('formats stage headers', () => {
    expect(formatStageHeader('Build')).toEqual(['▸ Stage: Build']);
  });

  it('formats step status lines with glyphs', () => {
    const base: StepRunRecord = {
      id: 'r:s',
      stepID: 's1',
      stepName: 'Compile',
      status: 'completed',
    };

    expect(formatStepStatus(base)).toContain('✓ Compile [s1] ... completed');
    expect(formatStepStatus({ ...base, status: 'running' })).toContain('• Compile [s1] ... running');
    expect(formatStepStatus({ ...base, status: 'failed' })).toContain('✗ Compile [s1] ... failed');
    expect(formatStepStatus({ ...base, status: 'skipped' })).toContain('↷ Compile [s1] ... skipped');
  });

  it('includes retry attempt suffix when totalAttempts > 1', () => {
    const step: StepRunRecord = {
      id: 'r:s',
      stepID: 's1',
      stepName: 'Compile',
      status: 'completed',
      totalAttempts: 2,
      maxAttempts: 3,
    };
    expect(formatStepStatus(step)).toContain('(attempts: 2/3)');
  });

  it('decorates pretty output lines and keeps raw view readable', () => {
    const step: StepRunRecord = {
      id: 'r:s',
      stepID: 's1',
      stepName: 'Compile',
      status: 'running',
    };

    const pretty = formatStepOutputLines(step, 'hello\nworld\n', 'pretty');
    expect(pretty).toEqual(['    │ hello', '    │ world']);

    const raw = formatStepOutputLines(step, 'hello\nworld\n', 'raw');
    expect(raw).toEqual(['[Compile] hello', '[Compile] world']);
  });

  it('summarizes run status with step counts', () => {
    const run: PipelineRunRecord = {
      id: 'run-1',
      startedAt: '2026-04-20T00:00:00.000Z',
      status: 'completed',
      stageRuns: [
        {
          id: 'sr-1',
          stageID: 'stage-1',
          stageName: 'Build',
          stepRuns: [
            { id: 'r:s1', stepID: 's1', stepName: 'A', status: 'completed' },
            { id: 'r:s2', stepID: 's2', stepName: 'B', status: 'failed' },
            { id: 'r:s3', stepID: 's3', stepName: 'C', status: 'skipped' },
          ],
        },
      ],
    };

    const summary = formatRunSummary({
      runId: run.id,
      status: run.status,
      durationMs: 1234,
      stageRuns: run.stageRuns,
    }).join('\n');

    expect(summary).toContain('Run finished: completed in 1s');
    expect(summary).toContain('Steps: 1/3 completed · 1 failed · 1 skipped');
    expect(summary).toContain('History: agentcadence history show run-1');
  });

  it('flattens stages while preserving stage identity', () => {
    const run: PipelineRunRecord = {
      id: 'run-1',
      startedAt: '2026-04-20T00:00:00.000Z',
      status: 'running',
      stageRuns: [
        {
          id: 'sr-1',
          stageID: 'stage-1',
          stageName: 'Build',
          stepRuns: [{ id: 'r:s1', stepID: 's1', stepName: 'A', status: 'running' }],
        },
        {
          id: 'sr-2',
          stageID: 'stage-2',
          stageName: 'Deploy',
          stepRuns: [{ id: 'r:s2', stepID: 's2', stepName: 'B', status: 'pending' }],
        },
      ],
    };

    const flat = flattenStepsWithStage(run);
    expect(flat).toHaveLength(2);
    expect(flat[0].stageName).toBe('Build');
    expect(flat[0].step.stepID).toBe('s1');
    expect(flat[1].stageName).toBe('Deploy');
  });
});
