/**
 * Rich Form Workflow — the reference for the role-owned, versioned escalation
 * form.
 *
 * The form is NOT declared here. The `intake-reviewer` role owns a versioned
 * `form_schema` (seeded in src/config/seed.ts) whose fields carry `x-lt-bind` to
 * map into the payload shape this workflow consumes (`IntakeResolverV1`). The
 * workflow pins the form version it is written against, seeds the form with
 * injectable defaults, and receives the resolved payload typed.
 *
 * One atomic `conditionLT` expression writes the escalation in Leg1 and suspends.
 * The dashboard (from @hotmeshio/long-tail) fetches the escalation with the form
 * embedded in one query, prefills it from `envelope.formDefaults`, maps the
 * submission back through `x-lt-bind` on resolve, and returns it here typed.
 */

import { Durable } from '@hotmeshio/hotmesh';

import { conditionLT } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import * as activities from './activities';
import { INTAKE_ROLE, INTAKE_SCHEMA_VERSION, type IntakeResolverV1 } from './forms';

const { processIntake } = Durable.workflow.proxyActivities<typeof activities>({ activities });

export async function richForm(envelope: LTEnvelope): Promise<any> {
  const { role = INTAKE_ROLE } = envelope.data;
  const ctx = Durable.workflow.workflowInfo();
  const signalId = `rich-form-${ctx.workflowId}`;

  // Injectable defaults: a resolver-shaped payload the dashboard reverse-maps
  // through x-lt-bind to prefill the form. Editable by the human before submit;
  // omitted fields fall back to the form_schema's own defaults.
  const formDefaults: IntakeResolverV1 =
    (envelope.data.formDefaults as IntakeResolverV1) ?? {
      customer: { name: 'Acme Widgets LLC', email: 'ops@acme.example', phone: '+1-555-0100' },
      contract: { tier: 'professional', startDate: '2026-08-01', budget: 50000, approved: false },
      notes: 'Seeded defaults — edit before submitting.',
    };

  // One atomic Leg1 write + suspend. schemaVersion is a compile-time literal —
  // same cost as condition(); the returned shape is typed to match.
  const response = await conditionLT<IntakeResolverV1>(signalId, {
    role,
    type: 'intake',
    subtype: 'rich-form',
    priority: 2,
    description: 'Complete the customer intake form. Review all fields carefully before submitting.',
    workflowType: 'richForm',
    schemaVersion: INTAKE_SCHEMA_VERSION,
    envelope: { source: 'rich-form', formDefaults },
  });

  if (!response) {
    return { type: 'return' as const, data: { cancelled: true } };
  }
  return { type: 'return' as const, data: await processIntake(response) };
}
