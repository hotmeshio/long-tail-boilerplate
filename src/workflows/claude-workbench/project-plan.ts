/**
 * projectPlan: one escalation whose steps are batch items. Each step is filled
 * on its own (`resolveBatchItemByMetadata` or `resolve_batch_item`) with the
 * role's form payload; the last fill resolves the row and wakes this wait with
 * every step's payload. Progress reads from `metadata.batch_pending`.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { EscalationResolution, LTEnvelope } from '@hotmeshio/long-tail';

import { briefEnvelope, workbenchFacets } from './facets';
import type { ProjectPlanInput, WorkbenchResult } from './types';

const PLAN_PRIORITY = 3;
const PLAN_KIND = 'plan';

type PlanResolution = Record<string, unknown> & { $resolution?: EscalationResolution };

export async function projectPlan(envelope: LTEnvelope): Promise<{ type: 'return'; data: WorkbenchResult }> {
  const input = envelope.data as ProjectPlanInput;
  const { workflowId } = Durable.workflow.workflowInfo();

  const steps = await conditional<PlanResolution>(`plan-${workflowId}`, {
    role: input.role,
    type: 'workbench',
    subtype: PLAN_KIND,
    priority: PLAN_PRIORITY,
    description: input.headline,
    workflowType: 'projectPlan',
    metadata: workbenchFacets(input, PLAN_KIND),
    envelope: briefEnvelope(input.brief),
    batch: input.steps,
  });

  if (steps === null) return { type: 'return', data: { project: input.project, outcome: 'cancelled' } };
  if (steps === false) return { type: 'return', data: { project: input.project, outcome: 'expired' } };

  const { $resolution, ...filled } = steps;
  return {
    type: 'return',
    data: { project: input.project, outcome: 'resolved', resolution: filled, resolvedBy: $resolution?.resolvedBy },
  };
}
