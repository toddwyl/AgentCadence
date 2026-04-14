import { useAppStore } from '../../store/app-store';
import type { Pipeline, PipelineRunRecord } from '@shared/types';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { ModalCloseButton } from '../ui/ModalCloseButton';

export function ModeAnalytics({ embedded = false }: { embedded?: boolean }) {
  const { setShowAnalytics, pipelines, t } = useAppStore();
  const close = () => setShowAnalytics(false);
  useEscapeToClose(close, !embedded);
  const totalPipelines = pipelines.length;
  const totalRuns = pipelines.reduce((sum, p) => sum + p.runHistory.length, 0);

  const allRuns = pipelines.flatMap((p) => p.runHistory);
  const completedRuns = allRuns.filter((r) => r.status === 'completed');
  const successRate = totalRuns > 0 ? Math.round((completedRuns.length / totalRuns) * 100) : 0;

  const durations = allRuns.filter((r) => r.durationMs).map((r) => r.durationMs!);
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  const modelUsage = computeModelUsage(pipelines);
  const retryStats = computeRetryStats(pipelines);

  const content = (
    <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard label={t.analytics.totalPipelines} value={totalPipelines.toString()} />
            <StatCard label={t.analytics.totalRuns} value={totalRuns.toString()} color="theme-accent-text" />
            <StatCard label={t.analytics.avgDuration} value={formatDuration(avgDuration)} color="theme-text-secondary" />
            <StatCard label={t.analytics.successRate} value={`${successRate}%`} color={successRate >= 80 ? 'text-status-completed' : successRate >= 50 ? 'text-amber-400' : 'text-status-failed'} />
          </div>

          {/* Model usage */}
          {modelUsage.length > 0 && (
            <div>
              <h3 className="text-xs font-medium theme-text-secondary mb-3">{t.analytics.modelUsage}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {modelUsage.map((mu) => (
                  <div key={mu.model} className="p-3 rounded-lg theme-bg-0 flex items-center justify-between" style={{ border: '1px solid var(--color-border)' }}>
                    <span className="text-xs theme-text-secondary font-mono">{mu.model || t.analytics.noModel}</span>
                    <span className="text-xs font-bold theme-text">{mu.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Retry statistics */}
          <div>
            <h3 className="text-xs font-medium theme-text-secondary mb-3">{t.analytics.retryStats}</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label={t.analytics.totalRetries} value={retryStats.totalRetries.toString()} color="text-amber-400" />
              <StatCard label={t.analytics.avgRetryPerPipeline} value={retryStats.avgRetryPerPipeline.toFixed(1)} color="text-amber-400" />
            </div>
          </div>

          {/* Pipeline details table */}
          <div>
            <h3 className="text-xs font-medium theme-text-secondary mb-3">{t.analytics.pipelineDetails}</h3>
            <div className="theme-bg-0 rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="theme-text-muted" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th className="px-4 py-2 text-left font-medium">{t.analytics.colPipeline}</th>
                    <th className="px-4 py-2 text-center font-medium">{t.analytics.colStages}</th>
                    <th className="px-4 py-2 text-center font-medium">{t.analytics.colSteps}</th>
                    <th className="px-4 py-2 text-center font-medium">{t.analytics.colRuns}</th>
                    <th className="px-4 py-2 text-center font-medium">{t.analytics.colAvgRetry}</th>
                    <th className="px-4 py-2 text-center font-medium">{t.analytics.colAvgDuration}</th>
                    <th className="px-4 py-2 text-right font-medium">{t.analytics.colLastStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelines.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center theme-text-muted">{t.analytics.noPipelines}</td></tr>
                  ) : pipelines.map((p) => {
                    const lastRun = p.runHistory.length > 0 ? p.runHistory[p.runHistory.length - 1] : null;
                    const stepCount = p.stages.reduce((s, st) => s + st.steps.length, 0);
                    const avgRetry = computePipelineAvgRetry(p);
                    const pipelineDurations = p.runHistory.filter((r) => r.durationMs).map((r) => r.durationMs!);
                    const pipelineAvgDuration = pipelineDurations.length > 0
                      ? Math.round(pipelineDurations.reduce((a, b) => a + b, 0) / pipelineDurations.length) : 0;
                    return (
                      <tr key={p.id} className="theme-hover" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td className="px-4 py-2.5 theme-text-secondary">{p.name}</td>
                        <td className="px-4 py-2.5 text-center theme-text-muted">{p.stages.length}</td>
                        <td className="px-4 py-2.5 text-center theme-text-muted">{stepCount}</td>
                        <td className="px-4 py-2.5 text-center theme-text-muted">{p.runHistory.length}</td>
                        <td className="px-4 py-2.5 text-center theme-text-muted">{avgRetry > 0 ? avgRetry.toFixed(1) : '-'}</td>
                        <td className="px-4 py-2.5 text-center theme-text-muted">{pipelineAvgDuration > 0 ? formatDuration(pipelineAvgDuration) : '-'}</td>
                        <td className="px-4 py-2.5 text-right"><span className={lastRun ? statusColor(lastRun.status) : 'theme-text-muted'}>{lastRun ? (t.status as Record<string, string>)[lastRun.status] || lastRun.status : t.analytics.neverRun}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold theme-text">{t.analytics.title}</h2>
          <p className="text-xs theme-text-muted text-pretty">{t.analytics.subtitle}</p>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center theme-backdrop backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl glass-panel-strong shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="text-sm font-semibold theme-text">{t.analytics.title}</h2>
            <p className="text-xs theme-text-muted text-pretty">{t.analytics.subtitle}</p>
          </div>
          <ModalCloseButton onClick={close} label={t.stepDetail.close} />
        </div>
        {content}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="glass-panel p-3 text-center">
      <div className={`text-lg font-display font-bold ${color || 'theme-text'}`}>{value}</div>
      <div className="text-[10px] theme-text-muted mt-1">{label}</div>
    </div>
  );
}

function statusColor(status: string): string {
  const m: Record<string, string> = { completed: 'text-status-completed', running: 'text-status-running', failed: 'text-status-failed', cancelled: 'text-status-cancelled' };
  return m[status] || 'theme-text-muted';
}

function formatDuration(ms: number): string {
  if (ms === 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = Math.round(secs % 60);
  return `${mins}m${remainSecs}s`;
}

function computeModelUsage(pipelines: Pipeline[]) {
  const counts = new Map<string, number>();
  for (const p of pipelines) {
    for (const stage of p.stages) {
      for (const step of stage.steps) {
        const model = step.model || '';
        counts.set(model, (counts.get(model) || 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count);
}

function computeRetryStats(pipelines: Pipeline[]) {
  let totalRetries = 0;
  for (const p of pipelines) {
    for (const run of p.runHistory) {
      for (const sr of run.stageRuns) {
        for (const stepRun of sr.stepRuns) {
          if (stepRun.retryRecords) {
            totalRetries += stepRun.retryRecords.length;
          }
        }
      }
    }
  }
  const avgRetryPerPipeline = pipelines.length > 0 ? totalRetries / pipelines.length : 0;
  return { totalRetries, avgRetryPerPipeline };
}

function computePipelineAvgRetry(pipeline: Pipeline): number {
  let totalRetries = 0;
  let totalStepRuns = 0;
  for (const run of pipeline.runHistory) {
    for (const sr of run.stageRuns) {
      for (const stepRun of sr.stepRuns) {
        totalStepRuns++;
        if (stepRun.retryRecords) {
          totalRetries += stepRun.retryRecords.length;
        }
      }
    }
  }
  return totalStepRuns > 0 ? totalRetries / totalStepRuns : 0;
}
