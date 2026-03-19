import type {
  Pipeline,
  PipelineStep,
  PipelineStage,
  PlanRequest,
  PlanResponse,
  PlanningPhase,
  LLMConfig,
  CLIProfile,
  ToolType,
  ExecutionMode,
} from '../../shared/types.js';
import { toolFromKeyword, DEFAULT_LLM_CONFIG } from '../../shared/types.js';
import { CLIRunner, CLIError } from './cli-runner.js';
import { v4 as uuidv4 } from 'uuid';
import { buildToolArguments } from '../../shared/types.js';

export class PlannerError extends Error {
  constructor(
    public code: 'CLI_UNAVAILABLE' | 'COMMAND_FAILED' | 'CANCELLED' | 'EMPTY_RESPONSE' | 'INVALID_RESPONSE' | 'PARSING_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'PlannerError';
  }
}

function stripANSI(text: string): string {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function cleanOutput(text: string): string {
  return stripANSI(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function extractJSONText(text: string): string | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  const candidates: string[] = [cleaned];

  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fencePattern.exec(cleaned)) !== null) {
    candidates.push(match[1]);
  }

  const chars = Array.from(cleaned);
  let depth = 0;
  let start: number | null = null;
  let inStr = false;
  let escaping = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (inStr) {
      if (escaping) { escaping = false; continue; }
      if (ch === '\\') { escaping = true; continue; }
      if (ch === '"') { inStr = false; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== null) {
        candidates.push(chars.slice(start, i + 1).join(''));
        start = null;
      }
    }
  }

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as PlanResponse;
      if (parsed.pipelineName && parsed.stages) return trimmed;
    } catch { /* ignore */ }
  }
  return null;
}

function resolvedTool(stepName: string, stageName: string, recommended: string): ToolType {
  const normName = stepName.toLowerCase();
  const normStage = stageName.toLowerCase();
  if (normName.includes('verify') || normName.includes('fix')) return 'codex';
  if (normName.includes('review') || normStage.includes('review')) return 'cursor';
  if (normName.includes('implement') || normName.includes('feature') ||
      normStage.includes('coding') || normStage.includes('implement')) return 'codex';
  return toolFromKeyword(recommended);
}

function planResponseToPipeline(plan: PlanResponse, workingDirectory: string): Pipeline {
  const stepNameToID = new Map<string, string>();
  const stages: PipelineStage[] = [];

  for (const ps of plan.stages) {
    const mode: ExecutionMode = ps.executionMode === 'sequential' ? 'sequential' : 'parallel';
    const steps: PipelineStep[] = [];

    for (const psStep of ps.steps) {
      const id = uuidv4();
      stepNameToID.set(psStep.name, id);
      const deps = (psStep.dependsOn || [])
        .map((n) => stepNameToID.get(n))
        .filter(Boolean) as string[];

      steps.push({
        id,
        name: psStep.name,
        prompt: psStep.prompt,
        tool: resolvedTool(psStep.name, ps.name, psStep.recommendedTool),
        model: psStep.model,
        dependsOnStepIDs: deps,
        failureMode: psStep.failureMode ?? 'retry',
        retryCount: 3,
        status: 'pending',
      });
    }

    stages.push({ id: uuidv4(), name: ps.name, steps, executionMode: mode });
  }

  return {
    id: uuidv4(),
    name: plan.pipelineName,
    stages,
    workingDirectory,
    isAIGenerated: true,
    createdAt: new Date().toISOString(),
    runHistory: [],
  };
}

export function buildPlannerPrompt(
  userPrompt: string,
  tools: ToolType[],
  customPolicy: string
): string {
  const toolList = tools.join(', ');
  const policySection = customPolicy.trim()
    ? `\n\nAdditional planning policy (user-defined):\n${customPolicy.trim()}`
    : '';

  return `You are an AI pipeline planner.
Given a user's task description, generate a structured pipeline as JSON.

Available tools: ${toolList}

Tool guidance:
- codex: Default for implementation, feature work, and verify/fix steps.
- cursor: Default for code review steps.
- claude: Optional alternative for analysis/review, but not the default.

Typical pattern: codex for initial coding, cursor for code review, and codex for verify/fix.

Planning quality requirements:
- Ground all major decisions in the repository context; avoid generic assumptions.
- For non-trivial tasks, include an early analysis/design step that compares 2-3 candidate approaches aligned with mainstream best practices for the detected stack, then proceed with the recommended path.
- Decompose adaptively by complexity: simple tasks should stay concise (often 1-3 steps), and complex tasks should split only when dependencies, risk, or validation needs justify it.
- Each step prompt should ask for concrete file-level actions and verification.
${policySection}

Respond with ONLY a valid JSON object (no markdown fences, no prose) in this format:
{
  "pipelineName": "descriptive name",
  "stages": [
    {
      "name": "stage name",
      "executionMode": "parallel" | "sequential",
      "steps": [
        {
          "name": "step name",
          "prompt": "detailed prompt for the AI tool",
          "recommendedTool": "codex" | "claude" | "cursor",
          "model": null,
          "dependsOn": ["other step name"] or null,
          "failureMode": "retry"
        }
      ]
    }
  ]
}

Guidelines:
1. Break complex tasks into logical stages and steps.
2. Use parallel mode when steps are independent.
3. Use sequential mode when order matters within a stage.
4. Default to codex for coding and verify/fix, and cursor for code review.
5. Keep plan size proportional to complexity; avoid over-decomposition.
6. Write clear, detailed prompts for each step.

User task:
${userPrompt}`;
}

export class AIPlanner {
  private cli = new CLIRunner();

  async generatePipeline(
    request: PlanRequest,
    config: LLMConfig,
    profile: CLIProfile,
    onPhaseUpdate?: (phase: PlanningPhase) => void,
    onLog?: (chunk: string) => void
  ): Promise<Pipeline> {
    onPhaseUpdate?.('preparingContext');

    const prompt = buildPlannerPrompt(
      request.userPrompt,
      request.availableTools,
      config.customPolicy
    );

    const model = config.model.trim() || DEFAULT_LLM_CONFIG.model;
    const plannerConfig = profile.planner;
    const args = buildToolArguments(plannerConfig, prompt, model, request.workingDirectory);

    let result;
    try {
      onPhaseUpdate?.('invokingAgentCLI');
      onPhaseUpdate?.('generatingStructure');
      result = await this.cli.run({
        command: plannerConfig.executable,
        args,
        workingDirectory: request.workingDirectory,
        stdinData: plannerConfig.promptMode === 'stdin' ? prompt : undefined,
        timeout: 600,
        onOutputChunk: (chunk) => {
          const cleaned = stripANSI(chunk).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          if (cleaned) onLog?.(cleaned);
        },
      });
    } catch (err) {
      if (err instanceof CLIError) {
        if (err.code === 'CANCELLED') throw new PlannerError('CANCELLED', 'Pipeline generation was cancelled.');
        const msg = err.message.toLowerCase();
        if (msg.includes('not found') || msg.includes('no such file')) {
          throw new PlannerError('CLI_UNAVAILABLE', 'Agent CLI is not available.');
        }
        throw new PlannerError('COMMAND_FAILED', err.message);
      }
      throw new PlannerError('COMMAND_FAILED', (err as Error).message);
    }

    if (result.exitCode !== 0) {
      const stderr = cleanOutput(result.stderr);
      const stdout = cleanOutput(result.stdout);
      const details = stderr || stdout || `Exit code ${result.exitCode}`;
      throw new PlannerError('COMMAND_FAILED', details);
    }

    const stdout = cleanOutput(result.stdout);
    const stderr = cleanOutput(result.stderr);
    const merged = [stdout, stderr].filter(Boolean).join('\n');

    if (!merged.trim()) {
      throw new PlannerError('EMPTY_RESPONSE', 'Agent CLI returned empty output.');
    }

    onPhaseUpdate?.('parsingResult');
    const jsonText = extractJSONText(stdout) || extractJSONText(merged);
    if (!jsonText) {
      throw new PlannerError('INVALID_RESPONSE', 'Failed to find valid pipeline JSON in Agent CLI output.');
    }

    try {
      const plan = JSON.parse(jsonText) as PlanResponse;
      onPhaseUpdate?.('creatingPipeline');
      return planResponseToPipeline(plan, request.workingDirectory);
    } catch (err) {
      throw new PlannerError('PARSING_ERROR', `Failed to parse pipeline: ${(err as Error).message}`);
    }
  }
}
