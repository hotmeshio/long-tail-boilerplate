/**
 * ownerEscalation: one escalation for the owner (or a future Claude session),
 * parked with one `conditional`. The description is the short headline, the
 * brief renders as markdown in the form, and the project, PR, session and kind
 * ride metadata so the row is found by `metadata @>`.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { EscalationResolution, LTEnvelope } from '@hotmeshio/long-tail';

import { briefEnvelope, hoursTimeout, workbenchFacets } from './facets';
import type { OwnerEscalationInput, WorkbenchResult } from './types';

const DEFAULT_PRIORITY = 2;

type OwnerResolution = Record<string, unknown> & { $resolution?: EscalationResolution };

export async function ownerEscalation(envelope: LTEnvelope): Promise<{ type: 'return'; data: WorkbenchResult }> {
  const input = envelope.data as OwnerEscalationInput;
  const { workflowId } = Durable.workflow.workflowInfo();

  const resolution = await conditional<OwnerResolution>(`owner-${workflowId}`, {
    role: input.role,
    type: 'workbench',
    subtype: input.role,
    priority: input.priority ?? DEFAULT_PRIORITY,
    description: input.headline,
    workflowType: 'ownerEscalation',
    metadata: workbenchFacets(input, input.role),
    envelope: briefEnvelope(input.brief),
    ...hoursTimeout(input.timeoutHours),
  });

  if (resolution === null) return { type: 'return', data: { project: input.project, outcome: 'cancelled' } };
  if (resolution === false) return { type: 'return', data: { project: input.project, outcome: 'expired' } };

  const { $resolution, ...answer } = resolution;
  return {
    type: 'return',
    data: { project: input.project, outcome: 'resolved', resolution: answer, resolvedBy: $resolution?.resolvedBy },
  };
}
