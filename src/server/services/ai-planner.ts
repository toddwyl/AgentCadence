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
import {
  buildPipelineMarkdownFormatInstructions,
  buildPlannerRetryPrompt,
  extractPipelineMarkdownDocument,
  parseMarkdownToPlanResult,
} from '../../shared/pipeline-markdown.js';

const MAX_PLANNER_ATTEMPTS = 3;

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
        command: psStep.command,
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
    globalVariables: {},
  };
}

export function buildPlannerPrompt(
  userPrompt: string,
  tools: ToolType[],
  customPolicy: string
): string {
  const policySection = customPolicy.trim()
    ? `\n\nAdditional planning policy (user-defined):\n${customPolicy.trim()}`
    : '';

  const formatInstructions = buildPipelineMarkdownFormatInstructions(tools);

  return `You are an AI pipeline planner.
${formatInstructions}

Planning quality requirements:
- Ground all major decisions in the repository context; avoid generic assumptions.
- For non-trivial tasks, include an early analysis/design step that compares 2-3 candidate approaches aligned with mainstream best practices for the detected stack, then proceed with the recommended path.
- Decompose adaptively by complexity: simple tasks should stay concise (often 1-3 steps), and complex tasks should split only when dependencies, risk, or validation needs justify it.
- Each step prompt should ask for concrete file-level actions and verification.
${policySection}

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

    const basePrompt = buildPlannerPrompt(
      request.userPrompt,
      request.availableTools,
      config.customPolicy
    );

    const model = config.model.trim() || DEFAULT_LLM_CONFIG.model;
    const plannerConfig = profile.planner;

    let lastMarkdown = '';
    let lastErrors: string[] = [];

    for (let attempt = 1; attempt <= MAX_PLANNER_ATTEMPTS; attempt++) {
      const prompt =
        attempt === 1
          ? basePrompt
          : buildPlannerRetryPrompt(
              basePrompt,
              attempt,
              MAX_PLANNER_ATTEMPTS,
              lastErrors,
              lastMarkdown
            );

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
          if (err.code === 'CANCELLED') {
            throw new PlannerError('CANCELLED', 'Pipeline generation was cancelled.');
          }
          const msg = err.message.toLowerCase();
          if (msg.includes('not found') || msg.includes('no such file')) {
            throw new PlannerError('CLI_UNAVAILABLE', 'Agent CLI is not available.');
          }
          lastErrors = [err.message];
          lastMarkdown = '';
          onLog?.(`\n[Planner] CLI error (attempt ${attempt}/${MAX_PLANNER_ATTEMPTS}): ${err.message}\n`);
          if (attempt >= MAX_PLANNER_ATTEMPTS) {
            throw new PlannerError('COMMAND_FAILED', err.message);
          }
          continue;
        }
        throw new PlannerError('COMMAND_FAILED', (err as Error).message);
      }

      if (result.exitCode !== 0) {
        const stderr = cleanOutput(result.stderr);
        const stdout = cleanOutput(result.stdout);
        const details = stderr || stdout || `Exit code ${result.exitCode}`;
        lastErrors = [`CLI exited with non-zero status: ${details}`];
        lastMarkdown = [stdout, stderr].filter(Boolean).join('\n');
        onLog?.(`\n[Planner] CLI failed (attempt ${attempt}/${MAX_PLANNER_ATTEMPTS}): ${details}\n`);
        if (attempt >= MAX_PLANNER_ATTEMPTS) {
          throw new PlannerError('COMMAND_FAILED', details);
        }
        continue;
      }

      const stdout = cleanOutput(result.stdout);
      const stderr = cleanOutput(result.stderr);
      const merged = [stdout, stderr].filter(Boolean).join('\n');

      if (!merged.trim()) {
        lastErrors = ['Agent CLI returned empty output.'];
        lastMarkdown = '';
        onLog?.(`\n[Planner] Empty output (attempt ${attempt}/${MAX_PLANNER_ATTEMPTS})\n`);
        if (attempt >= MAX_PLANNER_ATTEMPTS) {
          throw new PlannerError('EMPTY_RESPONSE', 'Agent CLI returned empty output.');
        }
        continue;
      }

      onPhaseUpdate?.('parsingResult');
      const doc =
        extractPipelineMarkdownDocument(merged) || extractPipelineMarkdownDocument(stdout);
      if (!doc) {
        lastErrors = [
          'Could not find a Markdown pipeline document. Start with `# Your pipeline title` (optionally inside a ```markdown fenced block).',
        ];
        lastMarkdown = merged;
        onLog?.(`\n[Planner] ${lastErrors[0]} (attempt ${attempt}/${MAX_PLANNER_ATTEMPTS})\n`);
        if (attempt >= MAX_PLANNER_ATTEMPTS) {
          throw new PlannerError('INVALID_RESPONSE', lastErrors.join(' '));
        }
        continue;
      }

      const parsed = parseMarkdownToPlanResult(doc, true);
      if (!parsed.ok) {
        lastErrors = parsed.errors;
        lastMarkdown = doc;
        onLog?.(
          `\n[Planner] Markdown validation failed (attempt ${attempt}/${MAX_PLANNER_ATTEMPTS}):\n${parsed.errors.map((e) => `- ${e}`).join('\n')}\n`
        );
        if (attempt >= MAX_PLANNER_ATTEMPTS) {
          throw new PlannerError(
            'INVALID_RESPONSE',
            `Failed after ${MAX_PLANNER_ATTEMPTS} attempts: ${parsed.errors.join('; ')}`
          );
        }
        continue;
      }

      onPhaseUpdate?.('creatingPipeline');
      return planResponseToPipeline(parsed.plan, request.workingDirectory);
    }

    throw new PlannerError(
      'INVALID_RESPONSE',
      `Failed after ${MAX_PLANNER_ATTEMPTS} attempts: ${lastErrors.join('; ')}`
    );
  }
}
