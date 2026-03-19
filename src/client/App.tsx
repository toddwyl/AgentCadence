import { useEffect, useCallback } from 'react';
import type { WSMessage } from '@shared/types';
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

export default function App() {
  const store = useAppStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', store.theme);
    store.loadInitialData();
  }, []);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    const p = msg.payload as Record<string, any>;
    switch (msg.type) {
      case 'step_status_changed':
        store.handleStepStatusChanged(p.pipelineID, p.stepID, p.status); break;
      case 'step_output':
        store.handleStepOutput(p.pipelineID, p.stepID, p.output); break;
      case 'pipeline_run_started':
        store.handleRunStarted(p.pipelineID); break;
      case 'pipeline_run_finished':
        store.handleRunFinished(p.pipelineID, p.status, p.error); break;
      case 'planning_phase':
        store.handlePlanningPhase(p.phase); break;
      case 'planning_log':
        store.handlePlanningLog(p.chunk); break;
      case 'planning_complete':
        store.handlePlanningComplete(p.pipeline); break;
      case 'planning_error':
        store.handlePlanningError(p.error); break;
    }
  }, []);

  useWebSocket(handleWSMessage);

  const pipeline = store.selectedPipeline();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-hidden">
          {pipeline ? (
            store.showFlowchart ? (
              <FlowchartView pipeline={pipeline} />
            ) : store.isExecuting && store.executingPipelineID === pipeline.id ? (
              <ExecutionMonitor pipeline={pipeline} />
            ) : (
              <PipelineEditor pipeline={pipeline} />
            )
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
      {store.showAutoPlanner && <AutoPlannerDialog />}
      {store.showSettings && <CLIProfileSetup />}
      {store.showAnalytics && <ModeAnalytics />}
      {store.showTemplates && <TemplateManager />}
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
