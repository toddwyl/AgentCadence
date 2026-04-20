import type { Pipeline } from '../../domain/pipeline.js';
import {
  runPipelineForTrigger as runPipelineForTriggerViaExecutionService,
  type TriggerResult,
} from './app/execution-service.js';

/**
 * Backward-compatible wrapper around the unified execution service.
 * Kept temporarily while route/service callers are migrated.
 */
export type { TriggerResult };

export async function runPipelineForTrigger(
  pipeline: Pipeline,
  source: 'schedule' | 'webhook' | 'manual'
): Promise<TriggerResult> {
  return runPipelineForTriggerViaExecutionService(pipeline, source);
}
