/**
 * 10-supply — power on the SUPPLY surface of the print farm.
 *
 * Invokes the printer fleet + the autonomous crew (broker, technician, inspector),
 * then stays alive reporting fleet health (runs completed, machines retired) until
 * the orders drain or it's interrupted. The crew are durable looping workflows that
 * resolve escalations in-process as their seeded operators — the orchestrator just
 * starts them.
 *
 * Usage:
 *   npm run print:supply
 *   FLEET_SIZE=4 DIABETIC=1 npm run print:supply
 */

import {
  login, api, sleep, ts,
  RUN_ID, DIABETIC, FLEET_SIZE, EOL_RUNS,
  CREW_IDLE_TICK_S, CREW_MAX_IDLE, DEFAULT_MAX_ADVERTS,
  PRINT_ROUTING_QUEUE, PRINT_WORKFLOWS,
  buildFleet, operators, fleetSnapshot,
} from './10-shared';

/** Flip a registered (but non-invocable) workflow invocable so HTTP invoke works. */
async function makeInvocable(workflowType: string): Promise<void> {
  await api('PUT', `/api/workflows/${workflowType}/config`, {
    invocable: true,
    task_queue: PRINT_ROUTING_QUEUE,
    default_role: 'reviewer',
  });
}

async function invoke(workflowType: string, workflowId: string, data: Record<string, any>): Promise<void> {
  await api('POST', `/api/workflows/${workflowType}/invoke`, { data, workflowId });
}

async function main() {
  await login();

  const op = operators();
  const fleet = buildFleet();
  const loop = { diabetic: DIABETIC, idleTickSeconds: CREW_IDLE_TICK_S, maxIdleRuns: CREW_MAX_IDLE };
  const brokerCount = Math.ceil(FLEET_SIZE / DEFAULT_MAX_ADVERTS);

  console.log(`[supply] ${ts()} powering on ${FLEET_SIZE} printers + ${brokerCount} broker(s) + crew (kind=${DIABETIC ? 'diabetic' : 'standard'}, maxAdverts=${DEFAULT_MAX_ADVERTS}/broker)`);

  // 1. Make the supply workflows invocable over HTTP (kept non-invocable by default
  //    so only printShift clutters the dashboard).
  for (const wf of [PRINT_WORKFLOWS.PRINTER, PRINT_WORKFLOWS.BROKER, PRINT_WORKFLOWS.TECHNICIAN, PRINT_WORKFLOWS.INSPECTOR]) {
    await makeInvocable(wf);
  }

  // 2. Start the printers (each parks on a `ready` advert the broker resolves).
  for (const spec of fleet) {
    await invoke(PRINT_WORKFLOWS.PRINTER, spec.printerId, { ...spec, operatorId: op.printerOperatorId });
  }

  // 3. Start the autonomous crew — brokers scale with fleet size (one per maxAdverts
  //    slice) so each broker's Promise.all harvest stays bounded; technician and
  //    inspector are singletons (their work is idempotent by query).
  for (let i = 0; i < brokerCount; i++) {
    await invoke(PRINT_WORKFLOWS.BROKER, `broker-${RUN_ID}-${i}`, { ...loop, brokerId: op.brokerId, maxAdverts: DEFAULT_MAX_ADVERTS });
  }
  await invoke(PRINT_WORKFLOWS.TECHNICIAN, `technician-${RUN_ID}`, { ...loop, technicianId: op.technicianId });
  await invoke(PRINT_WORKFLOWS.INSPECTOR, `inspector-${RUN_ID}`, { ...loop, inspectorId: op.inspectorId });

  // Sentinel the farm orchestrator waits for before releasing demand.
  console.log(`[supply] ${ts()} SUPPLY READY RUN_ID=${RUN_ID}`);

  // 4. Stay alive, reporting the marketplace clearing in real time. We report what
  //    the supply side is actually doing — idle machines, in-flight handoffs, prints
  //    done, refills, retirements — not just retirements (which never fire until a
  //    machine hits its 10-run end of life). Utilization = busy / fleet.
  const t0 = performance.now();
  const capacity = FLEET_SIZE * EOL_RUNS;
  while (true) {
    await sleep(5000);
    const snap = await fleetSnapshot();
    let retired = 0;
    for (const spec of fleet) {
      try {
        const r = await api('GET', `/api/workflows/${spec.printerId}/result`);
        if (r?.result?.type === 'return') retired++;
      } catch { /* still running */ }
    }
    const busy = snap.inflight;
    const util = FLEET_SIZE > 0 ? Math.round((busy / FLEET_SIZE) * 100) : 0;
    const elapsed = ((performance.now() - t0) / 1000).toFixed(0);
    console.log(
      `[supply] ${ts()} prints=${snap.prints}/${capacity} busy=${busy}/${FLEET_SIZE} (${util}% util) idle=${snap.idle} refills=${snap.refills} retired=${retired}/${FLEET_SIZE} (${elapsed}s)`,
    );
    if (retired >= FLEET_SIZE) {
      console.log(`[supply] ${ts()} all machines retired — fleet exhausted (${snap.prints} prints)`);
      break;
    }
  }
}

main().catch((err) => { console.error('[supply] failed:', err.message); process.exit(1); });
