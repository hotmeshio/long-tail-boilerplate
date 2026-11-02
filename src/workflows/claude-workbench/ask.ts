/**
 * ask: one decision parked in any role's queue. What an agent invokes when it
 * needs a person out of band, and what a person invokes to put a question in
 * another role's inbox.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { parseDecision } from './contracts';
import { askSignal, rowFacets, sectionEnvelope } from './facets';
import { BLOCKED_DECISIONS, DEFAULT_ASK_TIMEOUT_HOURS, PRIORITY, RACI, ROW_TYPE, SECTION, type AskInput, type AskResult } from './types';

const WORKFLOW_TYPE = 'ask';

function optionsOf(input: AskInput) {
  return input.options?.length ? input.options.map((value) => ({ value, label: value })) : [...BLOCKED_DECISIONS];
}

export async function ask(envelope: LTEnvelope): Promise<{ type: 'return'; data: AskResult }> {
  const input = envelope.data as AskInput;
  const { workflowId } = Durable.workflow.workflowInfo();

  const answer = await conditional<Record<string, unknown>>(askSignal(workflowId), {
    type: ROW_TYPE,
    subtype: SECTION.DECIDE,
    role: input.seat,
    workflowType: WORKFLOW_TYPE,
    priority: PRIORITY.DECIDE,
    description: input.headline,
    timeout: `${input.timeoutHours ?? DEFAULT_ASK_TIMEOUT_HOURS}h`,
    metadata: rowFacets({ seat: input.seat, section: SECTION.DECIDE, raci: RACI.ACCOUNTABLE, program: input.program }),
    envelope: sectionEnvelope(SECTION.DECIDE, input.brief, { decision_options: optionsOf(input) }),
  });

  if (answer === null) return { type: 'return', data: { outcome: 'cancelled' } };
  if (answer === false) return { type: 'return', data: { outcome: 'expired' } };
  const resolvedBy = (answer.$resolution as { resolvedBy?: string } | undefined)?.resolvedBy;
  return { type: 'return', data: { outcome: 'answered', decision: parseDecision(answer), resolvedBy } };
}
