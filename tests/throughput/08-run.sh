#!/usr/bin/env bash
#
# 08-run — Single-command orchestrator for the ortho pipeline simulation.
#
# Spawns the enqueuer, captures its RUN_ID, then launches all 4 day
# resolvers as background processes sharing the same config.
#
# All output is prefixed with [enqueue], [day1], etc. for readability.
# Ctrl-C kills everything.
#
# Env vars (all optional, sensible defaults):
#   DAILY_VOLUME      — orders per day (default 500)
#   BASELINE_HOURS    — simulated day length in hours (default 8)
#   COMPRESSION_HOURS — compressed window in hours (default 1)
#   BATCHES           — number of batches (default 5)
#   PRINTER_SETS      — printer sets per order (default 3)
#   MIN_HOLD_S        — min seconds before resolving (default 5)
#
# Usage:
#   npm run ortho:run
#   DAILY_VOLUME=16 BASELINE_HOURS=1 COMPRESSION_HOURS=0.1 BATCHES=2 PRINTER_SETS=1 npm run ortho:run
#

set -euo pipefail

# Pass through all env vars to children
export DAILY_VOLUME="${DAILY_VOLUME:-500}"
export BASELINE_HOURS="${BASELINE_HOURS:-8}"
export COMPRESSION_HOURS="${COMPRESSION_HOURS:-1}"
export BATCHES="${BATCHES:-5}"
export PRINTER_SETS="${PRINTER_SETS:-3}"
export MIN_HOLD_S="${MIN_HOLD_S:-5}"

PIDS=()

cleanup() {
  echo ""
  echo "[orchestrator] Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
  echo "[orchestrator] Done."
  exit 0
}

trap cleanup SIGINT SIGTERM

# Step 1: Run enqueuer, capture RUN_ID from its output
echo "[orchestrator] Starting enqueuer to capture RUN_ID..."

# Start enqueuer, tee output, and extract RUN_ID from the manifest
ENQUEUE_LOG=$(mktemp)
npx ts-node tests/throughput/08-enqueue.ts 2>&1 | tee "$ENQUEUE_LOG" | sed 's/^/[enqueue] /' &
ENQUEUE_PID=$!
PIDS+=($ENQUEUE_PID)

# Wait for RUN_ID to appear in the log
RUN_ID=""
for i in $(seq 1 60); do
  if [ -f "$ENQUEUE_LOG" ]; then
    RUN_ID=$(grep -o 'RUN_ID=[0-9]*' "$ENQUEUE_LOG" 2>/dev/null | head -1 | cut -d= -f2)
    if [ -n "$RUN_ID" ]; then
      break
    fi
  fi
  sleep 0.5
done

if [ -z "$RUN_ID" ]; then
  echo "[orchestrator] ERROR: Could not capture RUN_ID from enqueuer"
  cleanup
  exit 1
fi

echo ""
echo "[orchestrator] ════════════════════════════════════════"
echo "[orchestrator] RUN_ID=$RUN_ID"
echo "[orchestrator] Launching day resolvers..."
echo "[orchestrator] ════════════════════════════════════════"
echo ""

export RUN_ID

# Step 2: Launch day resolvers
for day in 1 2 3 4; do
  DAY=$day npx ts-node tests/throughput/08-day-resolver.ts 2>&1 | sed "s/^/[day${day}] /" &
  PIDS+=($!)
  echo "[orchestrator] Day $day resolver started (PID $!)"
done

echo ""
echo "[orchestrator] All processes running. Ctrl-C to stop."
echo ""

# Wait for enqueuer to finish, then wait for resolvers
wait $ENQUEUE_PID 2>/dev/null || true
echo "[orchestrator] Enqueuer finished. Resolvers still running..."

# Wait for all remaining
wait 2>/dev/null || true
