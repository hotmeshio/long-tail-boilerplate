/**
 * 12-bambu — the Bambu virtual farm proof.
 *
 * Plays acme-mono's `virtual` dispatch adapter against a small fleet of
 * `bambuPrinter` workflows and proves the full event language end to end:
 *
 *   m0  ok           → job_start, job_finished, printer_ready (the happy plate)
 *   m1  job_failed   → job_start, job_failed (hms code) … then a clean recovery
 *                      run on the SAME machine (lastOutcome facet = 'failed')
 *   m2  job_rejected → job_rejected (1053) … machine re-advertises, powered down
 *   m3  silent       → job_start, then the machine goes dark (wentDark: true) —
 *                      no finish, no ready, no further adverts: the watchdog case
 *
 * Dispatch is resolving a machine's ready advert with the Acme-shaped IoT
 * payload — exactly what Acme's VirtualPrintFarmAdapter will do via
 * `resolveByMetadata`. Assertions read each machine's returned run history.
 *
 * Run:  npm run bambu:demo            (local, requires docker compose up + seed)
 *       REMOTE_URL=… 12-bambu.ts      (AWS)
 */

import { login, api, sleep, ts } from './07-shared';
import {
  BAMBU_FACETS,
  MACHINE_STATE,
  BAMBU_WORKFLOWS,
  BAMBU_DISPATCH_ERRORS,
  type BambuJobPayload,
  type BambuPrinterResult,
} from '../../src/workflows/bambu-farm/types';

const RUN_ID = process.env.RUN_ID || Math.floor(Date.now() / 1000).toString();
const PRINT_SECONDS = parseInt(process.env.PRINT_SECONDS || '2', 10);
const POLL_MS = 1_000;
const WAIT_TIMEOUT_MS = parseInt(process.env.WAIT_TIMEOUT_MS || '90000', 10);

const failures: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`[${ts()}]   ✓ ${label}`);
  else {
    console.error(`[${ts()}]   ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(label);
  }
}

interface Machine {
  index: number;
  workflowId: string;
  deviceId: string;
  machineName: string;
}

function fleet(): Machine[] {
  return [0, 1, 2, 3].map((i) => ({
    index: i,
    workflowId: `bambu-${RUN_ID}-m${i}`,
    deviceId: `VIRT-${RUN_ID}-${i}`,
    machineName: `virtual-${i}`,
  }));
}

async function startMachine(m: Machine): Promise<void> {
  await api('POST', `/api/workflows/${BAMBU_WORKFLOWS.PRINTER}/invoke`, {
    workflowId: m.workflowId,
    data: { deviceId: m.deviceId, machineName: m.machineName, maxRuns: 10 },
  });
  console.log(`[${ts()}] started ${m.machineName} (${m.deviceId}) as ${m.workflowId}`);
}

/** Find the machine's pending ready advert (by its namespaced facet). */
async function findReadyAdvert(m: Machine): Promise<any | null> {
  const resp = await api('GET', '/api/escalations?status=pending&limit=100&sort_by=created_at&order=desc');
  const escs = resp?.escalations || [];
  return (
    escs.find(
      (e: any) =>
        e.metadata?.[BAMBU_FACETS.MACHINE] === m.deviceId &&
        e.metadata?.[BAMBU_FACETS.STATE] === MACHINE_STATE.READY,
    ) ?? null
  );
}

async function waitForReadyAdvert(m: Machine, expectRun?: number): Promise<any> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const advert = await findReadyAdvert(m);
    if (advert && (expectRun === undefined || advert.metadata?.[BAMBU_FACETS.RUN] === expectRun)) return advert;
    await sleep(POLL_MS);
  }
  throw new Error(`no ready advert for ${m.deviceId}${expectRun !== undefined ? ` (run ${expectRun})` : ''} within ${WAIT_TIMEOUT_MS}ms`);
}

/** Dispatch = resolve the ready advert with the Acme-shaped payload. */
async function dispatch(m: Machine, payload: BambuJobPayload): Promise<void> {
  const advert = await waitForReadyAdvert(m);
  await api('POST', `/api/escalations/${advert.id}/resolve`, { resolverPayload: payload });
  const mode = payload.powerdown ? 'powerdown' : payload.simulate?.mode ?? 'ok';
  console.log(`[${ts()}] dispatched ${mode} → ${m.machineName}`);
}

function job(m: Machine, simulate?: BambuJobPayload['simulate']): BambuJobPayload {
  return {
    command: {
      deviceId: m.deviceId,
      fileName: `plate_${m.index}.gcode.3mf`,
      folderName: m.machineName,
      presignedUrl: `https://example.local/gcode/${RUN_ID}/${m.index}`,
    },
    ...(simulate ? { simulate: { printSeconds: PRINT_SECONDS, collectSeconds: 1, ...simulate } } : { simulate: { mode: 'ok', printSeconds: PRINT_SECONDS, collectSeconds: 1 } }),
  };
}

async function waitForResult(m: Machine): Promise<BambuPrinterResult> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const r = await api('GET', `/api/workflows/${m.workflowId}/result`);
      if (r?.result?.type === 'return') return r.result.data as BambuPrinterResult;
    } catch {
      /* still running or transiently unavailable */
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${m.workflowId} did not complete within ${WAIT_TIMEOUT_MS}ms`);
}

async function main() {
  console.log(`[${ts()}] 12-bambu — RUN_ID ${RUN_ID}`);
  await login();

  const [m0, m1, m2, m3] = fleet();

  // ── Power on: four machines, four fates ─────────────────────────────────
  for (const m of [m0, m1, m2, m3]) await startMachine(m);

  // ── Wave 1: one directive per machine ───────────────────────────────────
  await dispatch(m0, job(m0));
  await dispatch(m1, job(m1, { mode: 'job_failed', hmsCode: '0500-0100-0003-0002' }));
  await dispatch(m2, job(m2, { mode: 'job_rejected', bambuErrorCode: BAMBU_DISPATCH_ERRORS.INVALID_FILAMENT }));
  await dispatch(m3, job(m3, { mode: 'silent' }));

  // ── m1 recovery: the failed machine re-advertises with lastOutcome=failed;
  //    a clean job on the same machine proves the loop absorbs failure. ─────
  const m1Advert = await waitForReadyAdvert(m1, 1);
  check('m1 re-advertises after failure', true);
  check(
    "m1 advert carries lastOutcome='failed'",
    m1Advert.metadata?.[BAMBU_FACETS.LAST_OUTCOME] === 'failed',
    JSON.stringify(m1Advert.metadata),
  );
  await dispatch(m1, job(m1));

  // ── m2 re-advertises after rejection (plate never dirtied) ──────────────
  const m2Advert = await waitForReadyAdvert(m2, 1);
  check(
    "m2 advert carries lastOutcome='rejected'",
    m2Advert.metadata?.[BAMBU_FACETS.LAST_OUTCOME] === 'rejected',
    JSON.stringify(m2Advert.metadata),
  );

  // ── Power down the survivors so their stories close ──────────────────────
  await sleep((PRINT_SECONDS + 2) * 1000); // let m0/m1 clear their plates
  for (const m of [m0, m1, m2]) await dispatch(m, { powerdown: true } as BambuJobPayload);

  // ── Verdicts: each machine's run history is its story ────────────────────
  const r0 = await waitForResult(m0);
  check('m0 happy path: one run', r0.runs === 1, `runs=${r0.runs}`);
  check(
    'm0 events: job_start → job_finished → printer_ready',
    JSON.stringify(r0.history[0]?.events) === JSON.stringify(['job_start', 'job_finished', 'printer_ready']),
    JSON.stringify(r0.history),
  );

  const r1 = await waitForResult(m1);
  check('m1 two runs (fail, then clean)', r1.runs === 2, `runs=${r1.runs}`);
  check(
    'm1 run 0 failed with the injected hms code',
    r1.history[0]?.outcome === 'failed' && r1.history[0]?.hmsCode === '0500-0100-0003-0002',
    JSON.stringify(r1.history[0]),
  );
  check(
    'm1 run 1 recovered clean',
    r1.history[1]?.outcome === 'success' &&
      JSON.stringify(r1.history[1]?.events) === JSON.stringify(['job_start', 'job_finished', 'printer_ready']),
    JSON.stringify(r1.history[1]),
  );

  const r2 = await waitForResult(m2);
  check(
    'm2 rejected at the door with 1053',
    r2.history[0]?.outcome === 'rejected' && r2.history[0]?.bambuErrorCode === BAMBU_DISPATCH_ERRORS.INVALID_FILAMENT,
    JSON.stringify(r2.history[0]),
  );
  check('m2 rejection consumed no plate: events = [job_rejected]', JSON.stringify(r2.history[0]?.events) === JSON.stringify(['job_rejected']));

  const r3 = await waitForResult(m3);
  check('m3 went dark (wentDark: true)', r3.wentDark === true, JSON.stringify(r3));
  check(
    'm3 silence: job_start then nothing, ever',
    r3.history[0]?.outcome === 'dark' && JSON.stringify(r3.history[0]?.events) === JSON.stringify(['job_start']),
    JSON.stringify(r3.history[0]),
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  if (failures.length) {
    console.error(`\n[${ts()}] FAIL — ${failures.length} assertion(s):\n  - ${failures.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`\n[${ts()}] PASS — the virtual farm speaks fluent Bambu: happy, failed+recovered, rejected, dark.`);
}

main().catch((err) => {
  console.error(`[${ts()}] 12-bambu error:`, err.message || err);
  process.exit(1);
});
