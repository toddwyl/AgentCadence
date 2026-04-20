import { v4 as uuidv4 } from 'uuid';
import type {
  Pipeline,
  PipelineStage,
  PipelineStep,
  PipelineTemplate,
} from '../../../domain/pipeline.js';
import {
  parseMarkdownToPlanResult,
  toolFromMarkdownLine,
} from '../../../contracts/planner/pipeline-markdown.js';
import {
  loadPipelines,
  loadTemplates,
  savePipelines,
  saveTemplates,
} from '../store.js';

type CreateTemplateInput = {
  name: string;
  description?: string;
  stages?: PipelineStage[];
};

type CreateTemplateFromPipelineInput = {
  name?: string;
  description?: string;
};

type CreatePipelineFromTemplateInput = {
  workingDirectory: string;
  name?: string;
};

export function listTemplates(): PipelineTemplate[] {
  return loadTemplates();
}

export function getTemplateById(id: string): PipelineTemplate | null {
  return loadTemplates().find((template) => template.id === id) ?? null;
}

export function resolveTemplateSelector(selector: string): PipelineTemplate | null {
  const templates = loadTemplates();

  const byId = templates.find((template) => template.id === selector);
  if (byId) return byId;

  const exactNameMatches = templates.filter((template) => template.name === selector);
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  if (exactNameMatches.length > 1) {
    throw new Error(`Template selector "${selector}" is ambiguous; use an id instead.`);
  }

  const caseInsensitiveMatches = templates.filter(
    (template) => template.name.toLowerCase() === selector.toLowerCase()
  );
  if (caseInsensitiveMatches.length === 1) return caseInsensitiveMatches[0];
  if (caseInsensitiveMatches.length > 1) {
    throw new Error(`Template selector "${selector}" is ambiguous; use an id instead.`);
  }

  return null;
}

export function createTemplate(input: CreateTemplateInput): PipelineTemplate {
  if (!input.name?.trim()) {
    throw new Error('name is required');
  }

  const templates = loadTemplates();
  const template: PipelineTemplate = {
    id: uuidv4(),
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    stages: cloneStagesWithNewIds(input.stages ?? []),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  templates.push(template);
  saveTemplates(templates);
  return template;
}

export function createTemplateFromPipeline(
  pipelineId: string,
  input: CreateTemplateFromPipelineInput = {}
): PipelineTemplate {
  const pipeline = loadPipelines().find((item) => item.id === pipelineId);
  if (!pipeline) throw new Error('Pipeline not found');

  const templates = loadTemplates();
  const template: PipelineTemplate = {
    id: uuidv4(),
    name: (input.name?.trim() || `${pipeline.name} (template)`),
    description: input.description?.trim() ?? '',
    stages: cloneStagesWithNewIds(pipeline.stages),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  templates.push(template);
  saveTemplates(templates);
  return template;
}

export function createPipelineFromTemplate(
  templateId: string,
  input: CreatePipelineFromTemplateInput
): Pipeline {
  if (!input.workingDirectory?.trim()) {
    throw new Error('workingDirectory is required');
  }

  const template = getTemplateById(templateId);
  if (!template) throw new Error('Template not found');

  const pipelines = loadPipelines();
  const pipeline: Pipeline = {
    id: uuidv4(),
    name: input.name?.trim() || template.name,
    stages: cloneStagesWithNewIds(template.stages),
    workingDirectory: input.workingDirectory.trim(),
    isAIGenerated: false,
    createdAt: new Date().toISOString(),
    runHistory: [],
    globalVariables: {},
  };

  pipelines.push(pipeline);
  savePipelines(pipelines);
  return pipeline;
}

export function deleteTemplateById(id: string): boolean {
  const templates = loadTemplates();
  const remaining = templates.filter((template) => template.id !== id);
  if (remaining.length === templates.length) return false;
  saveTemplates(remaining);
  return true;
}

export function exportTemplateMarkdown(templateId: string): string {
  const template = getTemplateById(templateId);
  if (!template) throw new Error('Template not found');
  return templateToMarkdown(template);
}

export function importTemplateMarkdown(markdown: string): PipelineTemplate {
  if (!markdown?.trim()) throw new Error('markdown is required');
  const template = markdownToTemplate(markdown);
  const templates = loadTemplates();
  templates.push(template);
  saveTemplates(templates);
  return template;
}

export function templateToMarkdown(template: PipelineTemplate): string {
  const idToName = new Map<string, string>();
  for (const stage of template.stages) {
    for (const step of stage.steps) {
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
          .filter((name): name is string => Boolean(name));
        if (depNames.length > 0) {
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

export function markdownToTemplate(markdown: string): PipelineTemplate {
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

  for (const stage of plan.stages) {
    const steps: PipelineStep[] = [];
    for (const step of stage.steps) {
      const id = uuidv4();
      nameToId.set(step.name, id);
      steps.push({
        id,
        name: step.name,
        prompt: step.prompt,
        tool: toolFromMarkdownLine(step.recommendedTool) || 'codex',
        model: step.model,
        command: step.command,
        dependsOnStepIDs: [],
        failureMode: step.failureMode ?? 'retry',
        retryCount: 3,
        reviewMode: 'auto',
        status: 'pending',
      });
    }
    stages.push({
      id: uuidv4(),
      name: stage.name,
      executionMode: stage.executionMode === 'sequential' ? 'sequential' : 'parallel',
      steps,
    });
  }

  for (let stageIndex = 0; stageIndex < plan.stages.length; stageIndex++) {
    const stagePlan = plan.stages[stageIndex];
    const stage = stages[stageIndex];
    for (let stepIndex = 0; stepIndex < stagePlan.steps.length; stepIndex++) {
      const stepPlan = stagePlan.steps[stepIndex];
      const step = stage.steps[stepIndex];
      step.dependsOnStepIDs = (stepPlan.dependsOn ?? [])
        .map((name) => nameToId.get(name))
        .filter((id): id is string => Boolean(id));
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

function cloneStagesWithNewIds(stages: PipelineStage[]): PipelineStage[] {
  const stepIdMap = new Map<string, string>();

  const cloned = stages.map((stage) => ({
    id: uuidv4(),
    name: stage.name,
    executionMode: stage.executionMode,
    steps: stage.steps.map((step): PipelineStep => {
      const newId = uuidv4();
      stepIdMap.set(step.id, newId);
      return {
        id: newId,
        name: step.name,
        command: step.command,
        prompt: step.prompt,
        tool: step.tool,
        model: step.model,
        dependsOnStepIDs: [],
        failureMode: step.failureMode,
        retryCount: step.retryCount,
        reviewMode: step.reviewMode ?? 'auto',
        status: 'pending',
      };
    }),
  }));

  for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
    const sourceStage = stages[stageIndex];
    const targetStage = cloned[stageIndex];
    for (let stepIndex = 0; stepIndex < sourceStage.steps.length; stepIndex++) {
      const sourceStep = sourceStage.steps[stepIndex];
      const targetStep = targetStage.steps[stepIndex];
      targetStep.dependsOnStepIDs = (sourceStep.dependsOnStepIDs ?? [])
        .map((id) => stepIdMap.get(id))
        .filter((id): id is string => Boolean(id));
    }
  }

  return cloned;
}
