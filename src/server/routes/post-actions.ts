import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type {
  PostAction,
  PostActionBinding,
  CreatePostActionRequest,
  CreateBindingRequest,
} from '../../shared/types.js';
import {
  loadPostActions,
  savePostActions,
  loadPostActionBindings,
  savePostActionBindings,
  loadPostActionRuns,
} from '../services/store.js';

const router = Router();

// ---- Post-Actions CRUD ----

router.get('/', (_req: Request, res: Response) => {
  const actions = loadPostActions();
  const bindings = loadPostActionBindings();
  // Enrich with bindings_count
  const enriched = actions.map((a) => ({
    ...a,
    bindings_count: bindings.filter((b) => b.post_action_id === a.id).length,
  }));
  res.json(enriched);
});

router.get('/:id', (req: Request, res: Response) => {
  const action = loadPostActions().find((a) => a.id === req.params.id);
  if (!action) { res.status(404).json({ error: 'Post-action not found' }); return; }
  const bindings = loadPostActionBindings().filter((b) => b.post_action_id === action.id);
  res.json({ ...action, bindings });
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body as CreatePostActionRequest;
  if (!body.name || !body.method || !body.url) {
    res.status(400).json({ error: 'name, method, and url are required' });
    return;
  }

  const action: PostAction = {
    id: uuidv4(),
    name: body.name,
    description: body.description || '',
    method: body.method.toUpperCase(),
    url: body.url,
    headers: body.headers || {},
    body_template: body.body_template || '',
    auth_type: body.auth_type || 'none',
    auth_config: body.auth_config || {},
    timeout_seconds: body.timeout_seconds ?? 30,
    retry_count: body.retry_count ?? 0,
    enabled: body.enabled ?? true,
    created_at: new Date().toISOString(),
  };

  const actions = loadPostActions();
  actions.push(action);
  savePostActions(actions);
  res.status(201).json(action);
});

router.put('/:id', (req: Request, res: Response) => {
  const actions = loadPostActions();
  const idx = actions.findIndex((a) => a.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Post-action not found' }); return; }

  const body = req.body as Partial<CreatePostActionRequest>;
  const action = actions[idx];

  if (body.name !== undefined) action.name = body.name;
  if (body.description !== undefined) action.description = body.description;
  if (body.method !== undefined) action.method = body.method.toUpperCase();
  if (body.url !== undefined) action.url = body.url;
  if (body.headers !== undefined) action.headers = body.headers;
  if (body.body_template !== undefined) action.body_template = body.body_template;
  if (body.auth_type !== undefined) action.auth_type = body.auth_type;
  if (body.auth_config !== undefined) action.auth_config = body.auth_config;
  if (body.timeout_seconds !== undefined) action.timeout_seconds = body.timeout_seconds;
  if (body.retry_count !== undefined) action.retry_count = body.retry_count;
  if (body.enabled !== undefined) action.enabled = body.enabled;

  savePostActions(actions);
  res.json(action);
});

router.delete('/:id', (req: Request, res: Response) => {
  const actions = loadPostActions();
  const idx = actions.findIndex((a) => a.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Post-action not found' }); return; }

  actions.splice(idx, 1);
  savePostActions(actions);

  // Also remove related bindings
  const bindings = loadPostActionBindings().filter((b) => b.post_action_id !== req.params.id);
  savePostActionBindings(bindings);

  res.status(204).end();
});

// Toggle enabled
router.patch('/:id/toggle', (req: Request, res: Response) => {
  const actions = loadPostActions();
  const idx = actions.findIndex((a) => a.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Post-action not found' }); return; }

  actions[idx].enabled = !actions[idx].enabled;
  savePostActions(actions);
  res.json(actions[idx]);
});

// ---- Bindings ----

router.get('/:id/bindings', (req: Request, res: Response) => {
  const bindings = loadPostActionBindings().filter((b) => b.post_action_id === req.params.id);
  res.json(bindings);
});

router.post('/:id/bindings', (req: Request, res: Response) => {
  const actions = loadPostActions();
  if (!actions.find((a) => a.id === req.params.id)) {
    res.status(404).json({ error: 'Post-action not found' });
    return;
  }

  const body = req.body as CreateBindingRequest;
  if (!body.trigger_type || !body.trigger_id) {
    res.status(400).json({ error: 'trigger_type and trigger_id are required' });
    return;
  }

  const binding: PostActionBinding = {
    id: uuidv4(),
    post_action_id: req.params.id,
    trigger_type: body.trigger_type,
    trigger_id: body.trigger_id,
    trigger_on: body.trigger_on || 'any',
    body_override: body.body_override || '',
    enabled: body.enabled ?? true,
    created_at: new Date().toISOString(),
  };

  const bindings = loadPostActionBindings();
  bindings.push(binding);
  savePostActionBindings(bindings);
  res.status(201).json(binding);
});

router.delete('/:id/bindings/:bid', (req: Request, res: Response) => {
  const bindings = loadPostActionBindings();
  const idx = bindings.findIndex(
    (b) => b.post_action_id === req.params.id && b.id === req.params.bid
  );
  if (idx === -1) { res.status(404).json({ error: 'Binding not found' }); return; }

  bindings.splice(idx, 1);
  savePostActionBindings(bindings);
  res.status(204).end();
});

// ---- Runs ----

router.get('/:id/runs', (req: Request, res: Response) => {
  const runs = loadPostActionRuns()
    .filter((r) => r.post_action_id === req.params.id)
    .sort((a, b) => b.triggered_at.localeCompare(a.triggered_at))
    .slice(0, 50);
  res.json(runs);
});

export default router;
