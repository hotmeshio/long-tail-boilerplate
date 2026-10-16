/**
 * Rich Form: the reference for a role-owned, versioned escalation form.
 *
 * The form is not declared here. The `intake-reviewer` role owns it (see
 * forms.ts and src/config/hitl-roles.ts). The invoke form's values become
 * `formDefaults`, which the dashboard reverse-maps through x-lt-bind to
 * prefill the reviewer's form. One atomic `conditional` writes the escalation
 * in Leg1 and suspends; the role enforces its schema server-side, so the
 * payload that returns has already passed the same validation the form runs.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import * as activities from './activities';
import { INTAKE_ROLE, type IntakeInput } from './forms';

const { processIntake } = Durable.workflow.proxyActivities<typeof activities>({ activities });

export async function richForm(envelope: LTEnvelope): Promise<any> {
  const input = (envelope.data ?? {}) as IntakeInput;
  const ctx = Durable.workflow.workflowInfo();

  const customer = {
    name: input.customer?.name ?? 'Acme Widgets LLC',
    email: input.customer?.email ?? 'ops@acme.example',
    phone: input.customer?.phone,
  };
  const contract = {
    tier: input.contract?.tier ?? 'professional',
    startDate: input.contract?.startDate,
    budget: input.contract?.budget,
  };

  const response = await conditional(`rich-form-${ctx.workflowId}`, {
    role: INTAKE_ROLE,
    type: 'intake',
    subtype: 'rich-form',
    priority: 2,
    description: `Intake: ${customer.name}`,
    workflowType: 'richForm',
    metadata: { customer: customer.name, tier: contract.tier },
    envelope: { source: 'rich-form', formDefaults: { customer, contract } },
    ...(input.formVersion ? { schemaVersion: input.formVersion } : {}),
  });

  if (!response) {
    return { type: 'return' as const, data: { cancelled: true } };
  }
  return { type: 'return' as const, data: await processIntake(response) };
}
