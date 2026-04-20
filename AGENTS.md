# Agent guidance

## Mandatory test gate: `scripts/harness.sh`

**Code-affecting changes are not considered to have passing tests until `scripts/harness.sh` completes successfully (exit code 0).**

### When the harness gate is required

Run `scripts/harness.sh` for any change that can affect runtime behavior, build output, server/client logic, CLI behavior, streaming behavior, dependency wiring, or test infrastructure.

### When the harness gate is not required

If the change is documentation-only and does not affect shipped code or tests, the harness gate may be skipped. This includes files such as:

- `README.md`
- `README.zh-CN.md`
- `docs/**`
- `AGENTS.md`

If a documentation change also modifies code snippets, scripts, configuration, or executable examples in a way that should stay runnable, treat it as code-affecting and run the harness.

This script:

1. Builds the client and server (`npm run build`, unless `SKIP_BUILD=1`).
2. Starts the production server (`node dist/server/index.js`). If `PORT` is unset, the harness picks a **free TCP port** (avoids clashing with a dev server on `3712`). Set `PORT=3712` (or any port) to pin it; if that port is busy, the harness **fails fast** instead of silently testing another process.
3. Waits for the port to accept connections.
4. Runs **Playwright** streaming checks against `AGENTCADENCE_BASE_URL` (default matches the chosen `PORT`):
   - **`scripts/e2e-harness-stream.mjs`** — custom shell `command` path (`CommandRunner` / non–cursor-tool default): multi-line `sh` loop, marker `AC_HARNESS_LINE_10`, ≥3 `step_output` frames before `pipeline_run_finished`.
   - **`scripts/e2e-harness-cursor-tool-stream.mjs`** — **default Cursor step** (no `command` field): temporarily sets `profile.cursor.executable` to **`scripts/harness-cursor-agent-stub.sh`**, which mimics argv like real `cursor-agent` but only streams lines; asserts ≥3 `step_output` frames and marker **`AC_CURSOR_AGENT_STREAM_10`** (covers **`tool-runner` → `runPTY`** — the path used when you click Run on a normal Cursor agent step). Restores the saved profile afterward.

### Commands

```bash
# Full gate (recommended for CI / pre-merge)
bash scripts/harness.sh

# Faster iteration after a successful build
SKIP_BUILD=1 bash scripts/harness.sh

# Debug browser (non-headless)
HARNESS_HEADED=1 SKIP_BUILD=1 bash scripts/harness.sh
```

### npm script

```bash
npm run test:harness
```

`npm run test:harness` is only a convenience alias for `bash scripts/harness.sh`. You do not need to run both; either one is sufficient.

## Preferred development workflow

For implementation work, prefer this order unless the task is small enough that the overhead would clearly outweigh the benefit:

1. Create an isolated git worktree first.
2. Execute work with subagent-driven development when tasks can be decomposed clearly.
3. Follow TDD inside each implementation task: write the failing test first, verify the failure, then write the minimal code to pass.

### Workflow expectations

- Prefer isolated work on a non-main branch, ideally in a dedicated worktree.
- Prefer subagent-driven execution for multi-step or decomposable work; use the main agent as coordinator/reviewer.
- Prefer TDD for code changes and bug fixes; do not write production code before a failing test unless the user explicitly asks for an exception.
- For documentation-only changes, keep the process lightweight and skip harness unless the docs change executable behavior or verification expectations.

### Notes

- `npx playwright install chromium` is invoked by the harness; the first run may download browsers.
- Other scripts (`test:smoke`, `test:e2e-run`) complement this gate but **do not replace** the harness: they do not validate the UI + streaming WebSocket behavior together.
- After each build, the harness runs **`scripts/fix-node-pty-spawn-helper.mjs`** (same as `npm` **postinstall**) so `node-pty`’s `spawn-helper` is executable — without this, macOS often reports **`posix_spawnp failed`** (see [node-pty#850](https://github.com/microsoft/node-pty/issues/850)). It then runs **`scripts/e2e-harness-pty-probe.mjs`**, which calls **`CLIRunner.runPTY`** for both a `zsh -lc` probe and a direct `/bin/echo` probe. The two Playwright scripts above validate end-to-end WebSocket streaming for both execution paths.
