# AgentCadence CLI-First Design And Architecture Review

Date: 2026-04-15

## Purpose

This document captures the recommended CLI direction for AgentCadence and the accompanying architecture review needed to support a CLI-first product shape.

The main goal is not to translate the current web UI one-to-one into terminal commands. The goal is to make AgentCadence primarily usable as a workflow orchestrator from the terminal, while keeping the browser UI as a dashboard, configuration center, and visual monitoring surface.

## Current Product Reading

Based on the current repository and README, AgentCadence is centered on:

- defining multi-step pipelines
- running them locally against real agent CLIs
- observing live execution activity
- reviewing history and trigger-based runs

That means the center of gravity is execution and orchestration, not resource CRUD by itself.

## CLI Classification

### Purpose

The CLI should let users inspect, trigger, stop, and review AgentCadence pipeline execution from the terminal, while keeping configuration and complex editing available through both CLI and dashboard surfaces.

### Classification

- Primary role: Workflow / Orchestration
- Primary user type: Balanced
- Primary interaction form: Batch CLI
- Statefulness: Config-Stateful
- Risk profile: High Side-Effect
- Secondary surfaces:
  - Meta / Control-Plane: settings and profiles
  - Capability: pipeline, webhook, and schedule object lookup
  - Machine Protocol / Event Stream Surface: `--json`, `--jsonl`
- Confidence: high

### Classification Reasoning

This should be treated as a workflow/orchestration CLI rather than a capability CLI because the highest-value user action is to run and inspect multi-step workflows, not merely to manage objects at rest.

It should not be treated as a runtime CLI either. The system does execute runtime-like workloads, but the product is not centered on a single agent session. It is centered on pipeline execution, dependency ordering, triggers, and run observation.

It should be treated as Balanced rather than Human-Primary because machine-readable output is important and should be a first-class secondary surface. However, the default experience should still be optimized for human operators rather than JSON-first automation.

## Primary Design Stance

The CLI should optimize for a user being able to find a pipeline, run it, watch what it is doing in real time, inspect the result, and recover quickly from failure.

It is not trying to be:

- a full resource-management admin console
- a single-agent runtime shell
- a machine-first JSON API with a thin human wrapper

## Recommended Command Structure

The recommended v1 command tree is:

```bash
agentcadence pipeline list
agentcadence pipeline get <id|name>
agentcadence pipeline run <id|name>
agentcadence pipeline stop <id|name>

agentcadence history list
agentcadence history show <run-id>
agentcadence history step <run-id> <step-id>
agentcadence history tail <run-id>

agentcadence settings get [key]
agentcadence settings set <key> <value>

agentcadence webhook list
agentcadence webhook get <id|name>
agentcadence webhook trigger <id|name>

agentcadence schedule list
agentcadence schedule get <id|name>
agentcadence schedule run <id|name>
```

### Why This Shape

This keeps the current product mental model intact while still letting the CLI behave like an orchestration tool.

- `pipeline` remains the main object users think in
- `history` becomes the unified run-inspection surface
- `settings` is explicitly a control-plane surface
- `webhook` and `schedule` remain trigger surfaces, not the product center

The most important detail is command priority, not just the nouns. In help output, `pipeline run`, `pipeline stop`, `history list`, `history show`, and `history tail` should be easier to discover than low-value CRUD operations.

## Input Model

Recommended input model: flags-first

Reasons:

- the CLI is Balanced, not machine-primary
- the object model is still understandable by humans
- the common operations are command-like, not payload-driven

Machine use should be enabled primarily through output contracts, not by moving the whole CLI to raw-payload-first input.

## Output Model

### Primary Output Surface

Human-readable pretty transcript output.

### Secondary Output Surfaces

- `--json` for snapshot-style commands such as `list`, `get`, `show`
- `--jsonl` for live stream commands such as `pipeline run --attach` and `history tail`
- `--view raw` for raw log inspection

### Default Behavior

The default output for `pipeline run` should be a readable run-aware transcript, not a wall of raw terminal output.

Example shape:

```text
AgentCadence
Run: run_abc123
Pipeline: release-check
Trigger: manual

[1/2] Build
  build-server ........ started
  build-server ........ completed (6s)

[2/2] Verify
  harness ............. started
    output: server listening on 3712
    output: stream check passed
  harness ............. completed (42s)

Run finished: completed in 48s
History: agentcadence history show run_abc123
```

This is closer in spirit to a modern orchestration transcript than a raw log streamer.

## Help And Discoverability

Because the CLI is Balanced, strong help and examples are required.

Top-level help should explain that the CLI is for:

- running pipelines
- inspecting history
- managing local control-plane settings
- triggering automation entry points

Each top-level command should include 2-4 examples. The most important examples are:

```bash
agentcadence pipeline run release-check
agentcadence history list --status running
agentcadence history show run_123
agentcadence history tail run_123
```

## State Model

The CLI should be treated as Config-Stateful, not Sessionful.

That means:

- persistent local config matters
- run IDs exist and must be inspectable
- live attach to a run is justified
- a generalized session framework is not justified in v1

`history tail` should mean "attach to a run stream", not "enter a session system."

## Risk Model

### Low-Risk Operations

- `pipeline list`
- `pipeline get`
- `history list`
- `history show`
- `history step`
- `history tail`
- `settings get`
- `webhook list|get`
- `schedule list|get`

### Medium-Risk Operations

- `pipeline run`
- `pipeline stop`
- `webhook trigger`
- `schedule run`
- `settings set`

### High-Risk Operations

Not recommended for v1:

- destructive delete/reset operations
- broad mutation commands
- bulk or ambiguous high-blast-radius actions

### Guardrails

- selector ambiguity must error
- token-like secrets must be masked by default
- `settings set` should echo what changed
- `pipeline run` should identify target pipeline and workspace clearly
- `pipeline stop` should not silently match multiple targets

## Hardening Expectations

- Stable `--json` fields for snapshot commands
- Stable `--jsonl` event types for stream commands
- Explicit exit codes:
  - `0` success
  - `1` failed run or failed command execution
  - `2` invalid arguments, validation failure, ambiguous selector
  - `130` interrupted or cancelled
- Unknown `settings` keys should fail loudly
- `<id|name>` lookup must fail on ambiguity

## Secondary Surface Contract

### `--json`

- Audience: scripts, automation, future programmatic consumers
- Purpose: snapshot inspection
- Contract strength: strong

Recommended commands:

- `pipeline list`
- `pipeline get`
- `history list`
- `history show`
- `history step`
- `settings get`
- `webhook list|get`
- `schedule list|get`

### `--jsonl`

- Audience: advanced automation and stream consumers
- Purpose: live event consumption
- Contract strength: strong

Recommended commands:

- `pipeline run --jsonl`
- `history tail --jsonl`

### `--view raw`

- Audience: human debugging
- Purpose: inspect raw step output
- Contract strength: convenience only

## v1 Boundaries

### Include In v1

- `pipeline list|get|run|stop`
- `history list|show|step|tail`
- `settings get|set`
- `webhook list|get|trigger`
- `schedule list|get|run`
- pretty default output
- `--json` snapshot output
- `--jsonl` stream output

### Defer

- full CRUD for every resource
- template/import/export command trees
- destructive delete/reset commands
- generalized session subsystem
- full-screen TUI
- schema introspection system

### Premature Abstraction To Avoid

- a giant generic "resource command framework"
- a generalized session model
- raw-payload-first command design
- making machine surfaces primary before the human default path is strong

## Architecture Review

## Main Conclusion

The current codebase does not yet have a clean CLI-first architecture boundary. The biggest problem is not just naming. The deeper issue is that the current module structure mixes several different kinds of shared concerns together:

- business/domain models
- HTTP and WS transfer shapes
- UI-facing transcript merge behavior
- planner/import-export protocol logic
- application orchestration logic placed inside route files

This is why `src/shared` feels unclear. It is acting as a buffer for anything that happens to be used in more than one place, rather than representing one clear semantic layer.

## Problems With `src/shared`

### Problem 1: Mixed Semantic Layers In One Package

Current examples:

- `src/shared/types.ts`
- `src/shared/agent-feed-merge.ts`
- `src/shared/pipeline-markdown.ts`
- `src/shared/cli-detect-merge.ts`

These files do not belong to one conceptual category.

For example:

- `types.ts` mixes domain entities, UI metadata, parsing helpers, and execution helpers
- `agent-feed-merge.ts` is transcript presentation logic
- `pipeline-markdown.ts` is a planner/import-export contract
- `cli-detect-merge.ts` is profile update logic tied to environment detection

The fact that both client and server import them does not mean they belong to one architectural layer.

### Problem 2: Domain And Presentation Are Coupled

`src/shared/types.ts` currently includes both core entities and UI-oriented helpers.

Examples include:

- domain-style models like `Pipeline`, `PipelineStep`, `PipelineRunRecord`
- UI metadata like `TOOL_META`
- presentation convenience helpers like `safeToolMeta`
- execution helpers like `resolveAllSteps`

This makes the "shared" module impossible to reason about as a stable domain package.

### Problem 3: Planner Protocol Is Mixed Into General Shared Code

`src/shared/pipeline-markdown.ts` defines a canonical markdown format and parsing rules used by planning/import/export flows.

That is not general shared domain code. It is a protocol and contract surface. It should live with planner/import-export contracts, not beside generic types.

### Problem 4: Transcript Merge Logic Is Treated Like Shared Core Logic

`src/shared/agent-feed-merge.ts` is not core domain logic. It is a transcript/event presentation transform used to shape stream events into readable activity output.

That logic belongs near presentation or event interpretation, not in a generic `shared` bucket.

## Problems Outside `shared`

### Problem 5: Route Layer Contains Application Logic

`src/server/routes/execution.ts` is doing far more than HTTP adaptation. It currently:

- loads and validates target pipelines
- manages active run state
- constructs run records
- updates live buffers
- broadcasts WS events
- requests review gates
- persists history
- triggers post-actions

This is application orchestration logic, not route glue.

### Problem 6: Run Lifecycle Logic Is Duplicated

There are currently two separate run entry paths:

- `src/server/routes/execution.ts`
- `src/server/services/pipeline-executor.ts`

Both contain similar logic for:

- creating run records
- driving scheduler execution
- updating step output and agent feed
- finalizing/persisting runs
- broadcasting finish events

This creates avoidable divergence risk and makes CLI entrypoints harder to add cleanly.

### Problem 7: History Is Stored As A Pipeline Detail Instead Of A First-Class Query Surface

`Pipeline.runHistory` is convenient for UI prototyping, but it is not a good conceptual center for a CLI-first history model.

From a CLI point of view, history should be a first-class run query surface that can unify:

- active runs
- completed runs
- failed runs
- cancelled runs
- manual, schedule, and webhook trigger origins

The current storage shape makes querying subordinate to persistence shape.

## Recommended Architectural Direction

Do not preserve `shared` as a catch-all concept.

Replace it with narrower modules named by meaning.

### 1. Domain

Use `src/domain` for stable business concepts and pure rules:

```text
src/domain/
  pipeline.ts
  run.ts
  tool-profile.ts
  prompt-variables.ts
```

This layer should include:

- pipeline, stage, and step entities
- run entities and statuses
- variable interpolation rules
- dependency-resolution rules if they are true business rules

This layer should not include:

- UI metadata
- HTTP or WS DTOs
- transcript presentation transforms
- markdown import/export protocols

### 2. Application

Use `src/application` for use-case orchestration:

```text
src/application/
  pipeline-service.ts
  execution-service.ts
  history-service.ts
  settings-service.ts
  webhook-service.ts
  schedule-service.ts
```

This layer should define the reusable business workflows needed by:

- HTTP routes
- CLI commands
- webhook triggers
- schedule triggers

This is the layer the future CLI should depend on directly.

### 3. Contracts

Use `src/contracts` for external and cross-boundary contracts:

```text
src/contracts/
  api/
  events/
  planner/
```

Examples:

- HTTP request/response DTOs
- run event stream schemas
- pipeline markdown import/export protocol

This is where the current `pipeline-markdown.ts` should move.

### 4. Infrastructure

Use `src/infrastructure` for file stores, CLIs, PTY execution, and realtime transport:

```text
src/infrastructure/
  store/
  execution/
  realtime/
```

This is where things like:

- file-backed repositories
- `dag-scheduler`
- `tool-runner`
- `cli-runner`
- live buffer storage
- WS bus adapters

should eventually converge.

### 5. Presentation

Keep client and CLI presentation concerns clearly separate:

```text
src/client/
src/cli/
src/presentation/
```

Transcript merge/render logic should live in a presentation-oriented place, not in a generic shared bucket.

## Suggested Transitional Split For `shared`

If a full architecture move is too large immediately, make this smaller transitional split first:

### Move To `src/domain`

From `src/shared/types.ts`, move:

- pipeline entities
- run entities
- CLI profile entities
- interpolation and dependency rules that are genuinely business logic

### Move To `src/contracts/planner`

Move:

- `src/shared/pipeline-markdown.ts`

### Move To `src/presentation/transcript`

Move:

- `src/shared/agent-feed-merge.ts`

### Move To `src/application` Or `src/infrastructure`

Re-home helpers like:

- `src/shared/cli-detect-merge.ts`

depending on whether they are application policy or environment-specific adaptation.

## Execution Architecture Recommendation

The most important near-term architecture change is to unify pipeline run lifecycle under one application service.

Create a single `execution-service` responsible for:

- starting a run
- stopping a run
- managing active run state
- updating run progress
- emitting run events
- finalizing and persisting history
- exposing attach/tail behavior for live consumption

Then make these surfaces depend on it:

- HTTP execution routes
- webhook trigger path
- schedule trigger path
- future CLI `pipeline run`
- future CLI `history tail`

This will remove the current duplication between route-owned and service-owned execution flows.

## History Architecture Recommendation

History should become a first-class application surface.

Create a `history-service` that can unify:

- active runs from live buffers
- persisted completed runs
- trigger metadata from manual/webhook/schedule sources

The CLI should then treat `history` as the single query surface for:

- running runs
- completed runs
- failed runs
- cancelled runs

This allows:

```bash
agentcadence history list --status running
agentcadence history show <run-id>
agentcadence history step <run-id> <step-id>
agentcadence history tail <run-id>
```

without leaking current storage layout into the command model.

## Implementation Priorities

Recommended order:

1. Split `shared` conceptually into domain, contracts, and presentation-oriented pieces
2. Extract `execution-service` from the current route-owned run lifecycle
3. Extract `history-service` as a first-class application surface
4. Build CLI v1 around:
   - `pipeline run`
   - `pipeline stop`
   - `history list|show|step|tail`
   - `settings get|set`
5. Add `webhook` and `schedule` trigger/query commands afterward

## Final Recommendation

Keep `方案 A` as the CLI tree, but implement it with a strongly orchestration-centered stance.

That means:

- `pipeline run` and `history *` are the center of gravity
- pretty transcript output is the default
- `--json` and `--jsonl` are explicit strong secondary surfaces
- `shared` should be dismantled into meaning-based modules rather than preserved as a catch-all

If this direction is followed, the browser UI can cleanly become a dashboard/configuration surface instead of remaining the only coherent entrypoint to the system.
