# AgentCadence CLI-First Handoff

Date: 2026-04-20

## Purpose

This document is for the next implementer to continue the CLI-first refactor and productization work without having to reconstruct the current state from git diff alone.

The target product shape remains:

- terminal-first workflow orchestration
- browser UI as dashboard, configuration center, and visual monitoring surface
- stable machine-readable CLI output through `--json` and `--jsonl`

## Current Status

The codebase is past architecture discussion and already in implementation/integration stage.

The following are done:

- `pipeline`, `history`, `settings`, `webhook`, `template`, `schedule`, and `post-action` command trees exist in the CLI
- `history` is now a first-class application query surface, including active runs
- template CRUD/import/export/create-from-pipeline logic is extracted into an application service
- schedule and post-action application services own resolver + inspection logic, CLI routes through them
- the old `src/shared` bucket has been dismantled and physically removed
- transcript merge logic now lives under presentation-oriented modules
- CLI transcript shaping (header, stage headers, stylized step status, summary footer) lives in `src/presentation/transcript/run-transcript.ts`
- planner markdown contract moved into `src/contracts`
- domain/contracts/presentation split is present in code structure

The following verification already passed in the current workspace:

- `bash scripts/harness.sh`
- `npx vitest run src/cli/__tests__/cli-formatting.test.ts src/server/services/__tests__/history-service.test.ts src/server/services/__tests__/settings-service.test.ts src/presentation/transcript/__tests__/agent-feed-merge.test.ts src/domain/__tests__/pipeline-tool-meta.test.ts`

## Implemented Architecture Shift

### Directory intent

Current top-level structure under `src/`:

- `src/domain`
- `src/contracts`
- `src/presentation`
- `src/server`
- `src/client`
- `src/cli`

This is the main architectural correction from the earlier review. The old `shared` concept was semantically unclear because it mixed:

- domain models
- planner/import-export contracts
- transcript/event presentation transforms
- environment/profile merge helpers

That ambiguity has been removed.

### Current ownership

- `src/domain`
  - core entities and type composition
  - pipeline/run/tool/settings model ownership
- `src/contracts`
  - API contracts
  - websocket event contracts
  - planner markdown import/export contract
  - CLI/profile merge contract helpers
- `src/presentation`
  - transcript merge and transcript-oriented shaping logic
- `src/server/services/app`
  - application services that routes and CLI should call

## Important Files

Use these as the primary entry points when continuing:

- [`docs/2026-04-15-cli-first-architecture-review.md`](/Users/yongliang.wen/project/AgentCadence/docs/2026-04-15-cli-first-architecture-review.md)
- [`src/cli/index.ts`](/Users/yongliang.wen/project/AgentCadence/src/cli/index.ts)
- [`src/server/routes/history.ts`](/Users/yongliang.wen/project/AgentCadence/src/server/routes/history.ts)
- [`src/server/routes/templates.ts`](/Users/yongliang.wen/project/AgentCadence/src/server/routes/templates.ts)
- [`src/server/services/app/history-service.ts`](/Users/yongliang.wen/project/AgentCadence/src/server/services/app/history-service.ts)
- [`src/server/services/app/template-service.ts`](/Users/yongliang.wen/project/AgentCadence/src/server/services/app/template-service.ts)
- [`src/presentation/transcript/agent-feed-merge.ts`](/Users/yongliang.wen/project/AgentCadence/src/presentation/transcript/agent-feed-merge.ts)
- [`src/contracts/planner/pipeline-markdown.ts`](/Users/yongliang.wen/project/AgentCadence/src/contracts/planner/pipeline-markdown.ts)

## What Is Working Now

### CLI

The CLI currently supports:

- `agentcadence pipeline list|get|run|stop`
- `agentcadence history list|show|step|tail`
- `agentcadence settings get|set`
- `agentcadence webhook list|get|trigger`
- `agentcadence template list|get|create|delete|from-pipeline|create-pipeline|export-md|import-md`
- `agentcadence schedule list|get|run`
- `agentcadence post-action list|get|runs`

Important behavior already present:

- `pipeline run` defaults to a human-readable transcript view with stage headers, step glyphs, and a framed summary footer (steps completed / failed / skipped)
- `history tail` attaches to an active run and reuses the same transcript presenter
- `--view raw` switches the transcript to raw `[step] line` output without touching JSONL
- `--json` is used for snapshot commands
- `--jsonl` is enforced for live machine-readable stream output

### History model

`history-service` now unifies two sources:

- persisted `pipeline.runHistory`
- active in-memory run snapshots from `live-run-buffer`

This means the CLI can inspect in-flight runs through the same `history` surface used for completed runs.

### Templates

`template-service` now owns:

- template list/get/delete
- create template directly
- create template from pipeline
- create pipeline from template
- export markdown
- import markdown
- cloning stages/steps with new IDs and dependency remapping

This is the right shape. Template behavior should continue to stay in application service space, not in route handlers.

## Known Gaps And Remaining Work

This project is not blocked by architecture anymore. Remaining work is mostly completion and hardening.

### 1. CLI resource parity

The CLI now covers all first-class resources: `pipeline`, `history`, `settings`, `template`, `webhook`, `schedule`, and `post-action`. Post-actions are intentionally inspection-only (list/get/runs) because their CRUD remains a control-plane concern owned by the browser UI.

If we later decide that post-action CRUD should also be CLI-driven, the application service boundary is already in place in `src/server/services/app/post-action-service.ts`.

### 2. CLI transcript presentation

The human-facing output for `pipeline run` and `history tail` is now driven by `src/presentation/transcript/run-transcript.ts`:

- framed header with pipeline name/id, workspace, and trigger
- stage headers emitted on first progressed step per stage
- glyph-prefixed step status lines with retry attempt suffix
- pretty output lines use `│` gutters, raw view keeps `[step] line` form
- framed footer with step totals, duration, and `history show` hint

Next improvement ideas, if product wants an even more Claude-Code-style transcript:

- integrate agent-feed tool completion summaries into the transcript (not just raw output chunks)
- color/ANSI styling when stdout is a TTY
- progress spinners for in-flight steps

### 3. History persistence model is still transitional

`history-service` gives a unified query surface, but the persistence center is still effectively `pipeline.runHistory`.

That is acceptable short-term, but still not the ideal conceptual model if history continues to grow in scope. The next implementer should avoid deepening the coupling between pipeline definition and run history storage.

### 4. Working tree is dirty and not yet shaped into reviewable commits

This is the biggest practical issue right now. The implementation is real and tested, but it has not yet been split into commit-sized review units.

Do not start by reworking architecture again. Start by stabilizing and isolating the remaining changes.

## Suggested Next Execution Order

If continuing from this workspace, use this order:

1. Review the dirty tree and separate obvious docs-only noise from code-affecting work.
2. ~Finish missing CLI surfaces, especially `schedule`.~ done — `schedule` and `post-action` now in place.
3. ~Refine CLI transcript presentation without changing execution semantics.~ done — shaping lives in `src/presentation/transcript/run-transcript.ts`.
4. ~Add tests for newly completed command trees.~ done — `src/cli/__tests__/cli-formatting.test.ts` and `src/presentation/transcript/__tests__/run-transcript.test.ts`.
5. ~Re-run `bash scripts/harness.sh`.~ done on 2026-04-20 (custom-command and Cursor stub both green).
6. Split into reviewable commits by concern, not by file count. **← still pending**

## Guardrails For The Next Implementer

- Do not reintroduce a generic `shared` package.
- Keep route handlers thin. New behavior belongs in application services.
- Keep transcript shaping logic in presentation-oriented modules.
- Keep markdown import/export logic under explicit planner/template contracts.
- Do not let CLI output formatting leak into execution services.
- Treat `history` as the CLI run inspection surface, not `pipeline.runHistory` directly.

## Verification Commands

Minimum required before claiming completion:

```bash
bash scripts/harness.sh
```

Useful targeted checks:

```bash
npx vitest run src/cli/__tests__/cli-formatting.test.ts
npx vitest run src/server/services/__tests__/history-service.test.ts
npx vitest run src/server/services/__tests__/settings-service.test.ts
npx vitest run src/presentation/transcript/__tests__/agent-feed-merge.test.ts
npx vitest run src/presentation/transcript/__tests__/run-transcript.test.ts
npx vitest run src/domain/__tests__/pipeline-tool-meta.test.ts
```

## Recommended Cursor Prompt

If another agent is taking over, this prompt should be sufficient:

```text
Continue the AgentCadence CLI-first implementation from docs/2026-04-20-cli-first-handoff.md.

Constraints:
- do not reintroduce src/shared
- keep routes thin and move behavior into app services
- keep CLI output shaping separate from execution services
- preserve history as the unified run inspection surface
- run bash scripts/harness.sh before claiming completion

Focus next on:
1. missing CLI parity, especially schedule commands
2. polishing pipeline run / history tail transcript output
3. adding tests for any newly added command trees
4. splitting work into reviewable commits if requested
```

## Bottom Line

This branch is not in "planning" state anymore. It is in "finish and harden" state.

The architecture correction that mattered most has already happened:

- `shared` is gone
- `history` is first-class
- CLI command tree exists and is now resource-symmetric (pipeline / history / settings / template / webhook / schedule / post-action)
- template and post-action logic is application-owned
- transcript shaping is presentation-owned

The remaining open item is packaging the working tree into reviewable commits by concern.
