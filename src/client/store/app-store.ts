import { create } from 'zustand';
import type {
  Pipeline,
  PipelineStep,
  StepStatus,
  CLIProfile,
  LLMConfig,
  PlanningPhase,
  ExecutionNotificationSettings,
  RetryRecord,
  ActiveExecutionRunPayload,
  AgentStreamUiEvent,
  AgentFeedItem,
} from '@shared/types';
import { pipelineAllSteps } from '@shared/types';
import { applyAgentStreamEvent } from '@shared/agent-feed-merge';
import { api } from '../lib/api';
import { sendWSMessage } from '../hooks/useWebSocket';
import type { Locale, Translations } from '../i18n';
import { getTranslations } from '../i18n';

export type Theme = 'dark' | 'light';

function readStoredTheme(): Theme {
  const v = localStorage.getItem('agentcadence-theme');
  return v === 'light' || v === 'dark' ? v : 'dark';
}

function readStoredLocale(): Locale {
  const v = localStorage.getItem('agentcadence-locale');
  return v === 'en' || v === 'zh' ? v : 'zh';
}

interface ProjectGroup {
  workingDirectory: string;
  displayName: string;
  pipelines: Pipeline[];
}

interface AppState {
  pipelines: Pipeline[];
  selectedPipelineID: string | null;
  selectedStepID: string | null;
  stepStatuses: Record<string, StepStatus>;
  stepOutputs: Record<string, string>;
  /** OpenClaw-style merged blocks per step (WebSocket agent_stream_event) */
  stepAgentFeeds: Record<string, AgentFeedItem[]>;
  /** Live retry progress during current run (WebSocket step_retry) */
  stepRetryRecords: Record<string, RetryRecord[]>;
  stepRetryMaxAttempts: Record<string, number>;
  isExecuting: boolean;
  executingPipelineID: string | null;
  executionError: string | null;
  showFlowchart: boolean;
  /** Execution monitor (live run + run history); auto-opens when a run starts */
  showMonitor: boolean;
  isPlanningInProgress: boolean;
  planningError: string | null;
  planningPhase: PlanningPhase | null;
  planningLogs: string;
  profile: CLIProfile | null;
  llmConfig: LLMConfig;
  notificationSettings: ExecutionNotificationSettings;
  showSettings: boolean;
  showAutoPlanner: boolean;
  showAnalytics: boolean;
  showTemplates: boolean;
  theme: Theme;
  locale: Locale;
  t: Translations;
  /** Set when initial API bootstrap fails (e.g. backend not reachable in dev). */
  bootstrapError: string | null;
  /** Pending review request from server */
  pendingReview: { pipelineId: string; stepId: string; workingDirectory: string; changedFiles: string[] } | null;
  /** Last terminal FitAddon cols/rows — sent with run for node-pty sizing (ghostty-web) */
  terminalPtySize: { cols: number; rows: number } | null;

  selectedPipeline: () => Pipeline | undefined;
  selectedStep: () => PipelineStep | undefined;
  projectGroups: () => ProjectGroup[];

  loadInitialData: () => Promise<void>;
  selectPipeline: (id: string | null) => void;
  selectStep: (id: string | null) => void;
  createPipeline: (name: string, workingDirectory: string, templateId?: string | null) => Promise<void>;
  deletePipeline: (id: string) => Promise<void>;
  updatePipeline: (id: string, data: Record<string, unknown>) => Promise<void>;
  addStage: (pipelineId: string, name: string, mode: string) => Promise<void>;
  updateStage: (pipelineId: string, stageId: string, data: Record<string, unknown>) => Promise<void>;
  deleteStage: (pipelineId: string, stageId: string) => Promise<void>;
  addStep: (pipelineId: string, stageId: string, data: Record<string, unknown>) => Promise<void>;
  updateStep: (pipelineId: string, stepId: string, data: Record<string, unknown>) => Promise<void>;
  deleteStep: (pipelineId: string, stepId: string) => Promise<void>;
  loadDemo: (pipelineId: string) => Promise<void>;
  runPipeline: (id: string) => Promise<void>;
  stopPipeline: (id: string) => Promise<void>;
  generatePipeline: (prompt: string, workingDirectory: string) => Promise<void>;

  handleStepStatusChanged: (pipelineID: string, stepID: string, status: StepStatus) => void;
  handleStepOutput: (pipelineID: string, stepID: string, output: string) => void;
  handleAgentStreamEvent: (pipelineID: string, stepID: string, event: AgentStreamUiEvent) => void;
  handleStepRetry: (
    pipelineID: string,
    stepID: string,
    retryRecords: RetryRecord[],
    failedAttempt: number,
    maxAttempts: number
  ) => void;
  handleRunStarted: (pipelineID: string) => void;
  handleRunFinished: (pipelineID: string, status: string, error?: string) => void;
  handlePlanningPhase: (phase: PlanningPhase) => void;
  handlePlanningLog: (chunk: string) => void;
  handlePlanningComplete: (pipeline: Pipeline) => void;
  handlePlanningError: (error: string) => void;
  handleStepReviewRequested: (pipelineId: string, stepId: string, workingDirectory: string, changedFiles: string[]) => void;
  respondToReview: (action: 'accept' | 'reject') => void;
  refreshPipelines: () => Promise<void>;
  hydrateExecutionSnapshot: (runs: ActiveExecutionRunPayload[]) => void;

  toggleFlowchart: () => void;
  toggleMonitor: () => void;
  setShowSettings: (v: boolean) => void;
  setShowAutoPlanner: (v: boolean) => void;
  setShowAnalytics: (v: boolean) => void;
  setShowTemplates: (v: boolean) => void;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  setTerminalPtySize: (size: { cols: number; rows: number } | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  pipelines: [],
  selectedPipelineID: null,
  selectedStepID: null,
  stepStatuses: {},
  stepOutputs: {},
  stepAgentFeeds: {},
  stepRetryRecords: {},
  stepRetryMaxAttempts: {},
  isExecuting: false,
  executingPipelineID: null,
  executionError: null,
  showFlowchart: false,
  showMonitor: false,
  isPlanningInProgress: false,
  planningError: null,
  planningPhase: null,
  planningLogs: '',
  profile: null,
  llmConfig: { model: 'auto', customPolicy: '' },
  notificationSettings: {
    isEnabled: false, notifyOnCompleted: true, notifyOnFailed: true,
    notifyOnCancelled: true, playSound: true,
  },
  showSettings: false,
  showAutoPlanner: false,
  showAnalytics: false,
  showTemplates: false,
  theme: readStoredTheme(),
  locale: readStoredLocale(),
  t: getTranslations(readStoredLocale()),
  bootstrapError: null,
  pendingReview: null,
  terminalPtySize: null,

  selectedPipeline: () => {
    const { pipelines, selectedPipelineID } = get();
    return pipelines.find((p) => p.id === selectedPipelineID);
  },

  selectedStep: () => {
    const pipeline = get().selectedPipeline();
    const stepID = get().selectedStepID;
    if (!pipeline || !stepID) return undefined;
    return pipelineAllSteps(pipeline).find((s) => s.id === stepID);
  },

  projectGroups: () => {
    const { pipelines } = get();
    const grouped: Record<string, Pipeline[]> = {};
    for (const p of pipelines) {
      const key = p.workingDirectory.trim() || '__empty__';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    }
    return Object.entries(grouped)
      .map(([dir, pls]) => ({
        workingDirectory: dir === '__empty__' ? '' : dir,
        displayName: (() => {
          if (dir === '__empty__') return 'No Project';
          const normalized = dir.trim().replace(/[/\\]+$/, '');
          const parts = normalized.split(/[/\\]/).filter(Boolean);
          const leaf = parts[parts.length - 1];
          return leaf || normalized || 'Unknown';
        })(),
        pipelines: pls.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  loadInitialData: async () => {
    set({ bootstrapError: null });
    try {
      const [pipelines, profile, llmConfig, notifSettings, activeExec] = await Promise.all([
        api.getPipelines(),
        api.getProfile(),
        api.getLLMConfig(),
        api.getNotificationSettings(),
        api.getActiveExecution().catch(() => ({ runs: [] as ActiveExecutionRunPayload[] })),
      ]);
      const runs = activeExec.runs ?? [];
      let selectedPipelineID: string | null = null;
      if (pipelines.length > 0) {
        const firstActive = runs[0];
        selectedPipelineID =
          firstActive && pipelines.some((p) => p.id === firstActive.pipelineID)
            ? firstActive.pipelineID
            : pipelines[0].id;
      }
      set({
        pipelines,
        profile,
        llmConfig,
        notificationSettings: notifSettings,
        selectedPipelineID,
        bootstrapError: null,
      });
      if (runs.length > 0) {
        get().hydrateExecutionSnapshot(runs);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ bootstrapError: message });
    }
  },

  selectPipeline: (id) => set({ selectedPipelineID: id, selectedStepID: null, showMonitor: false }),
  selectStep: (id) => set({ selectedStepID: id }),

  createPipeline: async (name, workingDirectory, templateId) => {
    const p = templateId
      ? await api.createFromTemplate(templateId, workingDirectory, name)
      : await api.createPipeline(name, workingDirectory);
    set((s) => ({ pipelines: [...s.pipelines, p], selectedPipelineID: p.id }));
  },

  deletePipeline: async (id) => {
    await api.deletePipeline(id);
    set((s) => {
      const pipelines = s.pipelines.filter((p) => p.id !== id);
      return {
        pipelines,
        selectedPipelineID: s.selectedPipelineID === id
          ? (pipelines[0]?.id || null)
          : s.selectedPipelineID,
      };
    });
  },

  updatePipeline: async (id, data) => {
    const updated = await api.updatePipeline(id, data);
    set((s) => ({
      pipelines: s.pipelines.map((p) => (p.id === id ? updated : p)),
    }));
  },

  addStage: async (pipelineId, name, mode) => {
    await api.addStage(pipelineId, name, mode);
    await get().refreshPipelines();
  },

  updateStage: async (pipelineId, stageId, data) => {
    await api.updateStage(pipelineId, stageId, data);
    await get().refreshPipelines();
  },

  deleteStage: async (pipelineId, stageId) => {
    await api.deleteStage(pipelineId, stageId);
    await get().refreshPipelines();
  },

  addStep: async (pipelineId, stageId, data) => {
    await api.addStep(pipelineId, stageId, data);
    await get().refreshPipelines();
  },

  updateStep: async (pipelineId, stepId, data) => {
    await api.updateStep(pipelineId, stepId, data);
    await get().refreshPipelines();
  },

  deleteStep: async (pipelineId, stepId) => {
    await api.deleteStep(pipelineId, stepId);
    await get().refreshPipelines();
  },

  loadDemo: async (pipelineId) => {
    await api.loadDemo(pipelineId);
    await get().refreshPipelines();
  },

  runPipeline: async (id) => {
    set({
      isExecuting: true,
      executingPipelineID: id,
      executionError: null,
      stepStatuses: {},
      stepOutputs: {},
      stepAgentFeeds: {},
      stepRetryRecords: {},
      stepRetryMaxAttempts: {},
      showMonitor: true,
      showFlowchart: false,
    });
    try {
      const pty = get().terminalPtySize;
      await api.runPipeline(id, 'pipeline', pty ?? undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({
        isExecuting: false,
        executingPipelineID: null,
        executionError: message,
      });
    }
  },

  stopPipeline: async (id) => {
    await api.stopPipeline(id);
  },

  generatePipeline: async (prompt, workingDirectory) => {
    set({
      isPlanningInProgress: true,
      planningError: null,
      planningPhase: null,
      planningLogs: '',
    });
    try {
      await api.generatePipeline(prompt, workingDirectory, get().llmConfig);
    } catch (err) {
      set({ isPlanningInProgress: false, planningError: (err as Error).message });
    }
  },

  handleStepStatusChanged: (_pipelineID, stepID, status) => {
    set((s) => ({
      stepStatuses: { ...s.stepStatuses, [stepID]: status },
    }));
  },

  handleStepOutput: (_pipelineID, stepID, output) => {
    set((s) => ({
      stepOutputs: { ...s.stepOutputs, [stepID]: (s.stepOutputs[stepID] || '') + output },
    }));
  },

  handleAgentStreamEvent: (pipelineID, stepID, event) => {
    set((s) => {
      if (s.executingPipelineID !== pipelineID) return s;
      const prev = s.stepAgentFeeds[stepID] ?? [];
      return {
        stepAgentFeeds: {
          ...s.stepAgentFeeds,
          [stepID]: applyAgentStreamEvent(prev, event),
        },
      };
    });
  },

  handleStepRetry: (_pipelineID, stepID, retryRecords, _failedAttempt, maxAttempts) => {
    set((s) => ({
      stepRetryRecords: { ...s.stepRetryRecords, [stepID]: retryRecords },
      stepRetryMaxAttempts: { ...s.stepRetryMaxAttempts, [stepID]: maxAttempts },
    }));
  },

  handleRunStarted: (pipelineID) => {
    set({
      isExecuting: true,
      executingPipelineID: pipelineID,
    });
  },

  handleRunFinished: (pipelineID, _status, error) => {
    if (get().executingPipelineID !== pipelineID) {
      get().refreshPipelines();
      return;
    }
    set({
      isExecuting: false,
      executingPipelineID: null,
      executionError: error || null,
      stepRetryRecords: {},
      stepRetryMaxAttempts: {},
    });
    get().refreshPipelines();
  },

  handlePlanningPhase: (phase) => {
    set({ planningPhase: phase });
  },

  handlePlanningLog: (chunk) => {
    set((s) => ({
      planningLogs: (s.planningLogs + chunk).slice(-80000),
    }));
  },

  handlePlanningComplete: (pipeline) => {
    set((s) => ({
      isPlanningInProgress: false,
      planningPhase: null,
      pipelines: [...s.pipelines, pipeline],
      selectedPipelineID: pipeline.id,
      showAutoPlanner: false,
    }));
  },

  handlePlanningError: (error) => {
    set({ isPlanningInProgress: false, planningError: error });
  },

  handleStepReviewRequested: (pipelineId, stepId, workingDirectory, changedFiles) => {
    set({ pendingReview: { pipelineId, stepId, workingDirectory, changedFiles } });
  },

  respondToReview: (action) => {
    const review = get().pendingReview;
    if (!review) return;
    sendWSMessage({
      type: 'step_review_response',
      payload: { pipelineId: review.pipelineId, stepId: review.stepId, action },
    });
    set({ pendingReview: null });
  },

  refreshPipelines: async () => {
    const pipelines = await api.getPipelines();
    set({ pipelines });
  },

  hydrateExecutionSnapshot: (runs) => {
    if (!runs.length) return;
    const mergedStatuses: Record<string, StepStatus> = {};
    const mergedOutputs: Record<string, string> = {};
    const mergedFeeds: Record<string, AgentFeedItem[]> = {};
    const mergedRetry: Record<string, RetryRecord[]> = {};
    const mergedMax: Record<string, number> = {};
    for (const r of runs) {
      Object.assign(mergedStatuses, r.stepStatuses);
      Object.assign(mergedOutputs, r.stepOutputs);
      if (r.stepAgentFeeds) {
        for (const [k, v] of Object.entries(r.stepAgentFeeds)) {
          mergedFeeds[k] = v;
        }
      }
      Object.assign(mergedRetry, r.stepRetryRecords);
      Object.assign(mergedMax, r.stepRetryMaxAttempts);
    }
    const sel = get().selectedPipelineID;
    const pick = runs.find((x) => x.pipelineID === sel) ?? runs[0];
    set({
      isExecuting: true,
      executingPipelineID: pick.pipelineID,
      stepStatuses: mergedStatuses,
      stepOutputs: mergedOutputs,
      stepAgentFeeds: mergedFeeds,
      stepRetryRecords: mergedRetry,
      stepRetryMaxAttempts: mergedMax,
      executionError: null,
      showMonitor: true,
    });
  },

  toggleFlowchart: () => set((s) => ({ showFlowchart: !s.showFlowchart, showMonitor: false })),
  toggleMonitor: () => set((s) => ({ showMonitor: !s.showMonitor, showFlowchart: false })),
  setShowSettings: (v) => set({ showSettings: v }),
  setShowAutoPlanner: (v) => set({ showAutoPlanner: v }),
  setShowAnalytics: (v) => set({ showAnalytics: v }),
  setShowTemplates: (v) => set({ showTemplates: v }),
  setTheme: (theme) => {
    localStorage.setItem('agentcadence-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  setLocale: (locale) => {
    localStorage.setItem('agentcadence-locale', locale);
    set({ locale, t: getTranslations(locale) });
  },

  setTerminalPtySize: (size) => set({ terminalPtySize: size }),
}));
