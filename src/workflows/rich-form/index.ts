/**
 * Rich Form Workflow
 *
 * Showcases every HITL form feature:
 * - format: date, email, textarea, password
 * - x-lt-widget: file-upload, code-editor
 * - x-lt-layout: two-column
 * - x-lt-order for field sequencing
 * - required validation
 * - readOnly display fields
 * - Schema title + description (user mode context panel)
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';
import * as activities from './activities';

type ActivitiesType = typeof activities;

const { createRichFormEscalation, processIntake } =
  Durable.workflow.proxyActivities<ActivitiesType>({ activities });

export async function richForm(envelope: LTEnvelope): Promise<any> {
  const { role = 'reviewer' } = envelope.data;

  const ctx = Durable.workflow.workflowInfo();
  const signalId = `rich-form-${ctx.workflowId}`;

  await createRichFormEscalation({
    role,
    workflowId: ctx.workflowId,
    workflowType: 'richForm',
    taskQueue: ctx.taskQueue,
    signalId,
  });

  const response = await Durable.workflow.condition<Record<string, unknown>>(
    signalId,
  ) as Record<string, unknown>;

  const result = await processIntake(response);

  return {
    type: 'return' as const,
    data: result,
  };
}
