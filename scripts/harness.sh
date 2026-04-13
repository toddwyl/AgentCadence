#!/usr/bin/env bash
# AgentCadence mandatory E2E gate: build → serve → browser run → streaming WebSocket proof.
# See AGENTS.md: changes are not considered passing tests until this script exits 0.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_BUILD="${SKIP_BUILD:-0}"

# Avoid EADDRINUSE when dev already listens on 3712: use a free port unless PORT is set explicitly.
if [[ -z "${PORT:-}" ]]; then
  PORT="$(node -e "const n=require('net');const s=n.createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close();});")"
fi
export PORT
export AGENTCADENCE_BASE_URL="${AGENTCADENCE_BASE_URL:-http://127.0.0.1:${PORT}}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "[harness] npm run build"
  npm run build
fi

echo "[harness] node-pty spawn-helper permissions + runPTY probe (same code path as Cursor steps)"
node scripts/fix-node-pty-spawn-helper.mjs
node scripts/e2e-harness-pty-probe.mjs

echo "[harness] starting server on port ${PORT} (set PORT= to pin a port; empty PORT picks a free one)"
PORT="$PORT" node dist/server/index.js &
SERVER_PID=$!

if ! command -v npx >/dev/null 2>&1; then
  echo "[harness] ERROR: npx not found" >&2
  exit 1
fi

# If the port was already in use, node exits immediately but wait-on would still succeed.
sleep 0.4
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "[harness] ERROR: server process exited immediately (EADDRINUSE on PORT=${PORT}? try unset PORT for a free port)" >&2
  wait "$SERVER_PID" 2>/dev/null || true
  exit 1
fi

echo "[harness] waiting for tcp:${PORT}"
npx wait-on "tcp:${PORT}" --timeout 120000

echo "[harness] ensuring Playwright Chromium is installed (one-time download if missing)"
npx playwright install chromium

echo "[harness] browser E2E: shell custom command streaming (WebSocket)"
node scripts/e2e-harness-stream.mjs --base "$AGENTCADENCE_BASE_URL"

echo "[harness] browser E2E: default Cursor tool runPTY streaming (stub as cursor.executable)"
node scripts/e2e-harness-cursor-tool-stream.mjs --base "$AGENTCADENCE_BASE_URL"

echo "[harness] OK"
