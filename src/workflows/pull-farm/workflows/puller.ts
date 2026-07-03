/**
 * puller — one crew-loop workflow per puller, running as its OWN principal.
 * The lifecycle is the acme-mono virtualPrinter's, with the telemetry this
 * experiment exists to gather:
 *
 *   scan → claim (a REAL lease — distinct principals) → work → resolve
 *
 * Every lost race is counted with the status that rejected it. A late
 * resolve is an ordinary ending. A 'silent' directive claims and goes dark —
 * the claim TTL is the recovery the harness then observes.
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';

import { claimLead, resolveLead, scanPond } from './proxy';
import { PULL_DEFAULTS } from '../types';
import type { PullDirective, PullerData, PullerResult } from '../types';

export async function puller(envelope: LTEnvelope): Promise<any> {
  const d = envelope.data as PullerData;
  if (!d.pullerId || !d.operatorId || !d.batch) throw new Error('puller requires pullerId, operatorId, batch');

  const plan = d.plan ?? [];
  const workSeconds = d.workSeconds ?? PULL_DEFAULTS.workSeconds;
  const claimMinutes = d.claimMinutes ?? PULL_DEFAULTS.claimMinutes;
  const maxRuns = d.maxRuns ?? PULL_DEFAULTS.maxRuns;
  const maxIdleTicks = d.maxIdleTicks ?? PULL_DEFAULTS.maxIdleTicks;
  const idleTickSeconds = d.idleTickSeconds ?? PULL_DEFAULTS.idleTickSeconds;

  let resolved = 0;
  let lostResolves = 0;
  const lostClaimStatuses: number[] = [];
  let runs = 0;
  let idleTicks = 0;
  let wentDark = false;

  while (runs < maxRuns && idleTicks < maxIdleTicks) {
    const lead = await scanPond({ operatorId: d.operatorId, batch: d.batch });
    if (!lead) {
      idleTicks += 1;
      await Durable.workflow.sleep(`${idleTickSeconds} seconds`);
      continue;
    }
    idleTicks = 0;

    // The lease attempt — the status is the experiment's telemetry.
    const claimStatus = await claimLead({ operatorId: d.operatorId, escalationId: lead.escalationId, claimMinutes });
    if (claimStatus !== 200) {
      lostClaimStatuses.push(claimStatus);
      continue;
    }

    const directive: PullDirective = plan[runs] ?? 'ok';
    runs += 1;

    if (directive === 'silent') {
      wentDark = true;
      break;
    }

    await Durable.workflow.sleep(`${workSeconds} seconds`);

    const resolveStatus = await resolveLead({
      operatorId: d.operatorId,
      escalationId: lead.escalationId,
      resolution: { pullerId: d.pullerId, run: runs - 1 },
    });
    if (resolveStatus === 200) resolved += 1;
    else lostResolves += 1;
  }

  const result: PullerResult = {
    pullerId: d.pullerId,
    resolved,
    lostClaims: lostClaimStatuses.length,
    lostClaimStatuses,
    lostResolves,
    wentDark,
  };
  return { type: 'return' as const, data: result };
}
