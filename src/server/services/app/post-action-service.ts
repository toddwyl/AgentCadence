import type {
  PostAction,
  PostActionBinding,
  PostActionRun,
} from '../../../contracts/api/post-actions.js';
import {
  loadPostActionBindings,
  loadPostActionRuns,
  loadPostActions,
} from '../store.js';

export interface PostActionSummary extends PostAction {
  bindingsCount: number;
}

export interface PostActionDetail extends PostAction {
  bindings: PostActionBinding[];
}

export function listPostActions(): PostActionSummary[] {
  const actions = loadPostActions();
  const bindings = loadPostActionBindings();
  return actions.map((action) => ({
    ...action,
    bindingsCount: bindings.filter((binding) => binding.post_action_id === action.id).length,
  }));
}

export function resolvePostActionSelector(selector: string): PostAction | null {
  const actions = loadPostActions();

  const byId = actions.find((action) => action.id === selector);
  if (byId) return byId;

  const exactNameMatches = actions.filter((action) => action.name === selector);
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  if (exactNameMatches.length > 1) {
    throw new Error(`Post-action selector "${selector}" is ambiguous; use an id instead.`);
  }

  const caseInsensitiveMatches = actions.filter(
    (action) => action.name.toLowerCase() === selector.toLowerCase()
  );
  if (caseInsensitiveMatches.length === 1) return caseInsensitiveMatches[0];
  if (caseInsensitiveMatches.length > 1) {
    throw new Error(`Post-action selector "${selector}" is ambiguous; use an id instead.`);
  }

  return null;
}

export function getPostActionDetail(id: string): PostActionDetail | null {
  const action = loadPostActions().find((item) => item.id === id) ?? null;
  if (!action) return null;
  const bindings = loadPostActionBindings().filter((binding) => binding.post_action_id === id);
  return { ...action, bindings };
}

export function listPostActionRuns(id: string, limit = 50): PostActionRun[] {
  return loadPostActionRuns()
    .filter((run) => run.post_action_id === id)
    .sort((a, b) => b.triggered_at.localeCompare(a.triggered_at))
    .slice(0, limit);
}
