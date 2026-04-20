import type { ToolType } from './pipeline.js';

export type PlanningPhase =
  | 'preparingContext'
  | 'invokingAgentCLI'
  | 'generatingStructure'
  | 'parsingResult'
  | 'creatingPipeline';

export const PLANNING_PHASE_TITLES: Record<PlanningPhase, string> = {
  preparingContext: 'Prepare task context',
  invokingAgentCLI: 'Invoke Agent CLI',
  generatingStructure: 'Generate pipeline structure',
  parsingResult: 'Parse structured Markdown',
  creatingPipeline: 'Create pipeline in app',
};

export interface PlanRequest {
  userPrompt: string;
  workingDirectory: string;
  availableTools: ToolType[];
}

export interface PlanResponse {
  pipelineName: string;
  stages: PlannedStage[];
}

export interface PlannedStage {
  name: string;
  executionMode: string;
  steps: PlannedStep[];
}

export interface PlannedStep {
  name: string;
  prompt: string;
  recommendedTool: string;
  model?: string;
  command?: string;
  dependsOn?: string[];
  failureMode?: 'stop' | 'skip' | 'retry';
}
