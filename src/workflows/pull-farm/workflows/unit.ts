/**
 * pullUnit — one unit of work parked at the membrane. The escalation IS the
 * work item; whichever puller wins the lease and resolves it wakes this
 * workflow, whose return records exactly who answered. One workflow, one
 * wait, one settlement — exactly-once by construction.
 */

import { Durable } from '@hotmeshio/hotmesh';

import { conditionLT } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { PULL_FACETS, PULL_POND, PULL_WORKFLOWS } from '../types';
import type { PullResolution, PullUnitData } from '../types';

export async function pullUnit(envelope: LTEnvelope): Promise<any> {
  const d = envelope.data as PullUnitData;
  const ctx = Durable.workflow.workflowInfo();

  const resolution = await conditionLT<PullResolution>(`pull-${ctx.workflowId}`, {
    role: PULL_POND,
    type: PULL_WORKFLOWS.UNIT,
    subtype: 'work',
    priority: 2,
    description: `Pull unit ${d.unitIndex} (batch ${d.batch}) awaiting a puller`,
    metadata: {
      [PULL_FACETS.BATCH]: d.batch,
      [PULL_FACETS.UNIT]: d.unitIndex,
    },
  });

  // conditionLT settles three ways: payload, false (expired), null (cancelled).
  const pullerId = resolution && typeof resolution === 'object' ? (resolution.pullerId ?? null) : null;
  return {
    type: 'return' as const,
    data: {
      unitIndex: d.unitIndex,
      pullerId,
    },
  };
}
