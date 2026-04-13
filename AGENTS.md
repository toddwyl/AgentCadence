# Agent guidance

## Mandatory test gate: `scripts/harness.sh`

**A change set is not considered to have passing tests until `scripts/harness.sh` completes successfully (exit code 0).**

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

### Notes

- `npx playwright install chromium` is invoked by the harness; the first run may download browsers.
- Other scripts (`test:smoke`, `test:e2e-run`) complement this gate but **do not replace** the harness: they do not validate the UI + streaming WebSocket behavior together.
- After each build, the harness runs **`scripts/fix-node-pty-spawn-helper.mjs`** (same as `npm` **postinstall**) so `node-pty`’s `spawn-helper` is executable — without this, macOS often reports **`posix_spawnp failed`** (see [node-pty#850](https://github.com/microsoft/node-pty/issues/850)). It then runs **`scripts/e2e-harness-pty-probe.mjs`**, which calls **`CLIRunner.runPTY`** for both a `zsh -lc` probe and a direct `/bin/echo` probe. The two Playwright scripts above validate end-to-end WebSocket streaming for both execution paths.
