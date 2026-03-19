// ============================================================
// AgentFlow — Shared Type Definitions
// ============================================================
export const TOOL_TYPES = ['codex', 'claude', 'cursor'];
export const TOOL_META = {
    codex: {
        displayName: 'Codex',
        defaultModels: ['gpt-5-codex', 'o3', 'gpt-4.1'],
        iconName: 'terminal',
        tintColor: '#22c55e',
    },
    claude: {
        displayName: 'Claude',
        defaultModels: ['sonnet', 'opus', 'haiku'],
        iconName: 'brain',
        tintColor: '#f97316',
    },
    cursor: {
        displayName: 'Cursor',
        defaultModels: ['opus-4.6', 'gpt-5', 'sonnet-4'],
        iconName: 'mouse-pointer',
        tintColor: '#3b82f6',
    },
};
export function toolFromKeyword(keyword) {
    const lower = keyword.toLowerCase();
    if (lower.includes('cursor') || lower.includes('agent'))
        return 'cursor';
    if (lower.includes('codex') || lower.includes('openai'))
        return 'codex';
    if (lower.includes('claude'))
        return 'claude';
    return 'codex';
}
export function detectToolFromCommandLine(commandLine) {
    const lower = commandLine.toLowerCase();
    if (lower.includes('cursor-agent') ||
        lower.startsWith('cursor ') ||
        lower.includes(' cursor ') ||
        lower.startsWith('agent ') ||
        lower.includes(' agent '))
        return 'cursor';
    if (lower.includes('codex'))
        return 'codex';
    if (lower.includes('claude'))
        return 'claude';
    return null;
}
export function stepHasCustomCommand(step) {
    return !!(step.command && step.command.trim().length > 0);
}
export function stepDisplayTool(step) {
    if (stepHasCustomCommand(step) && step.command) {
        return detectToolFromCommandLine(step.command);
    }
    return step.tool;
}
export function pipelineAllSteps(pipeline) {
    return pipeline.stages.flatMap((s) => s.steps);
}
export function pipelineProjectDisplayName(pipeline) {
    const trimmed = pipeline.workingDirectory.trim();
    if (!trimmed)
        return 'No project selected';
    const parts = trimmed.split('/');
    return parts[parts.length - 1] || 'Unknown';
}
export function resolveAllSteps(pipeline) {
    const resolved = [];
    for (const stage of pipeline.stages) {
        for (let i = 0; i < stage.steps.length; i++) {
            const step = stage.steps[i];
            const deps = new Set(step.dependsOnStepIDs);
            if (stage.executionMode === 'sequential' && i > 0) {
                deps.add(stage.steps[i - 1].id);
            }
            resolved.push({ step, allDependencies: deps, stageID: stage.id });
        }
    }
    return resolved;
}
export function profileConfigForTool(profile, tool) {
    return profile[tool];
}
export function buildToolArguments(config, prompt, model, workingDirectory) {
    const args = config.baseArgs.map((a) => a === '.' && workingDirectory ? workingDirectory : a);
    const resolvedModel = model || config.defaultModel;
    if (resolvedModel) {
        args.push(config.modelFlag, resolvedModel);
    }
    switch (config.promptMode) {
        case 'inline':
            if (config.promptFlag) {
                args.push(config.promptFlag, prompt);
            }
            else {
                args.push(prompt);
            }
            break;
        case 'argument':
            if (prompt)
                args.push(prompt);
            break;
        case 'stdin':
            break;
    }
    return args;
}
export function buildCommandTemplate(config, model) {
    const parts = [config.executable, ...config.baseArgs];
    const resolvedModel = model || config.defaultModel;
    if (resolvedModel) {
        parts.push(config.modelFlag, resolvedModel);
    }
    switch (config.promptMode) {
        case 'inline':
            if (config.promptFlag) {
                parts.push(config.promptFlag, '{{prompt}}');
            }
            else {
                parts.push('{{prompt}}');
            }
            break;
        case 'argument':
            parts.push('{{prompt}}');
            break;
        case 'stdin':
            break;
    }
    return parts.join(' ');
}
export const DEFAULT_CLI_PROFILE = {
    id: 'default',
    name: 'Default (Open Source)',
    cursor: {
        executable: 'cursor-agent',
        baseArgs: ['--trust'],
        promptFlag: '-p',
        modelFlag: '--model',
        promptMode: 'inline',
        defaultModel: 'opus-4.6',
    },
    codex: {
        executable: 'codex',
        baseArgs: ['exec', '--sandbox', 'workspace-write'],
        modelFlag: '--model',
        promptMode: 'argument',
    },
    claude: {
        executable: 'claude',
        baseArgs: ['--print', '--permission-mode', 'bypassPermissions', '--add-dir', '.'],
        promptFlag: '-p',
        modelFlag: '--model',
        promptMode: 'inline',
    },
    planner: {
        executable: 'cursor-agent',
        baseArgs: ['--trust'],
        promptFlag: '-p',
        modelFlag: '--model',
        promptMode: 'inline',
        defaultModel: 'opus-4.6',
    },
};
export const INTERNAL_CLI_PROFILE = {
    id: 'internal',
    name: 'Internal',
    cursor: {
        executable: 'cursor-agent',
        baseArgs: ['--trust'],
        promptFlag: '-p',
        modelFlag: '--model',
        promptMode: 'inline',
        defaultModel: 'opus-4.6',
    },
    codex: {
        executable: 'codex-internal',
        baseArgs: ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check'],
        modelFlag: '--model',
        promptMode: 'argument',
    },
    claude: {
        executable: 'claude-internal',
        baseArgs: ['--print', '--permission-mode', 'bypassPermissions', '--add-dir', '.'],
        promptFlag: '-p',
        modelFlag: '--model',
        promptMode: 'inline',
    },
    planner: {
        executable: 'cursor-agent',
        baseArgs: ['--trust'],
        promptFlag: '-p',
        modelFlag: '--model',
        promptMode: 'inline',
        defaultModel: 'opus-4.6',
    },
};
export const PLANNING_PHASE_TITLES = {
    preparingContext: 'Prepare task context',
    invokingAgentCLI: 'Invoke Agent CLI',
    generatingStructure: 'Generate pipeline structure',
    parsingResult: 'Parse structured JSON',
    creatingPipeline: 'Create pipeline in app',
};
export const DEFAULT_LLM_CONFIG = {
    model: 'opus-4.6',
    customPolicy: '',
};
export const DEFAULT_NOTIFICATION_SETTINGS = {
    isEnabled: false,
    notifyOnCompleted: true,
    notifyOnFailed: true,
    notifyOnCancelled: true,
    playSound: true,
};
