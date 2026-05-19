/**
 * Assembly Line — durable orchestrator with human task queues.
 *
 * A product moves through sequential workstations. Each station
 * creates an escalation for a human operator, pauses, then returns
 * its result when the human resolves it. The parent receives the
 * result directly via executeChild.
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';
import { JOB_EXPIRE_SECS } from '@hotmeshio/long-tail/build/modules/defaults';
import type { AssemblyLineStation, StationResult } from './types';

export async function assemblyLine(envelope: LTEnvelope): Promise<any> {
  const { productName, stations } = envelope.data as {
    productName: string;
    stations: AssemblyLineStation[];
  };

  const ctx = Durable.workflow.workflowInfo();
  const results: StationResult[] = [];

  for (const [i, station] of stations.entries()) {
    const childWorkflowId = `${ctx.workflowId}-${i}`;

    const result = await Durable.workflow.executeChild<StationResult>({
      workflowName: 'workstation',
      args: [
        {
          data: {
            ...station,
            parentWorkflowId: ctx.workflowId,
          },
          metadata: { source: 'assembly-line', station: station.stationName, ...(envelope.metadata?.certified === true ? { certified: true } : {}) },
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
      productName,
      stations: results,
      completedAt: new Date().toISOString(),
    },
  };
}
