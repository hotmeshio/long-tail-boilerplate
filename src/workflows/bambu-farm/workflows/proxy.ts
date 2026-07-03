/**
 * Shared activity proxies for the bambu-farm workflows. Proxy the whole
 * activities barrel once; each workflow imports the handles it calls.
 */

import { Durable } from '@hotmeshio/hotmesh';

import * as activities from '../activities';

export const { emitBambuEvent } = Durable.workflow.proxyActivities<typeof activities>({
  activities,
  retry: { maximumAttempts: 3 },
});
