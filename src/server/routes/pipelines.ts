import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type {
  Pipeline,
  PipelineStage,
  PipelineStep,
  CreatePipelineRequest,
  AddStageRequest,
  AddStepRequest,
  ExecutionMode,
} from '../../shared/types.js';
import { loadPipelines, savePipelines } from '../services/store.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(loadPipelines());
});

router.post('/', (req: Request, res: Response) => {
  const { name, workingDirectory } = req.body as CreatePipelineRequest;
  if (!name || !workingDirectory) {
    res.status(400).json({ error: 'name and workingDirectory are required' });
    return;
  }
  const pipelines = loadPipelines();
  const pipeline: Pipeline = {
    id: uuidv4(),
    name,
    stages: [],
    workingDirectory,
    isAIGenerated: false,
    createdAt: new Date().toISOString(),
    runHistory: [],
  };
  pipelines.push(pipeline);
  savePipelines(pipelines);
  res.status(201).json(pipeline);
});

router.get('/:id', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const p = pipelines.find((p) => p.id === req.params.id);
  if (!p) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(p);
});

router.put('/:id', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const idx = pipelines.findIndex((p) => p.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }
  const { name, workingDirectory } = req.body;
  if (name !== undefined) pipelines[idx].name = name;
  if (workingDirectory !== undefined) pipelines[idx].workingDirectory = workingDirectory;
  savePipelines(pipelines);
  res.json(pipelines[idx]);
});

router.delete('/:id', (req: Request, res: Response) => {
  let pipelines = loadPipelines();
  const before = pipelines.length;
  pipelines = pipelines.filter((p) => p.id !== req.params.id);
  if (pipelines.length === before) { res.status(404).json({ error: 'Not found' }); return; }
  savePipelines(pipelines);
  res.json({ ok: true });
});

router.post('/:id/stages', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const idx = pipelines.findIndex((p) => p.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Pipeline not found' }); return; }
  const { name, executionMode } = req.body as AddStageRequest;
  const stage: PipelineStage = {
    id: uuidv4(),
    name: name || 'New Stage',
    steps: [],
    executionMode: (executionMode as ExecutionMode) || 'parallel',
  };
  pipelines[idx].stages.push(stage);
  savePipelines(pipelines);
  res.status(201).json(stage);
});

router.put('/:pipelineId/stages/:stageId', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const pi = pipelines.findIndex((p) => p.id === req.params.pipelineId);
  if (pi === -1) { res.status(404).json({ error: 'Pipeline not found' }); return; }
  const si = pipelines[pi].stages.findIndex((s) => s.id === req.params.stageId);
  if (si === -1) { res.status(404).json({ error: 'Stage not found' }); return; }
  const { name, executionMode } = req.body;
  if (name !== undefined) pipelines[pi].stages[si].name = name;
  if (executionMode !== undefined) pipelines[pi].stages[si].executionMode = executionMode;
  savePipelines(pipelines);
  res.json(pipelines[pi].stages[si]);
});

router.delete('/:pipelineId/stages/:stageId', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const pi = pipelines.findIndex((p) => p.id === req.params.pipelineId);
  if (pi === -1) { res.status(404).json({ error: 'Pipeline not found' }); return; }
  pipelines[pi].stages = pipelines[pi].stages.filter((s) => s.id !== req.params.stageId);
  savePipelines(pipelines);
  res.json({ ok: true });
});

router.post('/:pipelineId/stages/:stageId/steps', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const pi = pipelines.findIndex((p) => p.id === req.params.pipelineId);
  if (pi === -1) { res.status(404).json({ error: 'Pipeline not found' }); return; }
  const si = pipelines[pi].stages.findIndex((s) => s.id === req.params.stageId);
  if (si === -1) { res.status(404).json({ error: 'Stage not found' }); return; }
  const body = req.body as AddStepRequest;
  const step: PipelineStep = {
    id: uuidv4(),
    name: body.name || 'New Step',
    command: body.command,
    prompt: body.prompt || '',
    tool: body.tool || 'codex',
    model: body.model,
    dependsOnStepIDs: body.dependsOnStepIDs || [],
    failureMode: body.failureMode ?? 'retry',
    retryCount: body.retryCount ?? 3,
    status: 'pending',
  };
  pipelines[pi].stages[si].steps.push(step);
  savePipelines(pipelines);
  res.status(201).json(step);
});

router.put('/:pipelineId/steps/:stepId', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const pi = pipelines.findIndex((p) => p.id === req.params.pipelineId);
  if (pi === -1) { res.status(404).json({ error: 'Pipeline not found' }); return; }
  for (const stage of pipelines[pi].stages) {
    const idx = stage.steps.findIndex((s) => s.id === req.params.stepId);
    if (idx !== -1) {
      const { name, prompt, tool, command, model, dependsOnStepIDs, failureMode, retryCount } = req.body;
      if (name !== undefined) stage.steps[idx].name = name;
      if (prompt !== undefined) stage.steps[idx].prompt = prompt;
      if (tool !== undefined) stage.steps[idx].tool = tool;
      if (command !== undefined) stage.steps[idx].command = command;
      if (model !== undefined) stage.steps[idx].model = model;
      if (dependsOnStepIDs !== undefined) stage.steps[idx].dependsOnStepIDs = dependsOnStepIDs;
      if (failureMode !== undefined) stage.steps[idx].failureMode = failureMode;
      if (retryCount !== undefined) stage.steps[idx].retryCount = retryCount;
      savePipelines(pipelines);
      res.json(stage.steps[idx]);
      return;
    }
  }
  res.status(404).json({ error: 'Step not found' });
});

router.delete('/:pipelineId/steps/:stepId', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const pi = pipelines.findIndex((p) => p.id === req.params.pipelineId);
  if (pi === -1) { res.status(404).json({ error: 'Pipeline not found' }); return; }
  for (const stage of pipelines[pi].stages) {
    const before = stage.steps.length;
    stage.steps = stage.steps.filter((s) => s.id !== req.params.stepId);
    if (stage.steps.length < before) {
      savePipelines(pipelines);
      res.json({ ok: true });
      return;
    }
  }
  res.status(404).json({ error: 'Step not found' });
});

router.get('/:id/export-md', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const p = pipelines.find((p) => p.id === req.params.id);
  if (!p) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ markdown: pipelineToMarkdown(p) });
});

router.post('/:id/demo', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const idx = pipelines.findIndex((p) => p.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }

  const codingA: PipelineStep = {
    id: uuidv4(), name: 'Implement feature A',
    prompt: 'Implement the user login form with email and password fields.',
    tool: 'codex', dependsOnStepIDs: [], failureMode: 'retry', retryCount: 3, status: 'pending',
  };
  const codingB: PipelineStep = {
    id: uuidv4(), name: 'Implement feature B',
    prompt: 'Implement the user registration form with validation.',
    tool: 'codex', dependsOnStepIDs: [], failureMode: 'retry', retryCount: 3, status: 'pending',
  };
  const review: PipelineStep = {
    id: uuidv4(), name: 'Code review',
    prompt: 'Review all changed files for bugs, security issues, and code style.',
    tool: 'cursor', dependsOnStepIDs: [], failureMode: 'retry', retryCount: 3, status: 'pending',
  };
  const verify: PipelineStep = {
    id: uuidv4(), name: 'Verify & fix',
    prompt: 'Run the project, fix any compilation errors or test failures.',
    tool: 'codex', dependsOnStepIDs: [], failureMode: 'retry', retryCount: 3, status: 'pending',
  };

  pipelines[idx].stages = [
    { id: uuidv4(), name: 'Coding', steps: [codingA, codingB], executionMode: 'parallel' },
    { id: uuidv4(), name: 'Review', steps: [review, verify], executionMode: 'sequential' },
  ];
  savePipelines(pipelines);
  res.json(pipelines[idx]);
});

function pipelineToMarkdown(p: Pipeline): string {
  const lines: string[] = [];
  lines.push(`# ${p.name}`);
  lines.push('');
  lines.push(`- **Working Directory**: \`${p.workingDirectory}\``);
  lines.push(`- **Created**: ${p.createdAt}`);
  if (p.isAIGenerated) lines.push('- **AI Generated**: Yes');
  lines.push('');

  for (const stage of p.stages) {
    lines.push(`## ${stage.name} (${stage.executionMode})`);
    lines.push('');
    for (const step of stage.steps) {
      lines.push(`### ${step.name}`);
      lines.push('');
      lines.push(`- **Tool**: ${step.tool}`);
      if (step.model) lines.push(`- **Model**: ${step.model}`);
      if (step.command) lines.push(`- **Command**: \`${step.command}\``);
      lines.push(`- **Failure Mode**: ${step.failureMode || 'retry'}`);
      if ((step.failureMode || 'retry') === 'retry') {
        lines.push(`- **Retry Count**: ${step.retryCount ?? 3}`);
      }
      lines.push('');
      lines.push('**Prompt:**');
      lines.push('');
      lines.push('```');
      lines.push(step.prompt);
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

export default router;
