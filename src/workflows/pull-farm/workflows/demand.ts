/**
 * pullDemand — the demand surface: fans out one pullUnit child per unit
 * (the printDispatcher → printJobWorker shape), awaits them all, and returns
 * who resolved what. Children are awaited in chunks to bound the collation
 * fan-in, same discipline as the print-routing harvest.
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';
import { JOB_EXPIRE_SECS } from '@hotmeshio/long-tail/build/modules/defaults';

import { PULL_FARM_QUEUE, PULL_WORKFLOWS } from '../types';
import type { PullDemandData, PullDemandResult } from '../types';

const CHUNK = 12;

export async function pullDemand(envelope: LTEnvelope): Promise<any> {
  const d = envelope.data as PullDemandData;
  if (!d.batch || !d.units) throw new Error('pullDemand requires data.batch and data.units');
  const ctx = Durable.workflow.workflowInfo();

  const resolvedBy: (string | null)[] = [];
  for (let start = 0; start < d.units; start += CHUNK) {
    const slice = Array.from({ length: Math.min(CHUNK, d.units - start) }, (_, k) => start + k);
    const settled = await Promise.all(
      slice.map((i) =>
        Durable.workflow.executeChild<{ data?: { unitIndex: number; pullerId: string | null } }>({
          workflowName: PULL_WORKFLOWS.UNIT,
          args: [{ data: { batch: d.batch, unitIndex: i }, metadata: { source: PULL_WORKFLOWS.DEMAND } }],
          taskQueue: PULL_FARM_QUEUE,
          workflowId: `${ctx.workflowId}-u${i}`,
          expire: JOB_EXPIRE_SECS,
          entity: PULL_WORKFLOWS.UNIT,
        }),
      ),
    );
    for (const r of settled) resolvedBy.push((r?.data ?? (r as any))?.pullerId ?? null);
  }

  const result: PullDemandResult = { batch: d.batch, units: d.units, resolvedBy };
  return { type: 'return' as const, data: result };
}
