#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import type { Pipeline, PipelineTemplate } from '../domain/pipeline.js';
import type { PipelineRunStatus, StepRunRecord } from '../domain/run.js';
import {
  startManualPipelineRun,
  stopManualPipelineRun,
} from '../server/services/app/execution-service.js';
import {
  getHistoryRun,
  getHistoryRunStep,
  listHistoryRuns,
} from '../server/services/app/history-service.js';
import {
  listPipelines,
  resolvePipelineSelector,
} from '../server/services/app/pipeline-service.js';
import {
  createPipelineFromTemplate,
  createTemplate,
  createTemplateFromPipeline,
  deleteTemplateById,
  exportTemplateMarkdown,
  importTemplateMarkdown,
  listTemplates,
  resolveTemplateSelector,
} from '../server/services/app/template-service.js';
import {
  listSchedules,
  resolveScheduleSelector,
  runScheduleNowByIdOrName,
} from '../server/services/app/schedule-service.js';
import {
  getSettingByPath,
  getSettingsSnapshot,
  setSettingByPath,
} from '../server/services/app/settings-service.js';
import {
  listWebhooks,
  resolveWebhookSelector,
  triggerWebhookByIdOrName,
} from '../server/services/app/webhook-service.js';
import {
  getPostActionDetail,
  listPostActionRuns,
  listPostActions,
  resolvePostActionSelector,
} from '../server/services/app/post-action-service.js';
import {
  flattenStepsWithStage,
  formatDuration,
  formatRunHeader,
  formatRunSummary,
  formatStageHeader,
  formatStepOutputLines,
  formatStepStatus,
  type TranscriptView,
} from '../presentation/transcript/run-transcript.js';

type ParsedArgs = {
  positionals: string[];
  options: Record<string, string | boolean>;
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || hasHelpFlag(argv)) {
    printRootHelp();
    process.exit(0);
  }

  const [group, command, ...rest] = argv;

  try {
    let exitCode = 0;
    if (group === 'pipeline') {
      exitCode = await handlePipeline(command, rest);
    } else if (group === 'history') {
      exitCode = await handleHistory(command, rest);
    } else if (group === 'settings') {
      exitCode = await handleSettings(command, rest);
    } else if (group === 'template') {
      exitCode = await handleTemplate(command, rest);
    } else if (group === 'webhook') {
      exitCode = await handleWebhook(command, rest);
    } else if (group === 'schedule') {
      exitCode = await handleSchedule(command, rest);
    } else if (group === 'post-action') {
      exitCode = await handlePostAction(command, rest);
    } else {
      throw new CliUsageError(`Unknown command group "${group}".`);
    }
    process.exit(exitCode);
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(error.message);
      process.exit(2);
    }
    console.error((error as Error).message);
    process.exit(1);
  }
}

async function handlePipeline(command: string | undefined, rest: string[]): Promise<number> {
  if (!command || command === 'help') {
    printPipelineHelp();
    return 0;
  }

  const parsed = parseArgs(rest);
  const json = Boolean(parsed.options.json);
  const jsonl = Boolean(parsed.options.jsonl);
  const view = readOption(parsed, 'view') ?? 'pretty';

  if (command === 'list') {
    const pipelines = listPipelines();
    if (json) {
      printJson(pipelines);
      return 0;
    }
    if (pipelines.length === 0) {
      console.log('No pipelines found.');
      return 0;
    }
    printTable(
      ['ID', 'NAME', 'WORKDIR', 'STAGES'],
      pipelines.map((pipeline) => [
        pipeline.id,
        pipeline.name,
        pipeline.workingDirectory,
        String(pipeline.stages.length),
      ])
    );
    return 0;
  }

  if (command === 'get') {
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence pipeline get <id|name>');
    const pipeline = requirePipeline(selector);
    if (json) {
      printJson(pipeline);
      return 0;
    }
    printPipelineDetail(pipeline);
    return 0;
  }

  if (command === 'run') {
    if (json) {
      throw new CliUsageError('Use --jsonl for live machine-readable run output.');
    }
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence pipeline run <id|name>');
    const pipeline = requirePipeline(selector);
    const result = startManualPipelineRun(pipeline.id);
    if (!jsonl) {
      for (const line of formatRunHeader({
        runId: result.runId,
        pipelineName: pipeline.name,
        pipelineId: pipeline.id,
        workingDirectory: pipeline.workingDirectory,
        triggerType: 'manual',
      })) {
        console.log(line);
      }
    }
    return followRun(result.runId, {
      jsonl,
      view: resolveView(view),
      fromCurrent: false,
    });
  }

  if (command === 'stop') {
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence pipeline stop <id|name>');
    const pipeline = requirePipeline(selector);
    const stopped = stopManualPipelineRun(pipeline.id);
    if (!stopped) throw new Error(`No active run for pipeline "${pipeline.name}".`);
    if (json) {
      printJson({ ok: true, pipelineId: pipeline.id, pipelineName: pipeline.name });
      return 0;
    }
    console.log(`Stop requested for pipeline "${pipeline.name}".`);
    return 0;
  }

  throw new CliUsageError(`Unknown pipeline command "${command}".`);
}

async function handleHistory(command: string | undefined, rest: string[]): Promise<number> {
  if (!command || command === 'help') {
    printHistoryHelp();
    return 0;
  }

  const parsed = parseArgs(rest);
  const json = Boolean(parsed.options.json);
  const jsonl = Boolean(parsed.options.jsonl);
  const view = readOption(parsed, 'view') ?? 'pretty';

  if (command === 'list') {
    const status = readOption(parsed, 'status') as PipelineRunStatus | undefined;
    const pipelineSelector = readOption(parsed, 'pipeline');
    const pipelineId = pipelineSelector ? requirePipeline(pipelineSelector).id : undefined;
    const runs = listHistoryRuns({ status, pipelineId });
    if (json) {
      printJson(runs);
      return 0;
    }
    if (runs.length === 0) {
      console.log('No runs found.');
      return 0;
    }
    printTable(
      ['RUN ID', 'PIPELINE', 'STATUS', 'TRIGGER', 'STARTED'],
      runs.map((run) => [
        run.runId,
        run.pipelineName,
        run.status,
        run.triggerType,
        run.startedAt,
      ])
    );
    return 0;
  }

  if (command === 'show') {
    const runId = parsed.positionals[0];
    if (!runId) throw new CliUsageError('Usage: agentcadence history show <run-id>');
    const detail = getHistoryRun(runId);
    if (!detail) throw new Error(`Run "${runId}" not found.`);
    if (json) {
      printJson(detail);
      return 0;
    }
    printHistoryDetail(detail);
    return 0;
  }

  if (command === 'step') {
    const runId = parsed.positionals[0];
    const stepId = parsed.positionals[1];
    if (!runId || !stepId) {
      throw new CliUsageError('Usage: agentcadence history step <run-id> <step-id>');
    }
    const step = getHistoryRunStep(runId, stepId);
    if (!step) throw new Error(`Step "${stepId}" not found in run "${runId}".`);
    if (json) {
      printJson(step);
      return 0;
    }
    printStepDetail(step);
    return 0;
  }

  if (command === 'tail') {
    const runId = parsed.positionals[0];
    if (!runId) throw new CliUsageError('Usage: agentcadence history tail <run-id>');
    const detail = getHistoryRun(runId);
    if (!detail) throw new Error(`Run "${runId}" not found.`);
    if (!detail.isActive) {
      throw new Error(`Run "${runId}" is not active.`);
    }
    if (!jsonl) {
      console.log(`Attached to run ${runId}.`);
      console.log('');
    }
    return followRun(runId, {
      jsonl,
      view: resolveView(view),
      fromCurrent: true,
    });
  }

  throw new CliUsageError(`Unknown history command "${command}".`);
}

async function handleSettings(command: string | undefined, rest: string[]): Promise<number> {
  if (!command || command === 'help') {
    printSettingsHelp();
    return 0;
  }

  const parsed = parseArgs(rest);
  const json = Boolean(parsed.options.json);

  if (command === 'get') {
    const key = parsed.positionals[0];
    const value = key ? getSettingByPath(key) : getSettingsSnapshot();
    if (json || typeof value !== 'object') {
      printJson(value);
      return 0;
    }
    printJson(value);
    return 0;
  }

  if (command === 'set') {
    const key = parsed.positionals[0];
    const value = parsed.positionals[1];
    if (!key || value === undefined) {
      throw new CliUsageError('Usage: agentcadence settings set <key> <value>');
    }
    const before = getSettingByPath(key);
    const next = setSettingByPath(key, value);
    const after = getSettingByPath(key);
    if (json) {
      printJson({ key, before, after, settings: next });
      return 0;
    }
    console.log(`Updated ${key}`);
    console.log(`Before: ${formatInlineValue(before)}`);
    console.log(`After:  ${formatInlineValue(after)}`);
    return 0;
  }

  throw new CliUsageError(`Unknown settings command "${command}".`);
}

async function handleWebhook(command: string | undefined, rest: string[]): Promise<number> {
  if (!command || command === 'help') {
    printWebhookHelp();
    return 0;
  }

  const parsed = parseArgs(rest);
  const json = Boolean(parsed.options.json);

  if (command === 'list') {
    const webhooks = listWebhooks();
    if (json) {
      printJson(webhooks);
      return 0;
    }
    if (webhooks.length === 0) {
      console.log('No webhooks found.');
      return 0;
    }
    printTable(
      ['ID', 'NAME', 'PIPELINE', 'ENABLED', 'STATUS'],
      webhooks.map((webhook) => [
        webhook.id,
        webhook.name,
        webhook.pipeline_id,
        webhook.enabled ? 'yes' : 'no',
        webhook.status,
      ])
    );
    return 0;
  }

  if (command === 'get') {
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence webhook get <id|name>');
    const webhook = requireWebhook(selector);
    if (json) {
      printJson(webhook);
      return 0;
    }
    printWebhookDetail(webhook);
    return 0;
  }

  if (command === 'trigger') {
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence webhook trigger <id|name>');
    const run = await triggerWebhookByIdOrName(selector);
    if (json) {
      printJson(run);
      return run.status === 'success' ? 0 : 1;
    }
    console.log(`Webhook run finished: ${run.status}`);
    console.log(`Webhook Run: ${run.id}`);
    console.log(`Pipeline Run: ${run.pipeline_run_id}`);
    if (run.error) console.log(`Error: ${run.error}`);
    return run.status === 'success' ? 0 : 1;
  }

  throw new CliUsageError(`Unknown webhook command "${command}".`);
}

async function handleTemplate(command: string | undefined, rest: string[]): Promise<number> {
  if (!command || command === 'help') {
    printTemplateHelp();
    return 0;
  }

  const parsed = parseArgs(rest);
  const json = Boolean(parsed.options.json);

  if (command === 'list') {
    const templates = listTemplates();
    if (json) {
      printJson(templates);
      return 0;
    }
    if (templates.length === 0) {
      console.log('No templates found.');
      return 0;
    }
    printTable(
      ['ID', 'NAME', 'STAGES', 'UPDATED'],
      templates.map((template) => [
        template.id,
        template.name,
        String(template.stages.length),
        template.updatedAt,
      ])
    );
    return 0;
  }

  if (command === 'get') {
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence template get <id|name>');
    const template = requireTemplate(selector);
    if (json) {
      printJson(template);
      return 0;
    }
    printTemplateDetail(template);
    return 0;
  }

  if (command === 'create') {
    const name = parsed.positionals[0];
    if (!name) throw new CliUsageError('Usage: agentcadence template create <name> [--description <text>] [--json]');
    const description = readOption(parsed, 'description');
    const template = createTemplate({ name, description, stages: [] });
    if (json) {
      printJson(template);
      return 0;
    }
    console.log(`Template created: ${template.name}`);
    console.log(`ID: ${template.id}`);
    return 0;
  }

  if (command === 'delete') {
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence template delete <id|name> [--json]');
    const template = requireTemplate(selector);
    const ok = deleteTemplateById(template.id);
    if (!ok) throw new Error(`Template "${template.name}" not found.`);
    if (json) {
      printJson({ ok: true, templateId: template.id, templateName: template.name });
      return 0;
    }
    console.log(`Deleted template "${template.name}".`);
    return 0;
  }

  if (command === 'from-pipeline') {
    const pipelineSelector = parsed.positionals[0];
    if (!pipelineSelector) {
      throw new CliUsageError(
        'Usage: agentcadence template from-pipeline <pipeline-id|name> [--name <template-name>] [--description <text>] [--json]'
      );
    }
    const pipeline = requirePipeline(pipelineSelector);
    const template = createTemplateFromPipeline(pipeline.id, {
      name: readOption(parsed, 'name'),
      description: readOption(parsed, 'description'),
    });
    if (json) {
      printJson(template);
      return 0;
    }
    console.log(`Template created from pipeline "${pipeline.name}".`);
    console.log(`Template: ${template.name}`);
    console.log(`ID: ${template.id}`);
    return 0;
  }

  if (command === 'create-pipeline') {
    const templateSelector = parsed.positionals[0];
    if (!templateSelector) {
      throw new CliUsageError(
        'Usage: agentcadence template create-pipeline <template-id|name> --working-directory <path> [--name <pipeline-name>] [--json]'
      );
    }
    const workingDirectory = readOption(parsed, 'working-directory');
    if (!workingDirectory) {
      throw new CliUsageError('Missing --working-directory for template create-pipeline.');
    }
    const template = requireTemplate(templateSelector);
    const pipeline = createPipelineFromTemplate(template.id, {
      workingDirectory,
      name: readOption(parsed, 'name'),
    });
    if (json) {
      printJson(pipeline);
      return 0;
    }
    console.log(`Pipeline created from template "${template.name}".`);
    console.log(`Pipeline: ${pipeline.name}`);
    console.log(`ID: ${pipeline.id}`);
    console.log(`Working Directory: ${pipeline.workingDirectory}`);
    return 0;
  }

  if (command === 'export-md') {
    const selector = parsed.positionals[0];
    if (!selector) {
      throw new CliUsageError('Usage: agentcadence template export-md <id|name> [--output <path>] [--json]');
    }
    const template = requireTemplate(selector);
    const markdown = exportTemplateMarkdown(template.id);
    const outputPath = readOption(parsed, 'output');
    if (outputPath) {
      writeFileSync(outputPath, markdown, 'utf8');
    }
    if (json) {
      printJson({
        templateId: template.id,
        templateName: template.name,
        output: outputPath ?? null,
        markdown,
      });
      return 0;
    }
    if (outputPath) {
      console.log(`Exported template markdown to ${outputPath}`);
      return 0;
    }
    console.log(markdown);
    return 0;
  }

  if (command === 'import-md') {
    const inputPath = parsed.positionals[0];
    if (!inputPath) {
      throw new CliUsageError('Usage: agentcadence template import-md <path> [--json]');
    }
    const markdown = readFileSync(inputPath, 'utf8');
    const template = importTemplateMarkdown(markdown);
    if (json) {
      printJson(template);
      return 0;
    }
    console.log(`Imported template "${template.name}".`);
    console.log(`ID: ${template.id}`);
    return 0;
  }

  throw new CliUsageError(`Unknown template command "${command}".`);
}

async function handleSchedule(command: string | undefined, rest: string[]): Promise<number> {
  if (!command || command === 'help') {
    printScheduleHelp();
    return 0;
  }

  const parsed = parseArgs(rest);
  const json = Boolean(parsed.options.json);

  if (command === 'list') {
    const schedules = listSchedules();
    if (json) {
      printJson(schedules);
      return 0;
    }
    if (schedules.length === 0) {
      console.log('No schedules found.');
      return 0;
    }
    printTable(
      ['ID', 'NAME', 'PIPELINE', 'ENABLED', 'CRON'],
      schedules.map((schedule) => [
        schedule.id,
        schedule.name,
        schedule.pipeline_id,
        schedule.enabled ? 'yes' : 'no',
        schedule.cron_expression,
      ])
    );
    return 0;
  }

  if (command === 'get') {
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence schedule get <id|name>');
    const schedule = requireSchedule(selector);
    if (json) {
      printJson(schedule);
      return 0;
    }
    printScheduleDetail(schedule);
    return 0;
  }

  if (command === 'run') {
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence schedule run <id|name>');
    const run = await runScheduleNowByIdOrName(selector);
    if (json) {
      printJson(run);
      return run.status === 'success' ? 0 : 1;
    }
    console.log(`Schedule run finished: ${run.status}`);
    console.log(`Schedule Run: ${run.id}`);
    console.log(`Pipeline Run: ${run.pipeline_run_id}`);
    if (run.error) console.log(`Error: ${run.error}`);
    return run.status === 'success' ? 0 : 1;
  }

  throw new CliUsageError(`Unknown schedule command "${command}".`);
}

async function handlePostAction(command: string | undefined, rest: string[]): Promise<number> {
  if (!command || command === 'help') {
    printPostActionHelp();
    return 0;
  }

  const parsed = parseArgs(rest);
  const json = Boolean(parsed.options.json);

  if (command === 'list') {
    const actions = listPostActions();
    if (json) {
      printJson(actions);
      return 0;
    }
    if (actions.length === 0) {
      console.log('No post-actions found.');
      return 0;
    }
    printTable(
      ['ID', 'NAME', 'METHOD', 'URL', 'ENABLED', 'BINDINGS'],
      actions.map((action) => [
        action.id,
        action.name,
        action.method,
        action.url,
        action.enabled ? 'yes' : 'no',
        String(action.bindingsCount),
      ])
    );
    return 0;
  }

  if (command === 'get') {
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence post-action get <id|name>');
    const action = requirePostAction(selector);
    const detail = getPostActionDetail(action.id);
    if (!detail) throw new Error(`Post-action "${action.name}" not found.`);
    if (json) {
      printJson(detail);
      return 0;
    }
    printPostActionDetail(detail);
    return 0;
  }

  if (command === 'runs') {
    const selector = parsed.positionals[0];
    if (!selector) throw new CliUsageError('Usage: agentcadence post-action runs <id|name>');
    const action = requirePostAction(selector);
    const runs = listPostActionRuns(action.id);
    if (json) {
      printJson(runs);
      return 0;
    }
    if (runs.length === 0) {
      console.log(`No runs recorded for post-action "${action.name}".`);
      return 0;
    }
    printTable(
      ['RUN ID', 'STATUS', 'STATUS CODE', 'TRIGGERED AT'],
      runs.map((run) => [
        run.id,
        run.status,
        String(run.status_code || '-'),
        run.triggered_at,
      ])
    );
    return 0;
  }

  throw new CliUsageError(`Unknown post-action command "${command}".`);
}

async function followRun(
  runId: string,
  options: {
    view: TranscriptView;
    jsonl: boolean;
    fromCurrent: boolean;
  }
): Promise<number> {
  const seenStatuses = new Map<string, string>();
  const seenOutputLengths = new Map<string, number>();
  const announcedStages = new Set<string>();
  let emittedFinal = false;

  if (options.fromCurrent) {
    const initial = getHistoryRun(runId);
    if (initial) {
      for (const entry of flattenStepsWithStage(initial.run)) {
        seenStatuses.set(entry.step.stepID, entry.step.status);
        seenOutputLengths.set(entry.step.stepID, (entry.step.rawOutput ?? '').length);
        if (entry.step.status !== 'pending') {
          announcedStages.add(entry.stageId);
        }
      }
    }
  }

  while (true) {
    const detail = getHistoryRun(runId);
    if (!detail) {
      await sleep(250);
      continue;
    }

    if (!options.fromCurrent && options.jsonl) {
      printJsonLine({
        type: 'run_started',
        runId,
        pipelineId: detail.pipelineId,
        pipelineName: detail.pipelineName,
        status: detail.run.status,
        triggerType: detail.run.triggerType ?? 'manual',
        startedAt: detail.run.startedAt,
      });
      options.fromCurrent = true;
    }

    for (const entry of flattenStepsWithStage(detail.run)) {
      const { stageId, stageName, step } = entry;
      const prevStatus = seenStatuses.get(step.stepID);
      if (prevStatus !== step.status) {
        if (
          !options.jsonl &&
          step.status !== 'pending' &&
          !announcedStages.has(stageId)
        ) {
          for (const line of formatStageHeader(stageName)) {
            console.log(line);
          }
          announcedStages.add(stageId);
        }
        emitStatus(runId, step, detail.run.status, options.jsonl);
        seenStatuses.set(step.stepID, step.status);
      }

      const fullOutput = step.rawOutput ?? '';
      const prevLength = seenOutputLengths.get(step.stepID) ?? 0;
      const nextChunk = fullOutput.slice(prevLength);
      if (nextChunk) {
        emitOutputChunk(runId, step, nextChunk, options.view, options.jsonl);
        seenOutputLengths.set(step.stepID, fullOutput.length);
      }
    }

    if (detail.run.status !== 'running') {
      if (!emittedFinal) {
        emitRunFinished(
          runId,
          detail.run.status,
          detail.run.durationMs,
          detail.run.errorMessage,
          detail.run.stageRuns,
          options.jsonl
        );
        emittedFinal = true;
      }
      return detail.run.status === 'completed' ? 0 : 1;
    }

    await sleep(350);
  }
}

function emitStatus(
  runId: string,
  step: StepRunRecord,
  runStatus: PipelineRunStatus,
  jsonl: boolean
) {
  if (jsonl) {
    printJsonLine({
      type: 'step_status_changed',
      runId,
      stepId: step.stepID,
      stepName: step.stepName,
      status: step.status,
      runStatus,
    });
    return;
  }

  if (step.status === 'pending') return;
  console.log(formatStepStatus(step));
}

function emitOutputChunk(
  runId: string,
  step: StepRunRecord,
  chunk: string,
  view: TranscriptView,
  jsonl: boolean
) {
  if (jsonl) {
    printJsonLine({
      type: 'step_output',
      runId,
      stepId: step.stepID,
      stepName: step.stepName,
      chunk,
    });
    return;
  }

  for (const line of formatStepOutputLines(step, chunk, view)) {
    console.log(line);
  }
}

function emitRunFinished(
  runId: string,
  status: PipelineRunStatus,
  durationMs: number | undefined,
  error: string | undefined,
  stageRuns: PipelineRunStageArg,
  jsonl: boolean
) {
  if (jsonl) {
    printJsonLine({
      type: 'run_finished',
      runId,
      status,
      durationMs,
      error,
    });
    return;
  }

  for (const line of formatRunSummary({
    runId,
    status,
    durationMs,
    stageRuns,
    error,
  })) {
    console.log(line);
  }
}

type PipelineRunStageArg = Parameters<typeof formatRunSummary>[0]['stageRuns'];

function resolveView(raw: string): TranscriptView {
  return raw === 'raw' ? 'raw' : 'pretty';
}

function requirePipeline(selector: string): Pipeline {
  try {
    const pipeline = resolvePipelineSelector(selector);
    if (!pipeline) {
      throw new Error(`Pipeline "${selector}" not found.`);
    }
    return pipeline;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const trimmed = arg.slice(2);
    if (!trimmed) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      options[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      continue;
    }

    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      options[trimmed] = next;
      i += 1;
      continue;
    }

    options[trimmed] = true;
  }

  return { positionals, options };
}

function readOption(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.options[key];
  return typeof value === 'string' ? value : undefined;
}

function hasHelpFlag(argv: string[]): boolean {
  return argv.includes('--help') || argv.includes('-h');
}

function printRootHelp() {
  console.log(`AgentCadence CLI

Usage:
  agentcadence <command> <subcommand> [options]

Commands:
  pipeline     define and run pipelines
  history      inspect active and past runs
  settings     manage local control-plane configuration
  template     manage reusable pipeline templates
  webhook      inspect and trigger webhooks
  schedule     inspect and run schedules
  post-action  inspect post-action automations

Examples:
  agentcadence pipeline list
  agentcadence pipeline run release-check
  agentcadence history list --status running
  agentcadence settings get profile.cursor.executable
  agentcadence template list
  agentcadence webhook list
  agentcadence schedule list
  agentcadence post-action list`);
}

function printPipelineHelp() {
  console.log(`Usage:
  agentcadence pipeline list [--json]
  agentcadence pipeline get <id|name> [--json]
  agentcadence pipeline run <id|name> [--view pretty|raw] [--jsonl]
  agentcadence pipeline stop <id|name> [--json]`);
}

function printHistoryHelp() {
  console.log(`Usage:
  agentcadence history list [--status running|completed|failed|cancelled] [--pipeline <id|name>] [--json]
  agentcadence history show <run-id> [--json]
  agentcadence history step <run-id> <step-id> [--json]
  agentcadence history tail <run-id> [--view pretty|raw] [--jsonl]`);
}

function printSettingsHelp() {
  console.log(`Usage:
  agentcadence settings get [key] [--json]
  agentcadence settings set <key> <value> [--json]`);
}

function printTemplateHelp() {
  console.log(`Usage:
  agentcadence template list [--json]
  agentcadence template get <id|name> [--json]
  agentcadence template create <name> [--description <text>] [--json]
  agentcadence template delete <id|name> [--json]
  agentcadence template from-pipeline <pipeline-id|name> [--name <template-name>] [--description <text>] [--json]
  agentcadence template create-pipeline <template-id|name> --working-directory <path> [--name <pipeline-name>] [--json]
  agentcadence template export-md <id|name> [--output <path>] [--json]
  agentcadence template import-md <path> [--json]`);
}

function printWebhookHelp() {
  console.log(`Usage:
  agentcadence webhook list [--json]
  agentcadence webhook get <id|name> [--json]
  agentcadence webhook trigger <id|name> [--json]`);
}

function printScheduleHelp() {
  console.log(`Usage:
  agentcadence schedule list [--json]
  agentcadence schedule get <id|name> [--json]
  agentcadence schedule run <id|name> [--json]`);
}

function printPostActionHelp() {
  console.log(`Usage:
  agentcadence post-action list [--json]
  agentcadence post-action get <id|name> [--json]
  agentcadence post-action runs <id|name> [--json]`);
}

function printPipelineDetail(pipeline: Pipeline) {
  console.log(`Pipeline: ${pipeline.name}`);
  console.log(`ID: ${pipeline.id}`);
  console.log(`Working Directory: ${pipeline.workingDirectory}`);
  console.log(`Stages: ${pipeline.stages.length}`);
  for (const stage of pipeline.stages) {
    console.log(`- ${stage.name} (${stage.executionMode})`);
    for (const step of stage.steps) {
      console.log(`  - ${step.name} [${step.id}]`);
    }
  }
}

function printTemplateDetail(template: PipelineTemplate) {
  console.log(`Template: ${template.name}`);
  console.log(`ID: ${template.id}`);
  if (template.description) console.log(`Description: ${template.description}`);
  console.log(`Stages: ${template.stages.length}`);
  console.log(`Updated: ${template.updatedAt}`);
  for (const stage of template.stages) {
    console.log(`- ${stage.name} (${stage.executionMode})`);
    for (const step of stage.steps) {
      console.log(`  - ${step.name} [${step.id}]`);
    }
  }
}

function printHistoryDetail(detail: NonNullable<ReturnType<typeof getHistoryRun>>) {
  console.log(`Run: ${detail.run.id}`);
  console.log(`Pipeline: ${detail.pipelineName}`);
  console.log(`Status: ${detail.run.status}`);
  console.log(`Trigger: ${detail.run.triggerType ?? 'manual'}`);
  console.log(`Started: ${detail.run.startedAt}`);
  if (detail.run.endedAt) console.log(`Ended: ${detail.run.endedAt}`);
  if (detail.run.durationMs) console.log(`Duration: ${formatDuration(detail.run.durationMs)}`);
  if (detail.run.errorMessage) console.log(`Error: ${detail.run.errorMessage}`);
  console.log('');
  for (const stage of detail.run.stageRuns) {
    console.log(`${stage.stageName}:`);
    for (const step of stage.stepRuns) {
      console.log(`  ${step.stepName} [${step.stepID}] ... ${step.status}`);
    }
  }
}

function printStepDetail(step: StepRunRecord) {
  console.log(`Step: ${step.stepName}`);
  console.log(`ID: ${step.stepID}`);
  console.log(`Status: ${step.status}`);
  if (step.totalAttempts !== undefined) console.log(`Attempts: ${step.totalAttempts}`);
  if (step.reviewResult) console.log(`Review: ${step.reviewResult}`);
  if (step.changedFiles?.length) {
    console.log(`Changed Files: ${step.changedFiles.join(', ')}`);
  }
  if (step.rawOutput?.trim()) {
    console.log('');
    console.log('Raw Output:');
    console.log(step.rawOutput);
  }
}

function printWebhookDetail(webhook: ReturnType<typeof requireWebhook>) {
  console.log(`Webhook: ${webhook.name}`);
  console.log(`ID: ${webhook.id}`);
  console.log(`Pipeline ID: ${webhook.pipeline_id}`);
  console.log(`Enabled: ${webhook.enabled ? 'yes' : 'no'}`);
  console.log(`Status: ${webhook.status}`);
  console.log(`Timeout Seconds: ${webhook.timeout_seconds}`);
  console.log(`Max Concurrent: ${webhook.max_concurrent}`);
}

function printScheduleDetail(schedule: ReturnType<typeof requireSchedule>) {
  console.log(`Schedule: ${schedule.name}`);
  console.log(`ID: ${schedule.id}`);
  console.log(`Pipeline ID: ${schedule.pipeline_id}`);
  console.log(`Enabled: ${schedule.enabled ? 'yes' : 'no'}`);
  console.log(`Cron: ${schedule.cron_expression}`);
  console.log(`Timezone: ${schedule.timezone}`);
  if (schedule.last_run_at) console.log(`Last Run: ${schedule.last_run_at}`);
}

function printPostActionDetail(detail: NonNullable<ReturnType<typeof getPostActionDetail>>) {
  console.log(`Post-Action: ${detail.name}`);
  console.log(`ID: ${detail.id}`);
  if (detail.description) console.log(`Description: ${detail.description}`);
  console.log(`Method: ${detail.method}`);
  console.log(`URL: ${detail.url}`);
  console.log(`Enabled: ${detail.enabled ? 'yes' : 'no'}`);
  console.log(`Auth Type: ${detail.auth_type}`);
  console.log(`Timeout Seconds: ${detail.timeout_seconds}`);
  console.log(`Retry Count: ${detail.retry_count}`);
  if (detail.bindings.length === 0) {
    console.log('Bindings: (none)');
    return;
  }
  console.log('Bindings:');
  for (const binding of detail.bindings) {
    console.log(
      `  - ${binding.id} [${binding.trigger_type}/${binding.trigger_id}] on=${binding.trigger_on} ${
        binding.enabled ? 'enabled' : 'disabled'
      }`
    );
  }
}

function printTable(headers: string[], rows: string[][]) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
  );

  const headerLine = headers
    .map((header, index) => header.padEnd(widths[index]))
    .join('  ');
  const divider = widths.map((width) => '-'.repeat(width)).join('  ');
  console.log(headerLine);
  console.log(divider);
  for (const row of rows) {
    console.log(row.map((cell, index) => cell.padEnd(widths[index])).join('  '));
  }
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function printJsonLine(value: unknown) {
  console.log(JSON.stringify(value));
}

function formatInlineValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function requireWebhook(selector: string) {
  try {
    const webhook = resolveWebhookSelector(selector);
    if (!webhook) {
      throw new Error(`Webhook "${selector}" not found.`);
    }
    return webhook;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function requireTemplate(selector: string): PipelineTemplate {
  try {
    const template = resolveTemplateSelector(selector);
    if (!template) {
      throw new Error(`Template "${selector}" not found.`);
    }
    return template;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function requirePostAction(selector: string) {
  try {
    const action = resolvePostActionSelector(selector);
    if (!action) {
      throw new Error(`Post-action "${selector}" not found.`);
    }
    return action;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function requireSchedule(selector: string) {
  try {
    const schedule = resolveScheduleSelector(selector);
    if (!schedule) {
      throw new Error(`Schedule "${selector}" not found.`);
    }
    return schedule;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CliUsageError extends Error {}

void main();
