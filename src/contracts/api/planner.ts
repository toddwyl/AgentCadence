import type { LLMConfig } from '../../domain/settings.js';

export interface GeneratePipelineRequest {
  userPrompt: string;
  workingDirectory: string;
  llmConfig: LLMConfig;
}
