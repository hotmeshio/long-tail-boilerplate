/**
 * 10-assert — functional correctness checks for the print farm, ported from the
 * source example's tests (print-routing*.test.ts) but driven over the public HTTP
 * API so they run against a live docker-compose app. Throughput-only: NOT part of
 * the CI integration glob, so the green baseline is untouched.
 *
 * Three invariants, each on its own isolated fleet/run:
 *   1. lifecycle/EOL — one printer drains 10 orders: retires at 10 runs / 3 refills,
 *      and its escalation trail is exactly 10 ready + 3 maintenance adverts.
 *   2. defect       — an order with a declared bad unit reprints once and converges
 *      (attempts === 2); clean orders converge in one pass.
 *   3. priority     — with equal deadlines and one printer (serialized), a key-account
 *      order that arrives mid-pack does not print last.
 *
 * Requires a CLEAN pool (like the source tests, which clear lt_escalations in
 * beforeAll): the broker matches across the whole printer pool by role, so stale
 * adverts from earlier runs cause cross-run contention. Run on a fresh DB:
 *   docker compose down -v && docker compose up -d --build
 *   docker compose exec app npm run seed && docker compose exec app npm run print:seed
 *   npm run print:assert
 *
 * (For everyday use, `npm run print:smoke` already exercises lifecycle + defect +
 * priority end to end and is far faster.)
 */

import { login, api, sleep, ts, operators, ensureSingleton } from './10-shared';
import {
  PRINT_WORKFLOWS,
  PRINT_ROUTING_QUEUE,
  PRINTER_POND,
  EOL_RUNS,
  REFILL_INTERVAL,
  fleetKind,
  ALL_PRINT_ROLES,
  type PrintOrderData,
  type PrinterData,
  type Side,
} from '../../src/workflows/print-routing/types';

const DIABETIC = false;
const KIND = fleetKind(DIABETIC);
const OP = operators(DIABETIC);
const RUN = process.env.RUN_ID || Math.floor(Date.now() / 1000).toString();
const ORDER_TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '600000', 10);
const REFILLS = Math.floor((EOL_RUNS - 1) / REFILL_INTERVAL);

let failures = 0;
function check(name: string, cond: boolean, detail: string) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name} — ${detail}`);
  if (!cond) failures++;
}

async function makeInvocable(workflowType: string) {
  await api('PUT', `/api/workflows/${workflowType}/config`, {
    invocable: true, task_queue: PRINT_ROUTING_QUEUE, default_role: 'reviewer',
  });
}
async function invoke(workflowType: string, workflowId: string, data: Record<string, any>, idempotent = false) {
  try {
    await api('POST', `/api/workflows/${workflowType}/invoke`, { data, workflowId });
  } catch (err: any) {
    if (!idempotent || !String(err?.message ?? '').includes('Duplicate')) throw err;
  }
}
async function result(workflowId: string): Promise<any | null> {
  try {
    const r = await api('GET', `/api/workflows/${workflowId}/result`);
    return r?.result?.type === 'return' ? r.result.data : null;
  } catch { return null; }
}

/** Cancel any lingering pending print escalations so each section runs on a clean pool. */
async function drainPending() {
  for (let pass = 0; pass < 3; pass++) {
    let found = 0;
    for (const role of ALL_PRINT_ROLES) {
      const resp = await api('GET', `/api/escalations?status=pending&role=${role}&limit=100`);
      for (const esc of resp?.escalations || []) {
        try { await api('POST', `/api/escalations/${esc.id}/cancel`, { reason: 'assert-isolate' }); found++; } catch { /* gone */ }
      }
    }
    if (found === 0) break;
    await sleep(1000);
  }
}

/**
 * Start ONE crew for the whole assert run. A single broker/technician/inspector
 * avoids competing brokers in the shared pool (the bug that stalls per-section
 * crews); a generous idle bound keeps them alive across all three serialized
 * sections, after which they self-terminate. Deep asserts assume a clean DB.
 */
async function startCrew() {
  const loop = { diabetic: DIABETIC, idleTickSeconds: 2, maxIdleRuns: 1200 };
  const fleetLabel = DIABETIC ? 'diabetic' : 'standard';
  await ensureSingleton(PRINT_WORKFLOWS.BROKER, 'broker-print', { ...loop, brokerId: OP.brokerId });
  await ensureSingleton(PRINT_WORKFLOWS.TECHNICIAN, `technician-print-${fleetLabel}`, { ...loop, technicianId: OP.technicianId });
  await ensureSingleton(PRINT_WORKFLOWS.INSPECTOR, `inspector-print-${fleetLabel}`, { ...loop, inspectorId: OP.inspectorId });
}

/** Start a section's printers and enqueue its orders — does NOT wait. The shared crew serves them. */
async function startFarm(_label: string, fleet: PrinterData[], orders: PrintOrderData[]) {
  for (const spec of fleet) await invoke(PRINT_WORKFLOWS.PRINTER, spec.printerId, { ...spec, operatorId: OP.printerOperatorId });
  for (const o of orders) await invoke(PRINT_WORKFLOWS.ORDER, o.orderId!, { ...o, operatorId: OP.ordererId });
}

/** Poll the given workflow ids until all return, or timeout. Returns results by id. */
async function awaitResults(label: string, ids: string[]) {
  const results = new Map<string, any>();
  const t0 = performance.now();
  while (results.size < ids.length) {
    await sleep(3000);
    for (const id of ids) {
      if (results.has(id)) continue;
      const r = await result(id);
      if (r) results.set(id, r);
    }
    console.log(`[assert:${label}] ${ts()} ${results.size}/${ids.length}`);
    if (performance.now() - t0 > ORDER_TIMEOUT_MS) throw new Error(`${label}: timeout (${results.size}/${ids.length})`);
  }
  return results;
}

function units(n: number): { side: Side }[] {
  return Array.from({ length: n }, (_, j) => ({ side: (j % 2 === 0 ? 'L' : 'R') as Side }));
}
function order(id: string, i: number, extra: Partial<PrintOrderData> = {}): PrintOrderData {
  const now = Date.now();
  return {
    orderId: id, diabetic: DIABETIC, customerId: `cust-${i}`,
    filament: 'pla', sizeClass: 'standard', units: units(4 + (i % 3)),
    approvedAt: now, mustCompleteBy: now + (i + 1) * 60_000, ...extra,
  };
}

// ── 1. Lifecycle / EOL ─────────────────────────────────────────────────────────
async function assertLifecycle() {
  console.log('\n[assert] 1. lifecycle/EOL — one printer drains 10 orders');
  await drainPending();
  const label = `eol-${RUN}`;
  const printerId = `${label}-printer`;
  const fleet: PrinterData[] = [{ printerId, diabetic: DIABETIC, filament: 'pla', sizeClass: 'standard' }];
  const orders = Array.from({ length: EOL_RUNS }, (_, i) => order(`${label}-o${i}`, i));

  await startFarm(label, fleet, orders);

  // The printer retiring is the true EOL signal — its advert trail is complete then.
  const printers = await awaitResults(label, [printerId]);
  const printer = printers.get(printerId);
  check('printer retired', !!printer?.retired, `retired=${printer?.retired}`);
  check('total runs', printer?.totalRuns === EOL_RUNS, `${printer?.totalRuns} (expected ${EOL_RUNS})`);
  check('refills', printer?.refills === REFILLS, `${printer?.refills} (expected ${REFILLS})`);

  const resp = await api('POST', '/api/escalations/search-by-facets', {
    role: PRINTER_POND[KIND], facets: { printerId }, limit: 200,
  });
  const adverts = resp?.escalations || [];
  const ready = adverts.filter((e: any) => e.metadata?.state === 'ready');
  const maint = adverts.filter((e: any) => e.metadata?.state === 'maintenance');
  check('ready adverts', ready.length === EOL_RUNS, `${ready.length} (expected ${EOL_RUNS})`);
  check('maintenance adverts', maint.length === REFILLS, `${maint.length} (expected ${REFILLS})`);
  check('all adverts resolved', adverts.length > 0 && adverts.every((e: any) => e.status === 'resolved'), `${adverts.length} adverts`);
}

// ── 2. Defect / convergence ─────────────────────────────────────────────────────
async function assertDefect() {
  console.log('\n[assert] 2. defect — a bad unit reprints once and converges');
  await drainPending();
  const label = `defect-${RUN}`;
  const fleet: PrinterData[] = [{ printerId: `${label}-printer`, diabetic: DIABETIC, filament: 'pla', sizeClass: 'standard' }];
  // 3 orders; the middle one has a unit the inspector rejects on first pass.
  const orders = [
    order(`${label}-o0`, 0),
    order(`${label}-o1`, 1, { failUnits: [2] }),
    order(`${label}-o2`, 2),
  ];
  await startFarm(label, fleet, orders);
  const results = await awaitResults(label, orders.map((o) => o.orderId!));

  const flawed = results.get(`${label}-o1`);
  const clean = results.get(`${label}-o0`);
  check('flawed order converged', flawed?.passed === true && flawed?.failedUnits?.length === 0, `passed=${flawed?.passed}`);
  check('flawed order reprinted', flawed?.attempts === 2, `attempts=${flawed?.attempts} (expected 2)`);
  check('clean order one pass', clean?.attempts === 1, `attempts=${clean?.attempts} (expected 1)`);
}

// ── 3. Priority ─────────────────────────────────────────────────────────────────
async function assertPriority() {
  console.log('\n[assert] 3. priority — a key-account order mid-pack does not print last');
  const label = `prio-${RUN}`;
  const fleet: PrinterData[] = [{ printerId: `${label}-printer`, diabetic: DIABETIC, filament: 'pla', sizeClass: 'standard' }];
  const now = Date.now();
  const deadline = now + 3_600_000; // equal deadlines so keyAccount, not jeopardy, decides
  const customers = ['walk-1', 'walk-2', 'kacct-1', 'walk-3', 'walk-4'];
  const orders = customers.map((customerId, i) => ({
    ...order(`${label}-o${i}-${customerId}`, i, { customerId, mustCompleteBy: deadline, approvedAt: now }),
  }));
  const keyOrderId = `${label}-o2-kacct-1`;

  await drainPending();
  await startFarm(label, fleet, orders);
  const results = await awaitResults(label, orders.map((o) => o.orderId!));
  // Rank by the printing handoff time: the key account should not be the last to print.
  const resp = await api('POST', '/api/escalations/search-by-facets', {
    role: PRINTER_POND[KIND], facets: { state: 'printing' }, status: 'resolved', limit: 200,
  });
  const printed = (resp?.escalations || [])
    .filter((e: any) => (e.metadata?.orderId || '').startsWith(label))
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((e: any) => e.metadata?.orderId);
  const keyRank = printed.indexOf(keyOrderId);
  check('all priority orders printed', results.size === orders.length, `${results.size}/${orders.length}`);
  check('key account not last', keyRank >= 0 && keyRank < printed.length - 1, `rank ${keyRank + 1}/${printed.length} [${printed.join(' → ')}]`);
}

async function main() {
  await login();
  for (const wf of Object.values(PRINT_WORKFLOWS)) await makeInvocable(wf);

  await startCrew(); // one shared crew for all sections

  await assertLifecycle();
  await assertDefect();
  await assertPriority();

  console.log(`\n[assert] ${'='.repeat(50)}`);
  console.log(failures === 0 ? '[assert] ✓ ALL CHECKS PASSED' : `[assert] ✗ ${failures} CHECK(S) FAILED`);
  console.log(`[assert] ${'='.repeat(50)}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error('[assert] failed:', err.message); process.exit(1); });
