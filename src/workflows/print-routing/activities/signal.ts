/**
 * Signal an order's wake key — used to wake a parked `printOrder` once its insoles
 * have printed. A thin wrapper over the durable client's signal.
 */

import { Durable } from '@hotmeshio/hotmesh';

import { getConnection } from '../../../config/connection';

export async function signalOrder(input: {
  taskQueue: string;
  workflowType: string;
  workflowId: string;
  signalId: string;
  data: Record<string, any>;
}): Promise<void> {
  const client = new Durable.Client({ connection: getConnection() });
  const handle = await client.workflow.getHandle(
    input.taskQueue,
    input.workflowType,
    input.workflowId,
  );
  // Send once immediately, then once more after a short delay. Guards the race where
  // enqueueOrderUnits has committed insoles to the DB (broker picks them up instantly)
  // but the order workflow's signal hook (Durable.workflow.condition) hasn't registered
  // yet. If the first signal fires into that window it is dropped; the second succeeds
  // once the hook is active. If the first was delivered, the second is an Inactive job
  // no-op logged by HotMesh and otherwise harmless.
  await handle.signal(input.signalId, input.data);
  await new Promise((r) => setTimeout(r, 2000));
  await handle.signal(input.signalId, input.data);
}
