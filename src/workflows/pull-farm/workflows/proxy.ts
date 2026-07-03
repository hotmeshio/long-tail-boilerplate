/**
 * Shared activity proxies for the pull-farm workflows.
 */

import { Durable } from '@hotmeshio/hotmesh';

import * as activities from '../activities';

export const { scanPond, claimLead, resolveLead } = Durable.workflow.proxyActivities<typeof activities>({
  activities,
  retry: { maximumAttempts: 3 },
});
