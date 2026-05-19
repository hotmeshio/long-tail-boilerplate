/**
 * Step Iterator — generic durable loop over dynamic steps.
 *
 * Proves that the number and shape of steps can be entirely
 * data-driven. The orchestrator knows nothing about grinder,
 * gluer, or any specific station — it just walks the list,
 * spawns a child for each, and awaits its result directly
 * via executeChild (no separate signal subscription needed).
 *
 * Reuses the same `workstation` child workflow as the assembly line.
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';
import { JOB_EXPIRE_SECS } from '@hotmeshio/long-tail/build/modules/defaults';
import type { StationResult } from './types';

export async function stepIterator(envelope: LTEnvelope): Promise<any> {
  const { name, steps } = envelope.data as {
    name: string;
    steps: Array<{ stationName: string; role: string; instructions: string }>;
  };

  const ctx = Durable.workflow.workflowInfo();
  const results: StationResult[] = [];

  for (const [i, step] of steps.entries()) {
    const childWorkflowId = `${ctx.workflowId}-${i}`;

    const result = await Durable.workflow.executeChild<StationResult>({
      workflowName: 'workstation',
      args: [
        {
          data: {
            ...step,
            parentWorkflowId: ctx.workflowId,
          },
          metadata: { source: 'step-iterator', step: i, ...(envelope.metadata?.certified === true ? { certified: true } : {}) },
        },
      ],
      taskQueue: 'assembly-line',
      workflowId: childWorkflowId,
      expire: JOB_EXPIRE_SECS,
      entity: 'workstation',
    });

    results.push(result);
  }

  return {
    type: 'return' as const,
    data: {
      name,
      totalSteps: steps.length,
      steps: results,
      completedAt: new Date().toISOString(),
    },
  };
}
