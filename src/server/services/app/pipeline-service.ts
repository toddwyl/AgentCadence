import type { Pipeline } from '../../../domain/pipeline.js';
import { loadPipelines } from '../store.js';

export function listPipelines(): Pipeline[] {
  return loadPipelines();
}

export function getPipelineById(id: string): Pipeline | null {
  return loadPipelines().find((pipeline) => pipeline.id === id) ?? null;
}

export function resolvePipelineSelector(selector: string): Pipeline | null {
  const pipelines = loadPipelines();

  const byId = pipelines.find((pipeline) => pipeline.id === selector);
  if (byId) return byId;

  const exactNameMatches = pipelines.filter((pipeline) => pipeline.name === selector);
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  if (exactNameMatches.length > 1) {
    throw new Error(`Pipeline selector "${selector}" is ambiguous; use an id instead.`);
  }

  const caseInsensitiveMatches = pipelines.filter(
    (pipeline) => pipeline.name.toLowerCase() === selector.toLowerCase()
  );
  if (caseInsensitiveMatches.length === 1) return caseInsensitiveMatches[0];
  if (caseInsensitiveMatches.length > 1) {
    throw new Error(`Pipeline selector "${selector}" is ambiguous; use an id instead.`);
  }

  return null;
}
