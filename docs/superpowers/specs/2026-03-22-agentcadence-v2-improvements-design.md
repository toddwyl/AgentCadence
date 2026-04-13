# AgentCadence V2 Improvements Design

## Overview

Six improvements to AgentCadence covering IDE integration, execution UX, context passing, UI optimization, and E2E validation.

---

## Improvement 1: Cursor Companion Extension + Review Mode

### Data Model Changes

**`PipelineStep` new field:**
```typescript
reviewMode: 'auto' | 'review';  // default 'auto'
```

**`StepRunRecord` new fields:**
```typescript
reviewResult?: 'accepted' | 'rejected';
changedFiles?: string[];
```

**New WebSocket events:**
```typescript
// Server → Client/Extension
'step_review_requested': { pipelineId, stepId, workingDirectory, changedFiles: string[] }
// Extension → Server
'step_review_response': { pipelineId, stepId, action: 'accept' | 'reject' }
```

### Server-Side Changes (dag-scheduler.ts)

After a step completes successfully and `reviewMode === 'review'`:
1. Run `git diff --name-only` to get `changedFiles`
2. Save a git stash or snapshot for potential rollback
3. Broadcast `step_review_requested` via WebSocket
4. Pause execution (await a Promise that resolves on `step_review_response`)
5. On `accept` → continue to next step
6. On `reject` → `git checkout -- .` to revert, mark step as `rejected`

### WebSocket Route (execution.ts / ws.ts)

Add handler for incoming `step_review_response` messages from extension. Route to DAG scheduler's pending review resolver.

### Cursor Extension (separate project: agentcadence-cursor-extension/)

```
agentcadence-cursor-extension/
├── package.json          # VS Code extension manifest
├── src/
│   ├── extension.ts      # Activation, commands, status bar
│   ├── ws-client.ts      # WebSocket client to AgentCadence server
│   ├── diff-viewer.ts    # vscode.diff API integration
│   └── review-panel.ts   # Accept/Reject notification UI
└── tsconfig.json
```

**Flow:**
1. User runs `AgentCadence: Connect` command → connects to `ws://localhost:3712/ws`
2. Status bar shows connection state
3. On `step_review_requested`:
   - Open working directory if not already open
   - For each changed file: `vscode.diff(original, modified)` showing before/after
   - Show notification with Accept / Reject buttons
4. User action → send `step_review_response` back to server

**Settings:**
- `agentcadence.serverUrl`: default `ws://localhost:3712/ws`
- `agentcadence.autoConnect`: default `false`

### Step Detail Panel UI

Add `reviewMode` toggle in StepDetailPanel.tsx:
- Radio/switch: "Auto Continue" (default) | "Wait for Review"

---

## Improvement 2: Real-time Streaming Output

### Current State
- `CLIRunner.onOutputChunk` already streams chunks via WebSocket `step_output`
- Frontend accumulates in `stepOutputs` map (capped at 80KB)
- ExecutionMonitor shows output as static text block

### Changes

**ExecutionMonitor output pane → terminal-style streaming:**
- Replace static `<pre>` with a scrollable terminal-like container
- Append chunks incrementally as they arrive via WebSocket
- Auto-scroll to bottom (with manual scroll-lock: if user scrolls up, stop auto-scrolling; resume when scrolled to bottom)
- Show a blinking cursor indicator while step is running
- Monospace font, dark background (terminal aesthetic)

**No server changes needed** — streaming infrastructure already exists.

---

## Improvement 3: Tool Order

**One-line change in `src/shared/types.ts`:**
```typescript
// Before
export const TOOL_TYPES: ToolType[] = ['codex', 'claude', 'cursor'];
// After
export const TOOL_TYPES: ToolType[] = ['cursor', 'claude', 'codex'];
```

---

## Improvement 4: Step Context Passing

### DAG Scheduler Changes (dag-scheduler.ts)

Before executing each step, inject context from completed dependency steps:

**Success context:**
```
[Context from previous step "{stepName}" (completed)]:
{truncated output, max 2000 chars, last N lines}
```

**Failure context:**
```
[Context from previous step "{stepName}" (FAILED)]:
Error: {stderr or last 1000 chars of output}
Please be aware of this failure and adjust your approach accordingly.
```

### Implementation

- In `executeStep()`, after resolving global variables, prepend dependency context to the prompt
- `buildStepContext(step, allStepResults)` function:
  - Iterates over `dependsOnStepIDs` (and implicit stage-order dependencies)
  - For each completed dep: extract last 2000 chars of output
  - For each failed dep: extract error/stderr
  - Format and prepend to prompt
- Context is injected transparently; user's prompt template stays clean

### Data Flow
```
Step A completes → output stored in stepResults map
Step B starts → buildStepContext() reads Step A result → prepends to Step B prompt
```

---

## Improvement 5: Pipeline Settings Panel

### Current State
- Global variables shown inline in PipelineEditor
- CLI Profile / LLM Config in settings modal (global scope)

### New Structure

**Pipeline Settings Panel** (per-pipeline, triggered by gear icon next to pipeline name):
- Tab/section: Global Variables (moved from main editor)
- Future: more per-pipeline config options

**Global Settings** (existing settings modal, remains in Header/Sidebar):
- CLI Profile (tool executables, flags)
- LLM Config
- Notification Settings
- Theme / Locale

### UI Changes

**PipelineEditor.tsx:**
- Remove inline `PipelineGlobalVariables` component
- Add gear icon button next to pipeline name → opens Pipeline Settings panel

**New component: `PipelineSettingsPanel.tsx`**
- Slide-over or modal panel
- Contains `PipelineGlobalVariables` (moved here)
- Extensible for future pipeline-level settings

**Header/Sidebar:**
- Existing settings button remains for global settings
- Label clarification: "Global Settings" vs pipeline gear = "Pipeline Settings"

---

## Improvement 6: E2E Pipeline Test

### Pipeline Structure

A 3-step pipeline using mixed tools, working in a temp directory:

**Step 1: Create Hello World** (tool: `cursor`, reviewMode: `auto`)
- Prompt: "Create a Python hello world project in this directory. Create main.py that prints 'Hello, World!' and a test_main.py that tests the output of main.py using subprocess."

**Step 2: Code Review** (tool: `claude`, reviewMode: `auto`)
- Prompt: "Review the Python code in this directory. Check for code quality, potential issues, and suggest improvements. If you find issues, fix them directly."

**Step 3: Run & Test** (tool: `cursor`, reviewMode: `auto`)
- Prompt: "Run python main.py and verify it outputs 'Hello, World!'. Then run python -m pytest test_main.py and ensure all tests pass. Report the results."

### Implementation

- New E2E script: `scripts/agentcadence-e2e-pipeline.mjs`
- Creates temp directory via `mkdtemp`
- Uses AgentCadence API to create pipeline → stages → steps
- Triggers execution, polls until completion
- Validates: pipeline status = 'completed', all steps succeeded
- Cleans up temp directory

### Also: Built-in Template

Add this as a template in `templates.json` so users can one-click create it from the UI.

---

## Implementation Order

1. **Improvement 3** — Tool order (trivial, 1 line)
2. **Improvement 5** — Pipeline Settings UI refactor
3. **Improvement 2** — Streaming output terminal
4. **Improvement 4** — Step context passing
5. **Improvement 1** — Review mode + Cursor extension
6. **Improvement 6** — E2E pipeline test (validates everything works)
