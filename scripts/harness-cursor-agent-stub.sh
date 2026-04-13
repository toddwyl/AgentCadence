#!/usr/bin/env bash
# Receives the same argv shape as real cursor-agent (--trust, --model, -p, …) but only streams
# lines for harness; no network. Used as profile.cursor.executable during e2e-harness-cursor-tool-stream.mjs.
set -euo pipefail
i=1
while [ "$i" -le 10 ]; do
  echo "AC_CURSOR_AGENT_STREAM_$i"
  sleep 0.3
  i=$((i + 1))
done
exit 0
