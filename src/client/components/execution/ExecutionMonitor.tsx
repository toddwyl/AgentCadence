import { useRef, useEffect } from 'react';
import type { Pipeline, StepStatus } from '@shared/types';
import { TOOL_META } from '@shared/types';
import { useAppStore } from '../../store/app-store';

export function ExecutionMonitor({ pipeline }: { pipeline: Pipeline }) {
  const {
    stepStatuses,
    stepOutputs,
    stepRetryRecords,
    stepRetryMaxAttempts,
    isExecuting,
    executingPipelineID,
    selectedStepID,
    selectStep,
    executionError,
    t,
  } = useAppStore();
  const allSteps = pipeline.stages.flatMap((s) => s.steps);
  const completedCount = allSteps.filter((s) => stepStatuses[s.id] === 'completed').length;
  const failedCount = allSteps.filter((s) => stepStatuses[s.id] === 'failed').length;
  const skippedCount = allSteps.filter((s) => stepStatuses[s.id] === 'skipped').length;
  const runningCount = allSteps.filter((s) => stepStatuses[s.id] === 'running').length;
  const doneCount = completedCount + failedCount + skippedCount;
  const progress = allSteps.length > 0 ? doneCount / allSteps.length : 0;
  const selectedOutput = selectedStepID ? stepOutputs[selectedStepID] : null;

  return (
    <div className="flex h-full">
      <div className="w-80 flex flex-col" style={{ borderRight: '1px solid var(--color-border)' }}>
        <div className="p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium theme-text-secondary">{t.execution.pipelineMode}</span>
            <span className="text-xs theme-text-muted">{completedCount}/{allSteps.length} {t.execution.completed}</span>
          </div>
          <div className="h-1.5 theme-bg-0 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-accent-primary to-accent-secondary" style={{ width: `${progress * 100}%` }} /></div>
          <div className="flex gap-3 mt-2 text-[10px]">
            {runningCount > 0 && <span className="flex items-center gap-1 text-status-running"><span className="status-dot bg-status-running animate-pulse" />{runningCount} {t.execution.running}</span>}
            {failedCount > 0 && <span className="flex items-center gap-1 text-status-failed"><span className="status-dot bg-status-failed" />{failedCount} {t.execution.failed}</span>}
            {skippedCount > 0 && <span className="flex items-center gap-1 text-status-skipped"><span className="status-dot bg-status-skipped" />{skippedCount} {t.status.skipped}</span>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {pipeline.stages.map((stage) => (
            <div key={stage.id}>
              <div className="px-4 py-2 text-[10px] font-medium theme-text-muted uppercase tracking-wider theme-bg-0" style={{ opacity: 0.7 }}>{stage.name}</div>
              {stage.steps.map((step) => {
                const status = stepStatuses[step.id] || step.status;
                const meta = TOOL_META[step.tool];
                return (
                  <div key={step.id} onClick={() => selectStep(step.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all ${selectedStepID === step.id ? 'theme-active-bg' : 'theme-hover'}`}>
                    <StatusIcon status={status} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs theme-text-secondary truncate">{step.name}</div>
                      {isExecuting &&
                        executingPipelineID === pipeline.id &&
                        status === 'running' &&
                        stepRetryMaxAttempts[step.id] &&
                        (stepRetryRecords[step.id]?.length ?? 0) > 0 && (
                        <div className="text-[9px] text-amber-500 mt-0.5 truncate">
                          {t.stepDetail.retryInfo
                            .replace('{current}', String(stepRetryRecords[step.id]?.length ?? 0))
                            .replace('{total}', String(stepRetryMaxAttempts[step.id]))}
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: meta.tintColor + '12', color: meta.tintColor }}>{meta.displayName}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {executionError && <div className="p-3 bg-red-500/[0.05]" style={{ borderTop: '1px solid rgba(239,68,68,0.2)' }}><p className="text-xs text-red-500">{executionError}</p></div>}
      </div>
      <div className="flex-1 flex flex-col">
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <svg className="w-4 h-4 theme-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" /></svg>
          <span className="text-xs theme-text-tertiary">{selectedStepID ? allSteps.find((s) => s.id === selectedStepID)?.name || 'Output' : t.execution.selectStep}</span>
        </div>
        <OutputPane output={selectedOutput} noOutputText={t.execution.noOutput} />
      </div>
    </div>
  );
}

function OutputPane({ output, noOutputText }: { output: string | null; noOutputText: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [output]);
  if (!output) return <div className="flex-1 flex items-center justify-center theme-text-muted text-sm">{noOutputText}</div>;
  return <pre className="flex-1 overflow-auto p-5 text-xs font-mono theme-text-secondary leading-relaxed whitespace-pre-wrap break-all">{output}<div ref={bottomRef} /></pre>;
}

function StatusIcon({ status }: { status: StepStatus | string }) {
  if (status === 'running') return <div className="w-5 h-5 flex items-center justify-center"><div className="w-3.5 h-3.5 border-2 border-status-running border-t-transparent rounded-full animate-spin" /></div>;
  if (status === 'completed') return <div className="w-5 h-5 rounded-full bg-status-completed/20 flex items-center justify-center"><svg className="w-3 h-3 text-status-completed" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></div>;
  if (status === 'failed') return <div className="w-5 h-5 rounded-full bg-status-failed/20 flex items-center justify-center"><svg className="w-3 h-3 text-status-failed" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></div>;
  if (status === 'skipped') return <div className="w-5 h-5 rounded-full bg-status-skipped/20 flex items-center justify-center"><svg className="w-3 h-3 text-status-skipped" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.69z" /></svg></div>;
  return <div className="w-5 h-5 rounded-full theme-bg-3" style={{ border: '1px solid var(--color-border)' }} />;
}
