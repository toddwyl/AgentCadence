import { useEffect, useCallback } from 'react';
import type {
  WSMessage,
  RetryRecord,
  ActiveExecutionRunPayload,
  StepStatus,
  AgentStreamUiEvent,
} from '@shared/types';
import { useAppStore } from './store/app-store';
import { useWebSocket } from './hooks/useWebSocket';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { PipelineEditor } from './components/pipeline/PipelineEditor';
import { FlowchartView } from './components/flowchart/FlowchartView';
import { ExecutionMonitor } from './components/execution/ExecutionMonitor';
import { AutoPlannerDialog } from './components/planner/AutoPlannerDialog';
import { CLIProfileSetup } from './components/settings/CLIProfileSetup';
import { ModeAnalytics } from './components/analytics/ModeAnalytics';
import { TemplateManager } from './components/templates/TemplateManager';
import { ScheduleManager } from './components/schedules/ScheduleManager';
import { WebhookManager } from './components/webhooks/WebhookManager';
import { PostActionManager } from './components/post-actions/PostActionManager';

export default function App() {
  const store = useAppStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', store.theme);
    store.loadInitialData();
  }, []);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    const s = useAppStore.getState();
    const p = msg.payload as Record<string, unknown>;
    switch (msg.type) {
      case 'step_status_changed':
        s.handleStepStatusChanged(p.pipelineID as string, p.stepID as string, p.status as StepStatus); break;
      case 'step_output':
        s.handleStepOutput(p.pipelineID as string, p.stepID as string, p.output as string); break;
      case 'step_retry':
        s.handleStepRetry(
          p.pipelineID as string,
          p.stepID as string,
          p.retryRecords as RetryRecord[],
          p.failedAttempt as number,
          p.maxAttempts as number
        );
        break;
      case 'pipeline_run_started':
        s.handleRunStarted(p.pipelineID as string); break;
      case 'pipeline_run_finished':
        s.handleRunFinished(p.pipelineID as string, p.status as string, p.error as string | undefined); break;
      case 'planning_phase':
        s.handlePlanningPhase(p.phase as import('@shared/types').PlanningPhase); break;
      case 'planning_log':
        s.handlePlanningLog(p.chunk as string); break;
      case 'planning_complete':
        s.handlePlanningComplete(p.pipeline as import('@shared/types').Pipeline); break;
      case 'planning_error':
        s.handlePlanningError(p.error as string); break;
      case 'step_review_requested':
        s.handleStepReviewRequested(
          p.pipelineId as string,
          p.stepId as string,
          p.workingDirectory as string,
          p.changedFiles as string[]
        );
        break;
      case 'execution_state_snapshot':
        s.hydrateExecutionSnapshot((p.runs ?? []) as ActiveExecutionRunPayload[]);
        break;
      case 'agent_stream_event':
        s.handleAgentStreamEvent(
          p.pipelineID as string,
          p.stepID as string,
          p.event as AgentStreamUiEvent
        );
        break;
    }
  }, []);

  useWebSocket(handleWSMessage);

  const pipeline = store.selectedPipeline();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {store.bootstrapError && (
        <div
          className="shrink-0 px-4 py-3 text-sm flex flex-wrap items-center gap-3"
          style={{ borderBottom: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)' }}
        >
          <span className="theme-text">{store.t.app.apiUnavailable}</span>
          <code className="text-[11px] theme-text-muted break-all max-w-xl">{store.bootstrapError}</code>
          <button type="button" className="btn-primary text-xs py-1 px-2" onClick={() => store.loadInitialData()}>
            {store.t.app.retryLoad}
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 overflow-hidden">
            {pipeline ? (
              store.showFlowchart ? (
                <FlowchartView pipeline={pipeline} />
              ) : store.showMonitor || (store.isExecuting && store.executingPipelineID === pipeline.id) ? (
                <ExecutionMonitor pipeline={pipeline} />
              ) : (
                <PipelineEditor pipeline={pipeline} />
              )
            ) : (
              <EmptyState />
            )}
          </main>
        </div>
      </div>
      {store.showAutoPlanner && <AutoPlannerDialog />}
      {store.showSettings && <CLIProfileSetup />}
      {store.showAnalytics && <ModeAnalytics />}
      {store.showTemplates && <TemplateManager />}
      {store.showSchedules && <ScheduleManager />}
      {store.showWebhooks && <WebhookManager />}
      {store.showPostActions && <PostActionManager />}
    </div>
  );
}

function EmptyState() {
  const { setShowAutoPlanner, t } = useAppStore();
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-lg animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-accent-glow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
        </div>
        <h2 className="text-2xl font-display font-bold theme-text mb-2">{t.app.welcome}</h2>
        <p className="theme-text-tertiary mb-8">{t.app.welcomeDesc}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => setShowAutoPlanner(true)} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            {t.planner.generate}
          </button>
        </div>
      </div>
    </div>
  );
}
