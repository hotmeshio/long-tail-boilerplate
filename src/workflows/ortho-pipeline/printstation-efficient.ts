/**
 * Printstation (efficient) — the atomic-escalation variant of `printstation`.
 *
 * Identical fan-out orchestration (printerSets × 2 printers in parallel); the
 * only change is it spawns `printerEfficient` children, whose escalations are
 * written atomically in Leg1. The orchestrator itself creates no escalation,
 * so the efficiency win lives entirely in the leaves.
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';
import { JOB_EXPIRE_SECS } from '@hotmeshio/long-tail/build/modules/defaults';
import type { StepResult } from './types';

export async function printstationEfficient(envelope: LTEnvelope): Promise<any> {
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

  const promises: Promise<StepResult>[] = [];
  for (let i = 0; i < totalPrinters; i++) {
    const side = i % 2 === 0 ? 'left' : 'right';
    const setIndex = Math.floor(i / 2);
    const childWorkflowId = `${ctx.workflowId}-printer-${i}`;

    promises.push(
      Durable.workflow.executeChild<StepResult>({
        workflowName: 'printerEfficient',
        args: [
          {
            data: {
              stationName: `printer-set${setIndex}-${side}`,
              role: 'printer',
              instructions: `${instructions} (set ${setIndex}, ${side} foot)`,
              parentWorkflowId: ctx.workflowId,
            },
            metadata: {
              source: 'printstationEfficient',
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
        entity: 'printerEfficient',
      }),
    );
  }

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
