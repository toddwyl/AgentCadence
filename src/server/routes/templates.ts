import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type {
  Pipeline,
  PipelineTemplate,
  PipelineStage,
  PipelineStep,
} from '../../shared/types.js';
import { loadTemplates, saveTemplates, loadPipelines, savePipelines } from '../services/store.js';

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

  const { workingDirectory } = req.body;
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
    name: template.name,
    stages: newStages,
    workingDirectory,
    isAIGenerated: false,
    createdAt: new Date().toISOString(),
    runHistory: [],
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
  let name = 'Imported Template';
  let description = '';
  const stages: PipelineStage[] = [];
  let currentStage: PipelineStage | null = null;
  let currentStep: Partial<PipelineStep> | null = null;
  let inPromptBlock = false;
  let promptLines: string[] = [];

  for (const line of lines) {
    if (inPromptBlock) {
      if (line.trim() === '```') {
        inPromptBlock = false;
        if (currentStep) currentStep.prompt = promptLines.join('\n');
        promptLines = [];
        continue;
      }
      promptLines.push(line);
      continue;
    }

    if (line.startsWith('# ') && !line.startsWith('## ') && !line.startsWith('### ')) {
      name = line.slice(2).trim();
      continue;
    }

    if (line.startsWith('> ')) {
      description = line.slice(2).trim();
      continue;
    }

    if (line.startsWith('## ')) {
      if (currentStep && currentStage) {
        finalizeStep(currentStep, currentStage);
        currentStep = null;
      }
      const match = line.slice(3).match(/^(.+?)\s*\((\w+)\)\s*$/);
      currentStage = {
        id: uuidv4(),
        name: match ? match[1].trim() : line.slice(3).trim(),
        executionMode: match && match[2] === 'sequential' ? 'sequential' : 'parallel',
        steps: [],
      };
      stages.push(currentStage);
      continue;
    }

    if (line.startsWith('### ') && currentStage) {
      if (currentStep) {
        finalizeStep(currentStep, currentStage);
      }
      currentStep = { name: line.slice(4).trim() };
      continue;
    }

    if (line.startsWith('- **Tool**: ') && currentStep) {
      const val = line.slice(12).trim().toLowerCase();
      if (val === 'codex' || val === 'claude' || val === 'cursor') currentStep.tool = val;
      continue;
    }
    if (line.startsWith('- **Model**: ') && currentStep) {
      currentStep.model = line.slice(13).trim();
      continue;
    }
    if (line.startsWith('- **Command**: ') && currentStep) {
      currentStep.command = line.slice(15).replace(/^`|`$/g, '').trim();
      continue;
    }
    if (line.startsWith('- **Failure Mode**: ') && currentStep) {
      const val = line.slice(20).trim();
      if (val === 'skip' || val === 'retry' || val === 'stop') currentStep.failureMode = val;
      continue;
    }
    if (line.startsWith('- **Retry Count**: ') && currentStep) {
      currentStep.retryCount = parseInt(line.slice(19).trim()) || 3;
      continue;
    }
    if (line.trim() === '```' && currentStep) {
      inPromptBlock = true;
      continue;
    }
  }

  if (currentStep && currentStage) {
    finalizeStep(currentStep, currentStage);
  }

  return {
    id: uuidv4(),
    name,
    description,
    stages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function finalizeStep(step: Partial<PipelineStep>, stage: PipelineStage) {
  stage.steps.push({
    id: uuidv4(),
    name: step.name || 'Unnamed Step',
    prompt: step.prompt || '',
    tool: step.tool || 'codex',
    model: step.model,
    command: step.command,
    dependsOnStepIDs: [],
    failureMode: step.failureMode || 'retry',
    retryCount: step.retryCount ?? 3,
    status: 'pending',
  });
}

export default router;
