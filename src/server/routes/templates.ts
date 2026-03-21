import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type {
  Pipeline,
  PipelineTemplate,
  PipelineStage,
  PipelineStep,
} from '../../shared/types.js';
import { loadTemplates, saveTemplates, loadPipelines, savePipelines } from '../services/store.js';
import { parseMarkdownToPlanResult, toolFromMarkdownLine } from '../../shared/pipeline-markdown.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(loadTemplates());
});

router.post('/', (req: Request, res: Response) => {
  const { name, description, stages } = req.body;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const templates = loadTemplates();
  const template: PipelineTemplate = {
    id: uuidv4(),
    name,
    description: description || '',
    stages: stages || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  templates.push(template);
  saveTemplates(templates);
  res.status(201).json(template);
});

router.post('/from-pipeline/:pipelineId', (req: Request, res: Response) => {
  const pipelines = loadPipelines();
  const pipeline = pipelines.find((p) => p.id === req.params.pipelineId);
  if (!pipeline) { res.status(404).json({ error: 'Pipeline not found' }); return; }

  const { name, description } = req.body;
  const templates = loadTemplates();

  const cleanStages: PipelineStage[] = pipeline.stages.map((stage) => ({
    id: uuidv4(),
    name: stage.name,
    executionMode: stage.executionMode,
    steps: stage.steps.map((step): PipelineStep => ({
      id: uuidv4(),
      name: step.name,
      command: step.command,
      prompt: step.prompt,
      tool: step.tool,
      model: step.model,
      dependsOnStepIDs: [],
      failureMode: step.failureMode,
      retryCount: step.retryCount,
      status: 'pending',
    })),
  }));

  const template: PipelineTemplate = {
    id: uuidv4(),
    name: name || `${pipeline.name} (template)`,
    description: description || '',
    stages: cleanStages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  templates.push(template);
  saveTemplates(templates);
  res.status(201).json(template);
});

router.post('/:templateId/create-pipeline', (req: Request, res: Response) => {
  const templates = loadTemplates();
  const template = templates.find((t) => t.id === req.params.templateId);
  if (!template) { res.status(404).json({ error: 'Template not found' }); return; }

  const { workingDirectory, name: pipelineName } = req.body as {
    workingDirectory?: string;
    name?: string;
  };
  if (!workingDirectory) { res.status(400).json({ error: 'workingDirectory is required' }); return; }

  const newStages: PipelineStage[] = template.stages.map((stage) => ({
    id: uuidv4(),
    name: stage.name,
    executionMode: stage.executionMode,
    steps: stage.steps.map((step): PipelineStep => ({
      id: uuidv4(),
      name: step.name,
      command: step.command,
      prompt: step.prompt,
      tool: step.tool,
      model: step.model,
      dependsOnStepIDs: [],
      failureMode: step.failureMode,
      retryCount: step.retryCount,
      status: 'pending',
    })),
  }));

  const pipeline: Pipeline = {
    id: uuidv4(),
    name: (pipelineName && pipelineName.trim()) || template.name,
    stages: newStages,
    workingDirectory,
    isAIGenerated: false,
    createdAt: new Date().toISOString(),
    runHistory: [],
    globalVariables: {},
  };

  const pipelines = loadPipelines();
  pipelines.push(pipeline);
  savePipelines(pipelines);
  res.status(201).json(pipeline);
});

router.delete('/:id', (req: Request, res: Response) => {
  let templates = loadTemplates();
  const before = templates.length;
  templates = templates.filter((t) => t.id !== req.params.id);
  if (templates.length === before) { res.status(404).json({ error: 'Not found' }); return; }
  saveTemplates(templates);
  res.json({ ok: true });
});

router.get('/:id/export-md', (req: Request, res: Response) => {
  const templates = loadTemplates();
  const template = templates.find((t) => t.id === req.params.id);
  if (!template) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ markdown: templateToMarkdown(template) });
});

router.post('/import-md', (req: Request, res: Response) => {
  const { markdown } = req.body;
  if (!markdown) { res.status(400).json({ error: 'markdown is required' }); return; }
  try {
    const template = markdownToTemplate(markdown);
    const templates = loadTemplates();
    templates.push(template);
    saveTemplates(templates);
    res.status(201).json(template);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

function templateToMarkdown(template: PipelineTemplate): string {
  const idToName = new Map<string, string>();
  for (const st of template.stages) {
    for (const step of st.steps) {
      idToName.set(step.id, step.name);
    }
  }

  const lines: string[] = [];
  lines.push(`# ${template.name}`);
  lines.push('');
  if (template.description) {
    lines.push(`> ${template.description}`);
    lines.push('');
  }
  lines.push(`- **Created**: ${template.createdAt}`);
  lines.push(`- **Updated**: ${template.updatedAt}`);
  lines.push('');

  for (const stage of template.stages) {
    lines.push(`## ${stage.name} (${stage.executionMode})`);
    lines.push('');
    for (const step of stage.steps) {
      lines.push(`### ${step.name}`);
      lines.push('');
      lines.push(`- **Tool**: ${step.tool}`);
      if (step.model) lines.push(`- **Model**: ${step.model}`);
      if (step.command) lines.push(`- **Command**: \`${step.command}\``);
      if (step.dependsOnStepIDs?.length) {
        const depNames = step.dependsOnStepIDs
          .map((id) => idToName.get(id))
          .filter((n): n is string => !!n);
        if (depNames.length) {
          lines.push(`- **Depends On**: ${depNames.join(', ')}`);
        }
      }
      lines.push(`- **Failure Mode**: ${step.failureMode}`);
      if (step.failureMode === 'retry') {
        lines.push(`- **Retry Count**: ${step.retryCount}`);
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

function markdownToTemplate(markdown: string): PipelineTemplate {
  const lines = markdown.split('\n');
  let description = '';
  for (const line of lines) {
    if (line.startsWith('> ')) {
      description = line.slice(2).trim();
      break;
    }
  }

  const result = parseMarkdownToPlanResult(markdown, false);
  if (!result.ok) {
    throw new Error(result.errors.join('\n'));
  }

  const plan = result.plan;
  const nameToId = new Map<string, string>();
  const stages: PipelineStage[] = [];

  for (const ps of plan.stages) {
    const steps: PipelineStep[] = [];
    for (const st of ps.steps) {
      const id = uuidv4();
      nameToId.set(st.name, id);
      steps.push({
        id,
        name: st.name,
        prompt: st.prompt,
        tool: toolFromMarkdownLine(st.recommendedTool) || 'codex',
        model: st.model,
        command: st.command,
        dependsOnStepIDs: [],
        failureMode: st.failureMode ?? 'retry',
        retryCount: 3,
        status: 'pending',
      });
    }
    stages.push({
      id: uuidv4(),
      name: ps.name,
      executionMode: ps.executionMode === 'sequential' ? 'sequential' : 'parallel',
      steps,
    });
  }

  for (let si = 0; si < plan.stages.length; si++) {
    const ps = plan.stages[si];
    const stage = stages[si];
    for (let ti = 0; ti < ps.steps.length; ti++) {
      const st = ps.steps[ti];
      const step = stage.steps[ti];
      step.dependsOnStepIDs = (st.dependsOn ?? [])
        .map((n) => nameToId.get(n))
        .filter((x): x is string => !!x);
    }
  }

  return {
    id: uuidv4(),
    name: plan.pipelineName,
    description,
    stages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default router;
