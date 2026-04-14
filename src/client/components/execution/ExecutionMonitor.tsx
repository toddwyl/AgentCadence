import { useEffect, useMemo, useState } from 'react';
import type { Pipeline, PipelineRunRecord, StepStatus } from '@shared/types';
import { safeToolMeta } from '@shared/types';
import { useAppStore } from '../../store/app-store';
import { AgentActivityFeed } from './AgentActivityFeed';
import { TerminalPane } from './TerminalPane';

type OutputRef =
  | { kind: 'live'; stepId: string }
  | { kind: 'record'; runId: string; stepId: string };

function execMonitorTabClass(isActive: boolean): string {
  return `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
    isActive ? 'theme-active-bg text-accent-glow' : 'theme-text-muted theme-hover'
  }`;
}

function outputSubPanelTabClass(isActive: boolean): string {
  return `px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
    isActive ? 'theme-active-bg text-accent-glow' : 'theme-text-muted theme-hover'
  }`;
}

export function ExecutionMonitor({ pipeline }: { pipeline: Pipeline }) {
  const {
    stepStatuses,
    stepOutputs,
    stepAgentFeeds,
    stepRetryRecords,
    stepRetryMaxAttempts,
    isExecuting,
    executingPipelineID,
    selectStep,
    executionError,
    pendingReview,
    respondToReview,
    t,
  } = useAppStore();

  const live = isExecuting && executingPipelineID === pipeline.id;
  const [tab, setTab] = useState<'running' | 'history'>(() => (live ? 'running' : 'history'));
  const [outputRef, setOutputRef] = useState<OutputRef | null>(null);
  const [outputPanel, setOutputPanel] = useState<'activity' | 'raw'>('activity');

  const sortedRuns = useMemo(
    () =>
      [...(pipeline.runHistory ?? [])].sort((a, b) =>
        a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0
      ),
    [pipeline.runHistory]
  );
  const latestRun = sortedRuns[0];
  const allSteps = (pipeline.stages ?? []).flatMap((s) => s.steps ?? []);

  useEffect(() => {
    if (live) {
      setTab('running');
      setOutputRef(null);
      setOutputPanel('activity');
    }
  }, [live]);

  // Auto-select first running step so streaming output is visible immediately
  useEffect(() => {
    if (!live) return;
    if (outputRef?.kind === 'live') return;
    const runningStep = allSteps.find((s) => stepStatuses[s.id] === 'running');
    if (runningStep) {
      setOutputRef({ kind: 'live', stepId: runningStep.id });
      selectStep(runningStep.id);
    }
  }, [allSteps, live, outputRef, selectStep, stepStatuses]);

  // When current step completes, auto-switch to next running step
  useEffect(() => {
    if (!live || !outputRef || outputRef.kind !== 'live') return;
    const currentStatus = stepStatuses[outputRef.stepId];
    if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'skipped') {
      const nextRunning = allSteps.find((s) => stepStatuses[s.id] === 'running');
      if (nextRunning) {
        setOutputRef({ kind: 'live', stepId: nextRunning.id });
        selectStep(nextRunning.id);
      }
    }
  }, [allSteps, live, outputRef, selectStep, stepStatuses]);

  const resolveOutput = (): string | null => {
    if (!outputRef) return null;
    if (outputRef.kind === 'live') return stepOutputs[outputRef.stepId] ?? null;
    const run = pipeline.runHistory.find((r) => r.id === outputRef.runId);
    if (!run) return null;
    for (const sr of run.stageRuns) {
      for (const st of sr.stepRuns) {
        if (st.stepID === outputRef.stepId) return st.output ?? null;
      }
    }
    return null;
  };

  const handleLiveStepClick = (stepId: string) => {
    setOutputRef({ kind: 'live', stepId });
    selectStep(stepId);
  };

  const handleRecordStepClick = (runId: string, stepId: string) => {
    setOutputRef({ kind: 'record', runId, stepId });
    selectStep(stepId);
  };
  const completedCount = allSteps.filter((s) => stepStatuses[s.id] === 'completed').length;
  const failedCount = allSteps.filter((s) => stepStatuses[s.id] === 'failed').length;
  const skippedCount = allSteps.filter((s) => stepStatuses[s.id] === 'skipped').length;
  const runningCount = allSteps.filter((s) => stepStatuses[s.id] === 'running').length;
  const doneCount = completedCount + failedCount + skippedCount;
  const progress = allSteps.length > 0 ? doneCount / allSteps.length : 0;

  const selectedOutput = resolveOutput();
  const headerStepName = outputRef
    ? allSteps.find((s) => s.id === outputRef.stepId)?.name
    : null;

  const selectedStepId = outputRef?.stepId ?? null;
  const activityItems = selectedStepId ? stepAgentFeeds[selectedStepId] ?? [] : [];
  const reviewForStep =
    pendingReview?.pipelineId === pipeline.id &&
    selectedStepId != null &&
    pendingReview.stepId === selectedStepId
      ? pendingReview
      : null;

  let runningSummaryLine = '—';
  if (live) {
    runningSummaryLine = `${completedCount}/${allSteps.length} ${t.execution.completed}`;
  } else if (latestRun) {
    const st = latestRun.status;
    runningSummaryLine = st.charAt(0).toUpperCase() + st.slice(1);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex px-4 pt-3 pb-2 gap-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button
          type="button"
          onClick={() => setTab('running')}
          className={execMonitorTabClass(tab === 'running')}
        >
          {t.execution.runningTab}
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={execMonitorTabClass(tab === 'history')}
        >
          {t.execution.historyTab}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-80 flex flex-col" style={{ borderRight: '1px solid var(--color-border)' }}>
          {tab === 'running' ? (
            <>
              <div className="p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium theme-text-secondary">{t.execution.pipelineMode}</span>
                  <span className="text-xs theme-text-muted">{runningSummaryLine}</span>
                </div>
                {live && (
                  <>
                    <div className="h-1.5 theme-bg-0 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-accent-primary to-accent-secondary"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                    <div className="flex gap-3 mt-2 text-[10px]">
                      {runningCount > 0 && (
                        <span className="flex items-center gap-1 text-status-running">
                          <span className="status-dot bg-status-running animate-pulse" />
                          {runningCount} {t.execution.running}
                        </span>
                      )}
                      {failedCount > 0 && (
                        <span className="flex items-center gap-1 text-status-failed">
                          <span className="status-dot bg-status-failed" />
                          {failedCount} {t.execution.failed}
                        </span>
                      )}
                      {skippedCount > 0 && (
                        <span className="flex items-center gap-1 text-status-skipped">
                          <span className="status-dot bg-status-skipped" />
                          {skippedCount} {t.status.skipped}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {live ? (
                  (pipeline.stages ?? []).map((stage) => (
                    <div key={stage.id}>
                      <div
                        className="px-4 py-2 text-[10px] font-medium theme-text-muted uppercase tracking-wider theme-bg-0"
                        style={{ opacity: 0.7 }}
                      >
                        {stage.name}
                      </div>
                      {(stage.steps ?? []).map((step) => {
                        const status = stepStatuses[step.id] || step.status;
                        const meta = safeToolMeta(step.tool);
                        const sel = outputRef?.kind === 'live' && outputRef.stepId === step.id;
                        return (
                          <div
                            key={step.id}
                            onClick={() => handleLiveStepClick(step.id)}
                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all ${
                              sel ? 'theme-active-bg' : 'theme-hover'
                            }`}
                          >
                            <StatusIcon status={status} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs theme-text-secondary truncate">{step.name}</div>
                              {stepRetryMaxAttempts[step.id] &&
                                (stepRetryRecords[step.id]?.length ?? 0) > 0 && (
                                  <div className="text-[9px] text-amber-500 mt-0.5 truncate">
                                    {t.execution.retryInfo
                                      .replace('{current}', String(stepRetryRecords[step.id]?.length ?? 0))
                                      .replace('{total}', String(stepRetryMaxAttempts[step.id]))}
                                  </div>
                                )}
                            </div>
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: meta.tintColor + '12', color: meta.tintColor }}
                            >
                              {meta.displayName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))
                ) : latestRun ? (
                  <RunRecordStepList
                    pipeline={pipeline}
                    run={latestRun}
                    selectedRef={outputRef}
                    onStepClick={(stepId) => handleRecordStepClick(latestRun.id, stepId)}
                  />
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-sm theme-text-secondary mb-1">{t.execution.noLatestRun}</p>
                    <p className="text-xs theme-text-muted">{t.execution.noLatestRunDesc}</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {sortedRuns.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm theme-text-secondary mb-1">{t.execution.noRunHistory}</p>
                  <p className="text-xs theme-text-muted">{t.execution.noRunHistoryDesc}</p>
                </div>
              ) : (
                sortedRuns.map((run) => (
                  <div key={run.id} className="glass-panel rounded-xl overflow-hidden">
                    <div className="px-3 py-2 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <span className="text-[10px] font-medium theme-text-secondary">{formatRunTime(run.startedAt)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${runStatusClass(run.status)}`}>
                        {run.status}
                      </span>
                      {run.durationMs != null && (
                        <span className="text-[10px] theme-text-muted">
                          {t.execution.duration}: {formatDuration(run.durationMs)}
                        </span>
                      )}
                      {run.errorMessage && (
                        <span className="text-[10px] text-red-400/80 truncate max-w-full">{run.errorMessage}</span>
                      )}
                    </div>
                    <RunRecordStepList
                      pipeline={pipeline}
                      run={run}
                      selectedRef={outputRef}
                      onStepClick={(stepId) => handleRecordStepClick(run.id, stepId)}
                    />
                  </div>
                ))
              )}
            </div>
          )}
          {executionError && tab === 'running' && (
            <div className="p-3 bg-red-500/[0.05]" style={{ borderTop: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-xs text-red-500">{executionError}</p>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {reviewForStep && (
            <div
              className="flex items-center gap-3 px-4 py-2.5 text-xs shrink-0"
              style={{
                backgroundColor: 'rgba(56, 139, 253, 0.1)',
                borderBottom: '1px solid rgba(56, 139, 253, 0.3)',
                color: '#58a6ff',
              }}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <span className="flex-1">
                {t.execution.reviewBanner.replace('{name}', headerStepName ?? reviewForStep.stepId)}
              </span>
              <button
                type="button"
                onClick={() => respondToReview('accept')}
                className="px-3 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor: 'rgba(63, 185, 80, 0.2)',
                  color: '#3fb950',
                  border: '1px solid rgba(63, 185, 80, 0.4)',
                }}
              >
                {t.execution.reviewAccept}
              </button>
              <button
                type="button"
                onClick={() => respondToReview('reject')}
                className="px-3 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor: 'rgba(248, 81, 73, 0.2)',
                  color: '#f85149',
                  border: '1px solid rgba(248, 81, 73, 0.4)',
                }}
              >
                {t.execution.reviewReject}
              </button>
            </div>
          )}
          <div
            className="px-4 py-2.5 flex flex-wrap items-center gap-2 shrink-0"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <svg className="w-4 h-4 theme-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
            <span className="text-xs theme-text-tertiary flex-1 min-w-[8rem]">
              {headerStepName || t.execution.selectStep}
            </span>
            {outputRef?.kind === 'record' && (
              <span className="text-[10px] theme-text-muted">{t.execution.outputFromHistory}</span>
            )}
            <div className="flex gap-1 ml-auto">
              <button
                type="button"
                onClick={() => setOutputPanel('activity')}
                className={outputSubPanelTabClass(outputPanel === 'activity')}
              >
                {t.execution.activityTab}
              </button>
              <button
                type="button"
                onClick={() => setOutputPanel('raw')}
                className={outputSubPanelTabClass(outputPanel === 'raw')}
              >
                {t.execution.rawLogTab}
              </button>
            </div>
            </div>
          {outputPanel === 'activity' ? (
            <AgentActivityFeed
              key={outputRef ? `${outputRef.kind}-${outputRef.stepId}-act` : 'act-none'}
              items={activityItems}
              isLive={live && outputRef?.kind === 'live'}
              noActivityText={t.execution.noActivity}
              labels={{
                thinking: t.execution.labelThinking,
                tool: t.execution.labelTool,
                session: t.execution.labelSession,
                completed: t.execution.labelCompleted,
                failed: t.execution.labelFailed,
                toolPhaseRunning: t.execution.toolPhaseRunning,
                toolPhaseDone: t.execution.toolPhaseDone,
                toolResult: t.execution.toolResult,
                toolGitDiff: t.execution.toolGitDiff,
                todoTitle: t.execution.todoTitle,
              }}
            />
          ) : (
            <TerminalPane
              key={outputRef ? `${outputRef.kind}-${outputRef.stepId}-raw` : 'terminal-none'}
              output={selectedOutput}
              noOutputText={
                outputRef?.kind === 'record' && !selectedOutput ? t.execution.noSavedOutput : t.execution.noOutput
              }
              isLive={live && outputRef?.kind === 'live'}
              suppressReviewBanner
              pendingReview={pendingReview?.pipelineId === pipeline.id ? pendingReview : null}
              respondToReview={respondToReview}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RunRecordStepList({
  pipeline,
  run,
  selectedRef,
  onStepClick,
}: {
  pipeline: Pipeline;
  run: PipelineRunRecord;
  selectedRef: OutputRef | null;
  onStepClick: (stepId: string) => void;
}) {
  return (
    <>
      {run.stageRuns.map((sr) => (
        <div key={sr.id}>
          <div
            className="px-3 py-1.5 text-[10px] font-medium theme-text-muted uppercase tracking-wider theme-bg-0"
            style={{ opacity: 0.7 }}
          >
            {sr.stageName}
          </div>
          {sr.stepRuns.map((st) => {
            const pStep = findPipelineStep(pipeline, st.stepID);
            const meta = pStep ? safeToolMeta(pStep.tool) : safeToolMeta(undefined);
            const sel =
              selectedRef?.kind === 'record' &&
              selectedRef.runId === run.id &&
              selectedRef.stepId === st.stepID;
            return (
              <div
                key={st.id}
                onClick={() => onStepClick(st.stepID)}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-all ${
                  sel ? 'theme-active-bg' : 'theme-hover'
                }`}
              >
                <StatusIcon status={st.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs theme-text-secondary truncate">{st.stepName}</div>
                </div>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: meta.tintColor + '12', color: meta.tintColor }}
                >
                  {meta.displayName}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function findPipelineStep(pipeline: Pipeline, stepId: string) {
  for (const st of pipeline.stages ?? []) {
    const f = (st.steps ?? []).find((s) => s.id === stepId);
    if (f) return f;
  }
  return undefined;
}

function formatRunTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function runStatusClass(status: PipelineRunRecord['status']) {
  if (status === 'completed') return 'bg-emerald-500/15 text-emerald-500';
  if (status === 'failed') return 'bg-red-500/15 text-red-400';
  if (status === 'cancelled') return 'bg-amber-500/15 text-amber-400';
  return 'bg-slate-500/15 theme-text-muted';
}

function StatusIcon({ status }: { status: StepStatus | string }) {
  if (status === 'running')
    return (
      <div className="w-5 h-5 flex items-center justify-center">
        <div className="w-3.5 h-3.5 border-2 border-status-running border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (status === 'completed')
    return (
      <div className="w-5 h-5 rounded-full bg-status-completed/20 flex items-center justify-center">
        <svg className="w-3 h-3 text-status-completed" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
    );
  if (status === 'failed')
    return (
      <div className="w-5 h-5 rounded-full bg-status-failed/20 flex items-center justify-center">
        <svg className="w-3 h-3 text-status-failed" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  if (status === 'skipped')
    return (
      <div className="w-5 h-5 rounded-full bg-status-skipped/20 flex items-center justify-center">
        <svg className="w-3 h-3 text-status-skipped" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.69z" />
        </svg>
      </div>
    );
  return <div className="w-5 h-5 rounded-full theme-bg-3" style={{ border: '1px solid var(--color-border)' }} />;
}
