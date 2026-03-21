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
} from '@shared/types';
import { pipelineAllSteps } from '@shared/types';
import { api } from '../lib/api';
import type { Locale, Translations } from '../i18n';
import { getTranslations } from '../i18n';

export type Theme = 'dark' | 'light';

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
  refreshPipelines: () => Promise<void>;

  toggleFlowchart: () => void;
  toggleMonitor: () => void;
  setShowSettings: (v: boolean) => void;
  setShowAutoPlanner: (v: boolean) => void;
  setShowAnalytics: (v: boolean) => void;
  setShowTemplates: (v: boolean) => void;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  pipelines: [],
  selectedPipelineID: null,
  selectedStepID: null,
  stepStatuses: {},
  stepOutputs: {},
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
  llmConfig: { model: 'opus-4.6', customPolicy: '' },
  notificationSettings: {
    isEnabled: false, notifyOnCompleted: true, notifyOnFailed: true,
    notifyOnCancelled: true, playSound: true,
  },
  showSettings: false,
  showAutoPlanner: false,
  showAnalytics: false,
  showTemplates: false,
  theme: (localStorage.getItem('agentflow-theme') as Theme) || 'dark',
  locale: (localStorage.getItem('agentflow-locale') as Locale) || 'zh',
  t: getTranslations((localStorage.getItem('agentflow-locale') as Locale) || 'zh'),

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
    const [pipelines, profile, llmConfig, notifSettings] = await Promise.all([
      api.getPipelines(),
      api.getProfile(),
      api.getLLMConfig(),
      api.getNotificationSettings(),
    ]);
    set({
      pipelines,
      profile,
      llmConfig,
      notificationSettings: notifSettings,
      selectedPipelineID: pipelines.length > 0 ? pipelines[0].id : null,
    });
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
      stepRetryRecords: {},
      stepRetryMaxAttempts: {},
      showMonitor: true,
      showFlowchart: false,
    });
    await api.runPipeline(id, 'pipeline');
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

  handleRunFinished: (_pipelineID, _status, error) => {
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

  refreshPipelines: async () => {
    const pipelines = await api.getPipelines();
    set({ pipelines });
  },

  toggleFlowchart: () => set((s) => ({ showFlowchart: !s.showFlowchart, showMonitor: false })),
  toggleMonitor: () => set((s) => ({ showMonitor: !s.showMonitor, showFlowchart: false })),
  setShowSettings: (v) => set({ showSettings: v }),
  setShowAutoPlanner: (v) => set({ showAutoPlanner: v }),
  setShowAnalytics: (v) => set({ showAnalytics: v }),
  setShowTemplates: (v) => set({ showTemplates: v }),
  setTheme: (theme) => {
    localStorage.setItem('agentflow-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  setLocale: (locale) => {
    localStorage.setItem('agentflow-locale', locale);
    set({ locale, t: getTranslations(locale) });
  },
}));
