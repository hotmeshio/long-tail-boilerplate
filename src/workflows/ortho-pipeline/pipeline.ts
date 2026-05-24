/**
 * Pipeline — top-level orchestrator for the ortho manufacturing flow.
 *
 * Walks steps sequentially, spawning a child workflow for each.
 * By default spawns `station`; steps with `childWorkflow` override
 * the child (e.g., `printstation` for the print-assets phase).
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';
import { JOB_EXPIRE_SECS } from '@hotmeshio/long-tail/build/modules/defaults';
import type { PipelineStep, StepResult } from './types';

export async function pipeline(envelope: LTEnvelope): Promise<any> {
  const { name, steps } = envelope.data as {
    name: string;
    steps: PipelineStep[];
  };

  const ctx = Durable.workflow.workflowInfo();
  const results: StepResult[] = [];

  for (const [i, step] of steps.entries()) {
    const childName = step.childWorkflow || 'station';
    const childWorkflowId = `${ctx.workflowId}-${i}`;

    const result = await Durable.workflow.executeChild<StepResult>({
      workflowName: childName,
      args: [
        {
          data: {
            ...step,
            parentWorkflowId: ctx.workflowId,
          },
          metadata: {
            source: 'ortho-pipeline',
            step: i,
            ...(envelope.metadata?.certified === true ? { certified: true } : {}),
          },
        },
      ],
      taskQueue: 'ortho-pipeline',
      workflowId: childWorkflowId,
      expire: JOB_EXPIRE_SECS,
      entity: childName,
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
