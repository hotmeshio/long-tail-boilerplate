/**
 * Lot Inspection: a two-station HITL flow driven entirely by role-owned,
 * versioned schemas.
 *
 *   1. Receive (`lot-receiver`): count the lot at the dock.
 *   2. Inspect (`lot-inspector`): measure, work the checklist, record a verdict.
 *
 * Each station is one atomic `conditional`. The rows carry the facets the
 * list pages and the look-ahead query read (`lotNumber`, `partFamily`), the
 * per-row values the forms bound and offer (`expected_units`, `dock_doors`,
 * `sample_size`, `tolerance`), and, for inspection, the knowledge lookup refs
 * its checklist and defect cascade read. Both roles enforce their schema, so
 * every resolve surface (dashboard, API, MCP) passes the same validation.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import * as activities from './activities';
import { INSPECTION_CHECKS_LOOKUP, DEFECTS_LOOKUP } from './lookups';
import { LOT_RECEIVER_ROLE, LOT_INSPECTOR_ROLE, DOCK_DOORS } from './types';
import type { LotInspectionInput, LotInspectionResult } from './types';

const { recordReceipt, recordVerdict } = Durable.workflow.proxyActivities<typeof activities>({ activities });

export async function lotInspection(envelope: LTEnvelope): Promise<{ type: 'return'; data: LotInspectionResult }> {
  const input = envelope.data as LotInspectionInput;
  const ctx = Durable.workflow.workflowInfo();
  const { number: lotNumber, partFamily, expectedUnits } = input.lot;
  const facets = { lotNumber, partFamily };
  const priority = input.priority ?? 3;

  // 1. Receive at the dock
  const receipt = await conditional(`lot-receive-${ctx.workflowId}`, {
    role: LOT_RECEIVER_ROLE,
    type: 'lot',
    subtype: 'receive',
    priority,
    description: `Receive ${lotNumber} · ${partFamily}`,
    workflowType: 'lotInspection',
    metadata: facets,
    envelope: {
      expected_units: expectedUnits,
      dock_doors: input.receiving?.docks?.length ? input.receiving.docks : [...DOCK_DOORS],
      formDefaults: { lot: { number: lotNumber, partFamily, expectedUnits } },
    },
  });
  if (receipt === null) return { type: 'return', data: { lotNumber, outcome: 'cancelled' } };
  if (receipt === false) return { type: 'return', data: { lotNumber, outcome: 'expired' } };

  const received = await recordReceipt({ payload: receipt, expectedUnits });
  if (!received.accepted) {
    return { type: 'return', data: { lotNumber, outcome: 'refused', reason: received.reason } };
  }

  // 2. Inspect a sample no larger than what arrived
  const sampleSize = Math.min(input.inspection.sampleSize, received.unitsReceived);
  const verdict = await conditional(`lot-inspect-${ctx.workflowId}`, {
    role: LOT_INSPECTOR_ROLE,
    type: 'lot',
    subtype: 'inspect',
    priority,
    description: `Inspect ${lotNumber} · ${partFamily}`,
    workflowType: 'lotInspection',
    metadata: facets,
    lookups: [INSPECTION_CHECKS_LOOKUP, DEFECTS_LOOKUP],
    envelope: {
      sample_size: sampleSize,
      tolerance: input.inspection.tolerance,
      formDefaults: {
        lot: { number: lotNumber, partFamily, unitsReceived: received.unitsReceived, sampleSize },
      },
    },
  });
  if (verdict === null) return { type: 'return', data: { lotNumber, outcome: 'cancelled' } };
  if (verdict === false) return { type: 'return', data: { lotNumber, outcome: 'expired' } };

  return {
    type: 'return',
    data: await recordVerdict({ payload: verdict, lotNumber, unitsReceived: received.unitsReceived }),
  };
}
