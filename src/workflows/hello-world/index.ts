/**
 * Hello World — minimal durable workflow.
 *
 * Demonstrates:
 *   - Durable timer (sleep)
 *   - Proxy activity with IAM context
 *   - Return envelope structure
 */

import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import * as activities from './activities';

type ActivitiesType = typeof activities;

const { greet } = Durable.workflow.proxyActivities<ActivitiesType>({
  activities,
});

export async function helloWorkflow(envelope: LTEnvelope): Promise<any> {
  const { name = 'World', delaySeconds = 1 } = envelope.data;

  await Durable.workflow.sleep(`${delaySeconds} seconds`);

  const result = await greet({ name });

  return {
    type: 'return' as const,
    data: result,
  };
}
