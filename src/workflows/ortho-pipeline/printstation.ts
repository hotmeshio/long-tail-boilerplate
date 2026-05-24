/**
 * Printstation — orchestrates a fleet of 3D printers in parallel.
 *
 * Spawns all printers (printerSets × 2 feet) simultaneously via
 * executeChild, then awaits all results with Promise.all. This
 * mirrors how a real print farm works: all printers start together
 * and finish independently.
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';
import { JOB_EXPIRE_SECS } from '@hotmeshio/long-tail/build/modules/defaults';
import type { StepResult } from './types';

export async function printstation(envelope: LTEnvelope): Promise<any> {
  const {
    stationName,
    instructions,
    printerSets = 3,
  } = envelope.data as {
    stationName: string;
    role: string;
    instructions: string;
    printerSets?: number;
    parentWorkflowId?: string;
  };

  const ctx = Durable.workflow.workflowInfo();
  const totalPrinters = printerSets * 2;

  // Launch all printers in parallel
  const promises: Promise<StepResult>[] = [];
  for (let i = 0; i < totalPrinters; i++) {
    const side = i % 2 === 0 ? 'left' : 'right';
    const setIndex = Math.floor(i / 2);
    const childWorkflowId = `${ctx.workflowId}-printer-${i}`;

    promises.push(
      Durable.workflow.executeChild<StepResult>({
        workflowName: 'printer',
        args: [
          {
            data: {
              stationName: `printer-set${setIndex}-${side}`,
              role: 'printer',
              instructions: `${instructions} (set ${setIndex}, ${side} foot)`,
              parentWorkflowId: ctx.workflowId,
            },
            metadata: {
              source: 'printstation',
              printer: i,
              set: setIndex,
              side,
              ...(envelope.metadata?.certified === true ? { certified: true } : {}),
            },
          },
        ],
        taskQueue: 'ortho-pipeline',
        workflowId: childWorkflowId,
        expire: JOB_EXPIRE_SECS,
        entity: 'printer',
      }),
    );
  }

  // Await all printers
  const results = await Promise.all(promises);

  return {
    type: 'return' as const,
    data: {
      stationName,
      printerSets,
      totalPrinters,
      printers: results,
      completedAt: new Date().toISOString(),
    },
  };
}
