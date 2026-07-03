/**
 * 13-bambu-pressure — the virtual farm at scale, with failure injection on.
 *
 * FLEET_SIZE machines each work ROUNDS dispatch rounds. Every (machine, round)
 * gets a DETERMINISTIC directive (no randomness — the run is reproducible and
 * the assertions exact):
 *
 *   (i + r) % 5 === 1   → job_failed  (20% — hms code, machine re-advertises)
 *   (i + r) % 20 === 3  → job_rejected (5% — 1053 at the door, plate untouched)
 *   otherwise           → ok           (job_start → job_finished → printer_ready)
 *
 * Every dispatch round drains from one shared poll of the pending pond — the
 * same scan-and-resolve motion Acme's virtual dispatch adapter performs. At the
 * end each machine is powered down and its returned run history is checked
 * against the plan, outcome by outcome. The proof: under sustained pressure
 * with failures injected, nothing is lost, nothing double-runs, and every
 * machine's story matches intent exactly.
 *
 * Run:  npm run bambu:pressure                        (local: 10 × 3)
 *       FLEET_SIZE=40 ROUNDS=3 npm run bambu:remote:pressure   (AWS)
 */

import { login, api, sleep, ts } from './07-shared';
import {
  BAMBU_FACETS,
  MACHINE_STATE,
  BAMBU_WORKFLOWS,
  BAMBU_DISPATCH_ERRORS,
  type BambuJobPayload,
  type BambuPrinterResult,
  type RunOutcome,
} from '../../src/workflows/bambu-farm/types';

const RUN_ID = process.env.RUN_ID || Math.floor(Date.now() / 1000).toString();
const FLEET_SIZE = parseInt(process.env.FLEET_SIZE || '10', 10);
const ROUNDS = parseInt(process.env.ROUNDS || '3', 10);
const PRINT_SECONDS = parseInt(process.env.PRINT_SECONDS || '1', 10);
const POLL_MS = 1_000;
const ROUND_TIMEOUT_MS = parseInt(process.env.ROUND_TIMEOUT_MS || '120000', 10);
const PAGE_LIMIT = 500;

interface Machine {
  index: number;
  workflowId: string;
  deviceId: string;
  machineName: string;
}

type PlannedMode = 'ok' | 'job_failed' | 'job_rejected';

/** The deterministic directive for (machine, round) — the test's intent. */
function plannedMode(i: number, r: number): PlannedMode {
  if ((i + r) % 20 === 3) return 'job_rejected';
  if ((i + r) % 5 === 1) return 'job_failed';
  return 'ok';
}

/** What the machine's history should record for a planned mode. */
function plannedOutcome(mode: PlannedMode): RunOutcome {
  return mode === 'ok' ? 'success' : mode === 'job_failed' ? 'failed' : 'rejected';
}

function fleet(): Machine[] {
  return Array.from({ length: FLEET_SIZE }, (_, i) => ({
    index: i,
    workflowId: `bambup-${RUN_ID}-m${i}`,
    deviceId: `VIRTP-${RUN_ID}-${i}`,
    machineName: `pressure-${i}`,
  }));
}

function job(m: Machine, r: number): BambuJobPayload {
  const mode = plannedMode(m.index, r);
  return {
    command: {
      deviceId: m.deviceId,
      fileName: `plate_${m.index}_r${r}.gcode.3mf`,
      folderName: m.machineName,
      presignedUrl: `https://example.local/gcode/${RUN_ID}/${m.index}/${r}`,
    },
    simulate: {
      mode,
      printSeconds: PRINT_SECONDS,
      collectSeconds: 1,
      ...(mode === 'job_failed' ? { hmsCode: '0500-0100-0003-0002' } : {}),
      ...(mode === 'job_rejected' ? { bambuErrorCode: BAMBU_DISPATCH_ERRORS.INVALID_FILAMENT } : {}),
    },
  };
}

/** One shared poll of the pending pond → machines whose run-`r` advert is up. */
async function pendingAdverts(byDevice: Map<string, Machine>, run: number): Promise<Map<string, any>> {
  const resp = await api('GET', `/api/escalations?status=pending&limit=${PAGE_LIMIT}&sort_by=created_at&order=desc`);
  const out = new Map<string, any>();
  for (const e of resp?.escalations || []) {
    const device = e.metadata?.[BAMBU_FACETS.MACHINE];
    if (!device || !byDevice.has(device)) continue;
    if (e.metadata?.[BAMBU_FACETS.STATE] !== MACHINE_STATE.READY) continue;
    if (e.metadata?.[BAMBU_FACETS.RUN] !== run) continue;
    out.set(device, e);
  }
  return out;
}

async function main() {
  console.log(`[${ts()}] 13-bambu-pressure — RUN_ID ${RUN_ID}, fleet ${FLEET_SIZE}, rounds ${ROUNDS}`);
  const t0 = Date.now();
  await login();

  const machines = fleet();
  const byDevice = new Map(machines.map((m) => [m.deviceId, m]));

  // ── Power on the fleet ────────────────────────────────────────────────────
  await Promise.all(
    machines.map((m) =>
      api('POST', `/api/workflows/${BAMBU_WORKFLOWS.PRINTER}/invoke`, {
        workflowId: m.workflowId,
        data: { deviceId: m.deviceId, machineName: m.machineName, maxRuns: ROUNDS + 1 },
      }),
    ),
  );
  console.log(`[${ts()}] fleet of ${FLEET_SIZE} powered on`);

  // ── Dispatch rounds: drain each round from a shared poll ─────────────────
  let dispatched = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const remaining = new Set(machines.map((m) => m.deviceId));
    const deadline = Date.now() + ROUND_TIMEOUT_MS;
    while (remaining.size) {
      if (Date.now() > deadline) throw new Error(`round ${r}: ${remaining.size} machines never advertised`);
      const ready = await pendingAdverts(byDevice, r);
      const batch = [...ready.entries()].filter(([device]) => remaining.has(device));
      await Promise.all(
        batch.map(async ([device, advert]) => {
          const m = byDevice.get(device)!;
          await api('POST', `/api/escalations/${advert.id}/resolve`, { resolverPayload: job(m, r) });
          remaining.delete(device);
          dispatched++;
        }),
      );
      if (remaining.size) await sleep(POLL_MS);
    }
    console.log(`[${ts()}] round ${r}: ${FLEET_SIZE} dispatched (total ${dispatched})`);
  }

  // ── Power down: drain the final adverts ───────────────────────────────────
  {
    const remaining = new Set(machines.map((m) => m.deviceId));
    const deadline = Date.now() + ROUND_TIMEOUT_MS;
    while (remaining.size) {
      if (Date.now() > deadline) throw new Error(`powerdown: ${remaining.size} machines never re-advertised`);
      const ready = await pendingAdverts(byDevice, ROUNDS);
      const batch = [...ready.entries()].filter(([device]) => remaining.has(device));
      await Promise.all(
        batch.map(async ([device, advert]) => {
          await api('POST', `/api/escalations/${advert.id}/resolve`, { resolverPayload: { powerdown: true } });
          remaining.delete(device);
        }),
      );
      if (remaining.size) await sleep(POLL_MS);
    }
  }
  console.log(`[${ts()}] fleet powered down — collecting verdicts`);

  // ── Verdicts: every machine's history must match the plan exactly ────────
  let failures = 0;
  let checkedRuns = 0;
  const tally: Record<RunOutcome, number> = { success: 0, failed: 0, rejected: 0, dark: 0 };

  const results = await Promise.all(
    machines.map(async (m): Promise<BambuPrinterResult> => {
      const deadline = Date.now() + ROUND_TIMEOUT_MS;
      while (Date.now() < deadline) {
        try {
          const resp = await api('GET', `/api/workflows/${m.workflowId}/result`);
          if (resp?.result?.type === 'return') return resp.result.data as BambuPrinterResult;
        } catch { /* still finishing */ }
        await sleep(POLL_MS);
      }
      throw new Error(`${m.workflowId} never completed`);
    }),
  );

  for (const m of machines) {
    const res = results[m.index]!;
    if (res.runs !== ROUNDS) {
      console.error(`[${ts()}]   ✗ ${m.machineName}: runs=${res.runs}, expected ${ROUNDS}`);
      failures++;
      continue;
    }
    for (let r = 0; r < ROUNDS; r++) {
      const want = plannedOutcome(plannedMode(m.index, r));
      const got = res.history[r]?.outcome;
      checkedRuns++;
      if (got !== want) {
        console.error(`[${ts()}]   ✗ ${m.machineName} run ${r}: outcome=${got}, planned ${want}`);
        failures++;
      } else {
        tally[got] += 1;
      }
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\n[${ts()}] ${FLEET_SIZE} machines × ${ROUNDS} rounds = ${checkedRuns} runs verified in ${elapsed}s ` +
      `(${(dispatched / ((Date.now() - t0) / 1000)).toFixed(2)} dispatches/s)\n` +
      `  outcomes: ${tally.success} success, ${tally.failed} failed (recovered), ${tally.rejected} rejected`,
  );
  if (failures) {
    console.error(`[${ts()}] FAIL — ${failures} mismatch(es) between plan and history`);
    process.exit(1);
  }
  console.log(`[${ts()}] PASS — under pressure with failures injected, every machine's story matches intent exactly.`);
}

main().catch((err) => {
  console.error(`[${ts()}] 13-bambu-pressure error:`, err.message || err);
  process.exit(1);
});
