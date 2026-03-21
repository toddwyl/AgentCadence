/**
 * Canonical pipeline Markdown format (shared by AI planner, import/export, templates).
 */

import type { PlanResponse, PlannedStage, PlannedStep, ToolType } from './types.js';
import { TOOL_TYPES } from './types.js';

const TOOL_SET = new Set<string>(TOOL_TYPES);

function stripANSI(text: string): string {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

/** Extract a pipeline document from agent output (preamble + optional fenced block). */
export function extractPipelineMarkdownDocument(text: string): string | null {
  const cleaned = stripANSI(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!cleaned) return null;

  const fencePattern = /```(?:markdown)?\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fencePattern.exec(cleaned)) !== null) {
    const inner = m[1].trim();
    if (/^#\s+/m.test(inner)) return inner;
  }

  const lines = cleaned.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('# ') && !line.startsWith('## ') && !line.startsWith('### ')) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  return lines.slice(start).join('\n').trim();
}

export function buildPipelineMarkdownFormatInstructions(availableTools: ToolType[]): string {
  const tools = availableTools.join(' | ');
  return `Output format: a single Markdown document ONLY (no JSON, no commentary before or after).

Use this exact structure and field names (case-sensitive labels):

# <pipeline title — short descriptive name>

Optional one line (blockquote) is ignored by the app:
> optional note

## <Stage name> (parallel)
or
## <Stage name> (sequential)

executionMode must be exactly (parallel) or (sequential).

### <Step name>

Each step MUST include these lines in any order (before **Prompt:**):
- **Tool**: ${tools}
- **Model**: <optional model id, or omit this line>
- **Command**: \`<optional shell command; omit for prompt-only steps>\`
- **Depends On**: <comma-separated step names from earlier in the document; omit or leave empty if none>
- **Failure Mode**: retry | skip | stop   (default retry if omitted)
- **Retry Count**: <integer, only if Failure Mode is retry; default 3>

Then the prompt block (required):

**Prompt:**

\`\`\`
<detailed instructions for the agent; non-empty>
\`\`\`

Rules:
- Use one **Prompt:** section per step; the fenced block must use triple backticks.
- Step names must be UNIQUE across the entire document (needed for **Depends On**).
- **Depends On** may only reference steps that appear earlier in the document (top to bottom, all stages).
- Stages contain steps; use (parallel) when steps are independent, (sequential) when order matters within that stage.
- Available tools for **Tool**: ${tools}

Tool guidance:
- codex: implementation, verify/fix, feature work
- cursor: code review
- claude: optional analysis/review alternative`;
}

export type ParsePlanResult =
  | { ok: true; plan: PlanResponse }
  | { ok: false; errors: string[] };

function normalizeTool(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  return TOOL_SET.has(t) ? t : null;
}

/** Normalize a **Tool** line value to a known ToolType (import / export). */
export function toolFromMarkdownLine(raw: string | undefined): ToolType | null {
  const t = normalizeTool(raw);
  return t ? (t as ToolType) : null;
}

function parseDependsOn(line: string): string[] {
  const raw = line.slice(line.indexOf(':') + 1).trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function finalizeStep(
  step: Partial<PlannedStep> & { name?: string },
  stage: PlannedStage,
  strict: boolean
): void {
  const name = step.name?.trim();
  if (!name) return;

  const rawTool = step.recommendedTool?.trim() ?? '';
  const normalizedTool = normalizeTool(rawTool);
  const recommendedTool = strict
    ? rawTool
    : (normalizedTool || 'codex');

  const prompt = (step.prompt ?? '').trim();

  let failureMode = step.failureMode;
  if (failureMode && !['stop', 'skip', 'retry'].includes(failureMode)) {
    failureMode = 'retry';
  }

  stage.steps.push({
    name,
    prompt,
    recommendedTool,
    model: step.model?.trim() || undefined,
    command: step.command?.trim() || undefined,
    dependsOn: step.dependsOn?.length ? step.dependsOn : undefined,
    failureMode: failureMode ?? 'retry',
  });
}

/**
 * Parse canonical pipeline Markdown into a PlanResponse.
 * @param strict - If true, requires **Tool** and non-empty **Prompt** for every step (planner). If false, applies defaults like import (codex, empty prompt allowed).
 */
export function parseMarkdownToPlanResult(markdown: string, strict = false): ParsePlanResult {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return { ok: false, errors: ['Document is empty.'] };
  }

  const lines = trimmed.split('\n');
  let pipelineName = '';
  let currentStage: PlannedStage | null = null;
  let currentStep: (Partial<PlannedStep> & { name?: string }) | null = null;
  let inPromptBlock = false;
  let promptLines: string[] = [];
  const stages: PlannedStage[] = [];

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
      pipelineName = line.slice(2).trim();
      continue;
    }

    if (line.startsWith('## ')) {
      if (currentStep && currentStage) {
        finalizeStep(currentStep, currentStage, strict);
        currentStep = null;
      }
      const match = line.slice(3).match(/^(.+?)\s*\((\w+)\)\s*$/);
      const modeRaw = match ? match[2].toLowerCase() : 'parallel';
      const executionMode = modeRaw === 'sequential' ? 'sequential' : 'parallel';
      currentStage = {
        name: match ? match[1].trim() : line.slice(3).trim(),
        executionMode,
        steps: [],
      };
      stages.push(currentStage);
      continue;
    }

    if (line.startsWith('### ') && currentStage) {
      if (currentStep) {
        finalizeStep(currentStep, currentStage, strict);
      }
      currentStep = { name: line.slice(4).trim() };
      continue;
    }

    if (!currentStep || !currentStage) continue;

    if (line.startsWith('- **Recommended Tool**: ')) {
      currentStep.recommendedTool = line.slice(24).trim();
      continue;
    }
    if (line.startsWith('- **Tool**: ')) {
      currentStep.recommendedTool = line.slice(12).trim();
      continue;
    }
    if (line.startsWith('- **Model**: ')) {
      currentStep.model = line.slice(13).trim();
      continue;
    }
    if (line.startsWith('- **Command**: ')) {
      currentStep.command = line.slice(15).replace(/^`|`$/g, '').trim();
      continue;
    }
    if (line.startsWith('- **Depends On**: ') || line.startsWith('- **Depends on**: ')) {
      currentStep.dependsOn = parseDependsOn(line);
      continue;
    }
    if (line.startsWith('- **Failure Mode**: ')) {
      const val = line.slice(20).trim().toLowerCase();
      if (val === 'skip' || val === 'retry' || val === 'stop') {
        currentStep.failureMode = val;
      }
      continue;
    }
    if (line.startsWith('- **Retry Count**: ')) {
      const n = parseInt(line.slice(19).trim(), 10);
      if (!Number.isNaN(n)) {
        (currentStep as PlannedStep & { retryCount?: number }).retryCount = n;
      }
      continue;
    }
    if (line.trim() === '```') {
      inPromptBlock = true;
      continue;
    }
  }

  if (currentStep && currentStage) {
    finalizeStep(currentStep, currentStage, strict);
  }

  const plan: PlanResponse = {
    pipelineName: pipelineName || 'Untitled Pipeline',
    stages,
  };

  const errors = validatePlanResponse(plan, strict);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, plan };
}

export function validatePlanResponse(plan: PlanResponse, strict: boolean): string[] {
  const errors: string[] = [];
  if (!plan.pipelineName?.trim()) {
    errors.push('Missing or empty pipeline title: use a single line `# Pipeline name`.');
  }
  if (!plan.stages?.length) {
    errors.push('At least one stage is required: `## Stage name (parallel)` or `(sequential)`.');
    return errors;
  }

  const seenNames = new Set<string>();

  for (const stage of plan.stages) {
    if (!stage.name?.trim()) {
      errors.push('A stage has an empty name.');
    }
    const em = String(stage.executionMode || '').toLowerCase();
    if (em !== 'parallel' && em !== 'sequential') {
      errors.push(
        `Stage "${stage.name || '(unnamed)'}": execution mode must be (parallel) or (sequential).`
      );
    }
    if (!stage.steps?.length) {
      errors.push(`Stage "${stage.name || '(unnamed)'}": add at least one step (\`### Step name\`).`);
      continue;
    }

    for (const step of stage.steps) {
      if (!step.name?.trim()) {
        errors.push(`Stage "${stage.name || '(unnamed)'}": a step has an empty name.`);
        continue;
      }
      if (seenNames.has(step.name)) {
        errors.push(`Duplicate step name "${step.name}". Step names must be unique across the pipeline.`);
      }

      const deps = step.dependsOn ?? [];
      for (const dep of deps) {
        if (!seenNames.has(dep)) {
          errors.push(
            `Step "${step.name}": **Depends On** references unknown or forward reference "${dep}".`
          );
        }
      }

      const toolOk = normalizeTool(step.recommendedTool);
      if (strict && !toolOk) {
        errors.push(
          `Step "${step.name}": **Tool** must be one of: ${TOOL_TYPES.join(', ')}.`
        );
      }
      if (strict && !(step.prompt ?? '').trim()) {
        errors.push(`Step "${step.name}": **Prompt** fenced block must be non-empty.`);
      }

      if (!strict && !toolOk && step.recommendedTool?.trim()) {
        errors.push(
          `Step "${step.name}": invalid **Tool** "${step.recommendedTool}". Use: ${TOOL_TYPES.join(', ')}.`
        );
      }

      seenNames.add(step.name);
    }
  }

  return errors;
}

export function buildPlannerRetryPrompt(
  baseInstructions: string,
  attempt: number,
  maxAttempts: number,
  validationErrors: string[],
  previousMarkdown: string
): string {
  const snippet = previousMarkdown.length > 14000
    ? `${previousMarkdown.slice(0, 14000)}\n\n… [truncated]`
    : previousMarkdown;

  return `${baseInstructions}

---

## Regeneration required (attempt ${attempt} / ${maxAttempts})

Your previous Markdown did not pass validation. Output ONLY the corrected pipeline Markdown document (no apology, no extra commentary).

Validation errors:
${validationErrors.map((e) => `- ${e}`).join('\n')}

Previous output for reference:
\`\`\`\`markdown
${snippet}
\`\`\`\`
`;
}
