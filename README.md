<p align="center">
  <img src="./src/client/assets/brand/favicon.svg" alt="AgentCadence logo" width="72" height="72" />
</p>

<h1 align="center">AgentCadence</h1>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">中文</a>
</p>

<p align="center">
  A web workbench for orchestrating Cursor, Claude Code, and Codex in multi-step pipelines.
</p>

<p align="center">
  Design staged workflows, run agent CLIs on your machine, watch live transcript-style activity, and keep reusable templates, automation triggers, and run history in one place.
</p>

## Product preview

The orchestration workbench is where you compose pipelines: multiple stages, parallel or sequential steps inside a stage, per-step tool and prompt configuration, and one-click runs while agents execute on the host machine.

<p align="center">
  <img
    src="https://raw.githubusercontent.com/toddwyl/AgentCadence/main/docs/images/workbench-pipeline-editor.png"
    alt="AgentCadence orchestration workbench with a sample pipeline: Coding stage in parallel and Review stage sequential"
  />
</p>

<sub>GitHub’s README viewer may proxy or downscale images; “Save image as” from the page can be a small (~40KB) preview. For the full PNG (~283KB), open the [file in the repo](https://github.com/toddwyl/AgentCadence/blob/main/docs/images/workbench-pipeline-editor.png) and use **Raw**, or use the copy at `docs/images/workbench-pipeline-editor.png` after `git clone` / `git pull`.</sub>

## Why AgentCadence

AgentCadence is built for the gap between a single agent chat and a full CI system.
It lets you compose real local CLI agents into a repeatable pipeline, run them with dependencies and retries, and inspect what happened step by step from the browser.

Typical flows include:

- implement → review → verify
- parallel feature branches in one stage, then converge on review
- scheduled or webhook-triggered runs against an existing pipeline
- reusable pipeline templates for common coding and release tasks

## What you get

| Area | Capabilities |
| --- | --- |
| Pipeline builder | Multi-stage pipelines with sequential or parallel execution, retries, custom commands, and per-step tool/model configuration |
| Supported tools | Cursor, Claude Code, and Codex profiles, with local executable detection and configurable base arguments |
| Live execution | Streaming transcript view, raw logs, run history, per-step status, and persisted outputs for new runs |
| Automation | Schedules, webhooks, and post-run callbacks managed from Settings |
| Workspace features | Templates, insights, working directory selection, and global variables for prompt/command reuse |
| Runtime | React + Vite client, Express + WebSocket server, `node-pty` streaming for terminal-backed steps |

> [!IMPORTANT]
> AgentCadence runs agent CLIs on the machine hosting the Node server, not in the browser.
> Your local environment, credentials, and CLI installs must already be working there.

## Quick start

### Requirements

- Node.js 18+
- npm
- Installed agent CLIs for the tools you want to use, such as `cursor-agent`, `claude`, or `codex`

### Install

```bash
git clone https://github.com/toddwyl/AgentCadence.git
cd AgentCadence
npm install
```

### Run in development

```bash
npm run dev
```

This starts:

- the API server on `PORT` or `3712`
- the Vite client on `5173`, proxying API and WebSocket traffic to the server

If `3712` is already in use, the dev script fails fast instead of silently attaching to the wrong process.

### Run the production build

```bash
npm run build
npm start
```

Default URL:

```text
http://localhost:3712
```

You can override the server port with `PORT`:

```bash
PORT=3812 npm start
```

## First-run setup

1. Open **Settings**.
2. Configure your tool profiles for Cursor, Claude, and Codex.
3. Set a working directory for the repository or workspace you want the agents to operate on.
4. Create a pipeline or start from a template.
5. Run it and inspect the live activity stream.

AgentCadence stores local app data under:

```text
~/.agentcadence
```

That includes pipelines, templates, schedules, webhook definitions, CLI profile data, and other persisted runtime state.

## How it works

Each pipeline is composed of stages, and each stage contains one or more steps.
Stages can run sequentially, while steps inside a stage can run sequentially or in parallel depending on the stage mode.

Each step can:

- use a selected tool and model
- provide a natural-language prompt
- optionally override execution with a custom shell command
- retry on failure based on configured policy
- emit live transcript events and raw terminal output

## Project highlights

### Transcript-first monitoring

The execution monitor is designed around a readable activity stream rather than a wall of tool events.
High-signal narration stays prominent, while lower-value command activity and file edits can be grouped or expanded on demand.

### Built-in automation surfaces

Automation lives inside Settings and includes:

- pipeline schedules
- webhook-triggered runs
- callback and post-action bindings

This keeps one-off runs and recurring triggers in the same product surface.

### Template and insight workflows

You can save pipelines as templates, import or export template markdown, and inspect usage and run history from the built-in insights view.

## Development

Useful commands:

```bash
npm run dev
npm run build
npm run test
npm run test:harness
```

> [!IMPORTANT]
> The required test gate for this repository is `bash scripts/harness.sh`.
> A change is not considered verified until that script passes.

The harness covers:

- client and server production build
- server startup on a free port
- `node-pty` spawn-helper validation
- Playwright streaming checks for both shell-command steps and the default Cursor tool execution path

## Repository layout

```text
src/client        React UI
src/server        Express routes and execution services
src/shared        Shared types and merge logic
scripts           Harness, E2E helpers, and developer utilities
docs              Demo assets and docs
```

## Notes

- New detailed history playback is available for runs created after the recent execution-history persistence updates.
- The browser UI is just the control plane. All CLI execution, environment detection, and local filesystem access happen on the server host.
- If a CLI works in your terminal but not in AgentCadence, check the corresponding profile in Settings first.
