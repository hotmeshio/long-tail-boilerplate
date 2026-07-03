/**
 * bambuPrinter — one durable workflow per virtual machine, speaking the real
 * Bambu integration language at both edges:
 *
 *   inbound  — its ready advert is resolved with Acme's IoT dispatch payload
 *              ({ deviceId, fileName, folderName, presignedUrl })
 *   outbound — it emits PrinterBambuDto-shaped events (job_start, job_failed
 *              with hms codes, job_finished, printer_ready, job_rejected)
 *
 * The loop mirrors the Farm Manager gcode_state machine: an unresolved ready
 * advert IS the IDLE state; the dispatch resolve is PREPARE→RUNNING; the durable
 * sleep is the print; job_finished is FINISH (part on the plate); the collect
 * gap + printer_ready is the associate's bed_clean. Failure is a data directive
 * riding the dispatch payload — never chaos.
 *
 * Advert facets are namespaced (`bambuMachine`) and carry NO orderId, so
 * order-keyed resolvers can never cross-talk with a machine advert.
 */

import { Durable } from '@hotmeshio/hotmesh';

import { conditionLT } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { emitBambuEvent } from './proxy';
import {
  BAMBU_POOL,
  BAMBU_WORKFLOWS,
  BAMBU_FACETS,
  BAMBU_DISPATCH_ERRORS,
  MACHINE_STATE,
  DEFAULT_HMS_CODE,
  DEFAULT_PRINT_SECONDS,
  DEFAULT_COLLECT_SECONDS,
  DEFAULT_MAX_RUNS,
} from '../types';
import type {
  BambuJobPayload,
  BambuPrinterData,
  BambuPrinterResult,
  BambuRunRecord,
  RunOutcome,
  SimulateDirective,
} from '../types';

export async function bambuPrinter(envelope: LTEnvelope): Promise<any> {
  const d = envelope.data as BambuPrinterData;
  if (!d.deviceId) throw new Error('bambuPrinter requires data.deviceId (the machine serial)');
  const machineName = d.machineName ?? d.deviceId;
  const maxRuns = d.maxRuns ?? DEFAULT_MAX_RUNS;
  const ctx = Durable.workflow.workflowInfo();

  const history: BambuRunRecord[] = [];
  let runs = 0;
  let wentDark = false;

  while (runs < maxRuns) {
    const lastOutcome: RunOutcome | undefined = history[history.length - 1]?.outcome;

    // 1. IDLE — the unresolved advert is the machine's state. Resolving it with a
    //    job payload is the dispatch; resolving with { powerdown } retires it.
    const payload = await conditionLT<BambuJobPayload>(`bambu-ready-${ctx.workflowId}-r${runs}`, {
      role: BAMBU_POOL,
      type: BAMBU_WORKFLOWS.PRINTER,
      subtype: MACHINE_STATE.READY,
      priority: 2,
      description: `Bambu ${machineName} (${d.deviceId}) idle — plate clear, awaiting dispatch (run ${runs + 1})`,
      metadata: {
        [BAMBU_FACETS.MACHINE]: d.deviceId,
        [BAMBU_FACETS.MACHINE_NAME]: machineName,
        [BAMBU_FACETS.STATE]: MACHINE_STATE.READY,
        [BAMBU_FACETS.RUN]: runs,
        ...(lastOutcome ? { [BAMBU_FACETS.LAST_OUTCOME]: lastOutcome } : {}),
      },
    });

    // Cancelled / powered down — the boundary retires the machine.
    if (!payload || payload.powerdown || !payload.command) break;

    const { command } = payload;
    const sim: SimulateDirective = payload.simulate ?? { mode: 'ok' };
    const printSeconds = sim.printSeconds ?? DEFAULT_PRINT_SECONDS;
    const collectSeconds = sim.collectSeconds ?? DEFAULT_COLLECT_SECONDS;
    const record: BambuRunRecord = { run: runs, fileName: command.fileName, events: [], outcome: 'success' };
    runs += 1;

    // 2. Rejected at the door — the dispatch never becomes a print (1051/1053
    //    class). The plate is still clear, so the machine re-advertises.
    if (sim.mode === 'job_rejected') {
      const code = sim.bambuErrorCode ?? BAMBU_DISPATCH_ERRORS.INVALID_FILAMENT;
      const rejected = await emitBambuEvent({
        eventType: 'job_rejected',
        deviceId: d.deviceId,
        fileName: command.fileName,
        errorDetails: { message: sim.message ?? 'Simulated dispatch rejection', bambu_error_code: code },
      });
      record.events.push(rejected.event_type);
      record.outcome = 'rejected';
      record.bambuErrorCode = code;
      history.push(record);
      continue;
    }

    // 3. PREPARE → RUNNING.
    const started = await emitBambuEvent({ eventType: 'job_start', deviceId: d.deviceId, fileName: command.fileName });
    record.events.push(started.event_type);

    // 4. Mid-print failure — hms code, plate needs attention, Acme auto-requeues.
    if (sim.mode === 'job_failed') {
      await Durable.workflow.sleep(`${Math.max(1, Math.floor(printSeconds / 2))} seconds`);
      const hmsCode = sim.hmsCode ?? DEFAULT_HMS_CODE;
      const failed = await emitBambuEvent({
        eventType: 'job_failed',
        deviceId: d.deviceId,
        fileName: command.fileName,
        errorDetails: { message: sim.message ?? 'Simulated print failure', hms_code: hmsCode },
      });
      record.events.push(failed.event_type);
      record.outcome = 'failed';
      record.hmsCode = hmsCode;
      history.push(record);
      continue;
    }

    // 5. Gone dark — job_start fired, then nothing, ever. No finish, no ready,
    //    no further adverts: the machine that fell off the network mid-job.
    //    This is the watchdog case the champion's edges hid in.
    if (sim.mode === 'silent') {
      record.outcome = 'dark';
      history.push(record);
      wentDark = true;
      break;
    }

    // 6. The print runs, then FINISH — the part is on the plate.
    await Durable.workflow.sleep(`${printSeconds} seconds`);
    const finished = await emitBambuEvent({ eventType: 'job_finished', deviceId: d.deviceId, fileName: command.fileName });
    record.events.push(finished.event_type);

    // 7. The associate collects and confirms the plate — bed_clean → printer_ready.
    await Durable.workflow.sleep(`${collectSeconds} seconds`);
    const ready = await emitBambuEvent({ eventType: 'printer_ready', deviceId: d.deviceId, fileName: command.fileName });
    record.events.push(ready.event_type);
    history.push(record);
  }

  const result: BambuPrinterResult = {
    deviceId: d.deviceId,
    machineName,
    runs,
    retired: true,
    wentDark,
    history,
  };
  return { type: 'return' as const, data: result };
}
