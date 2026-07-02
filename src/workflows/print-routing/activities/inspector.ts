/**
 * Inspector (farmer) activity — resolve pending order-done signoff escalations. The
 * farmer inspects each printed order and rejects defective insoles (`failedUnits`);
 * resolving wakes the parked order, which reprints whatever was rejected. Automated
 * here so the example self-drains; in production a dashboard operator signs off.
 *
 * `inspectorBatch` runs the scan→resolve loop INSIDE one proxy activity, with
 * plain-JS sleeps between passes (zero durable cost per pass) — the same hot-loop
 * shape as the broker's `dispatchBatch`. The workflow checkpoints ONCE per batch
 * instead of once per tick.
 *
 * Replay-safe: `resolve` is `status='pending'`-guarded (a no-op on an already
 * resolved row, and it delivers the wake signal only on the winning update), and
 * each pass re-reads the pending set — so a retried batch re-resolves nothing it
 * already did.
 */

import { createClient } from '@hotmeshio/long-tail';

import { FARMER_POND, SIGNOFF_FACETS, fleetKind } from '../types';
import type { CrewBatchInput, CrewBatchResult } from '../types';

export async function inspectorBatch(
  input: CrewBatchInput & { inspectorId: string },
): Promise<CrewBatchResult> {
  const farmerPond = FARMER_POND[fleetKind(input.diabetic)];

  // Run as the inspector operator — a principal holding the farmer pond role.
  const lt = createClient({ auth: { userId: input.inspectorId } });

  let total = 0;
  for (let i = 0; i < input.maxIterations; i++) {
    const pending = await lt.escalations.searchByFacets({
      role: farmerPond,
      status: 'pending',
      available: true,
      limit: input.scanLimit,
    });
    if (pending.status !== 200) throw new Error(`searchByFacets failed: ${pending.error}`);

    // Each signoff is a signal_key advert with a DISTINCT payload (its own failedUnits)
    // whose resolution must DELIVER the signal to wake the parked order — so it stays
    // per-row, not set-based.
    let resolvedThisPass = 0;
    for (const e of pending.data.escalations) {
      const m = (e.metadata ?? {}) as Record<string, any>;
      const failedUnits: number[] = Array.isArray(m[SIGNOFF_FACETS.FAIL_UNITS]) ? m[SIGNOFF_FACETS.FAIL_UNITS] : [];
      const res = await lt.escalations.resolve({
        id: e.id,
        resolverPayload: { passed: failedUnits.length === 0, inspectedBy: input.inspectorId, failedUnits },
      });
      if (res.status === 200) resolvedThisPass++;
    }
    total += resolvedThisPass;

    await new Promise<void>((r) => setTimeout(r, resolvedThisPass > 0 ? input.activeSleepMs : input.idleSleepMs));
  }

  return { resolved: total, didWork: total > 0 };
}
