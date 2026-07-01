#!/usr/bin/env bash
#
# 10-farm — Single-command orchestrator for the print-routing farm simulation.
#
# The two convergent surfaces of the farm, driven as two processes:
#   [supply]  the printer fleet + the autonomous crew (broker/technician/inspector)
#   [demand]  waves of orders that need printing
#
# It powers on supply, waits for the "SUPPLY READY" sentinel (capturing RUN_ID),
# releases demand, then waits for demand to converge. Demand owns the pass/fail
# gate (exit 0 = every order printed & signed off). When demand finishes, supply
# is torn down (its crew also self-terminates on idle). Ctrl-C kills everything.
#
# Env vars (all optional, sensible defaults):
#   FLEET_SIZE         — printers in the fleet (default 2)
#   DAILY_VOLUME       — total orders (default 12)
#   BATCHES            — order waves (default 2)
#   WAVE_GAP_S         — seconds between waves (default 5; the pressure-gradient knob)
#   COMPRESSION_HOURS  — alt: spread all waves across this window (ortho-style compression)
#   DIABETIC           — 1 to run the diabetic fleet (default standard)
#   RESET              — 1 to power down idling printers from a prior run before starting
#
# Capacity rule: FLEET_SIZE × 10 (EOL runs) must exceed DAILY_VOLUME or demand
# stalls once the fleet retires. Seed operators first: npm run print:seed
#
# Usage:
#   npm run print:run
#   FLEET_SIZE=6 DAILY_VOLUME=50 BATCHES=5 npm run print:run

set -euo pipefail

export FLEET_SIZE="${FLEET_SIZE:-2}"
export DAILY_VOLUME="${DAILY_VOLUME:-12}"
export BATCHES="${BATCHES:-2}"
export DIABETIC="${DIABETIC:-}"
# Pacing: pass WAVE_GAP_S or COMPRESSION_HOURS straight through if set; otherwise
# 10-shared defaults the wave gap to a brisk 5s so small runs aren't silent.
if [ -n "${WAVE_GAP_S:-}" ]; then export WAVE_GAP_S; fi
if [ -n "${COMPRESSION_HOURS:-}" ]; then export COMPRESSION_HOURS; fi
if [ -n "${MAX_ADVERTS:-}" ]; then export MAX_ADVERTS; fi
if [ -n "${CONDITION_CHUNK_SIZE:-}" ]; then
  if [ "$CONDITION_CHUNK_SIZE" -gt 20 ]; then
    echo "[farm] ERROR: CONDITION_CHUNK_SIZE=$CONDITION_CHUNK_SIZE exceeds the durable workflow Promise.all limit of 20." >&2
    exit 1
  fi
  export CONDITION_CHUNK_SIZE
fi

# One shared RUN_ID isolates this run's fleet + orders.
export RUN_ID="${RUN_ID:-$(date +%s)}"

TS_NODE="npx ts-node"
PIDS=()

cleanup() {
  echo ""
  echo "[farm] Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "[farm] Done."
}
trap cleanup SIGINT SIGTERM EXIT

echo "[farm] ════════════════════════════════════════"
echo "[farm] RUN_ID=$RUN_ID  fleet=$FLEET_SIZE  orders=$DAILY_VOLUME  waves=$BATCHES"
echo "[farm] ════════════════════════════════════════"

# Optional reset: power down idling printers from a prior run so they don't
# pollute this run's supply pool. Without this, old printers sitting on
# pending `ready` adverts would be found and claimed by the new broker.
if [ "${RESET:-}" = "1" ]; then
  echo "[farm] RESET=1 — powering down idling printers from prior run..."
  $TS_NODE tests/throughput/10-reset.ts
  echo ""
fi

echo "[farm] Powering on supply surface..."

# Step 1: Start supply, tee output, wait for the SUPPLY READY sentinel.
SUPPLY_LOG=$(mktemp)
$TS_NODE tests/throughput/10-supply.ts 2>&1 | tee "$SUPPLY_LOG" &
SUPPLY_PID=$!
PIDS+=($SUPPLY_PID)

READY=""
for i in $(seq 1 120); do
  if grep -q 'SUPPLY READY' "$SUPPLY_LOG" 2>/dev/null; then READY="1"; break; fi
  if ! kill -0 "$SUPPLY_PID" 2>/dev/null; then
    echo "[farm] ERROR: supply exited before becoming ready"; exit 1
  fi
  sleep 0.5
done
if [ -z "$READY" ]; then echo "[farm] ERROR: supply never became ready"; exit 1; fi

echo ""
echo "[farm] Supply ready. Releasing demand..."
echo ""

# Step 2: Run demand in the foreground — it owns the convergence gate.
set +e
$TS_NODE tests/throughput/10-demand.ts 2>&1
DEMAND_RC=$?
set -e

echo ""
if [ "$DEMAND_RC" -eq 0 ]; then
  echo "[farm] ✓ Farm converged — every order printed and signed off."
else
  echo "[farm] ✗ Farm did NOT converge (demand exit $DEMAND_RC). Check capacity / supply log above."
fi

# cleanup() runs on EXIT and tears down supply.
exit "$DEMAND_RC"
