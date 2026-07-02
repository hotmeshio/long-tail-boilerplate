/**
 * Technician activity — resolve pending `needs-filament` adverts ("added filament").
 * The same human-in-the-loop mechanism the platform uses everywhere; automated here
 * so the example self-drains. Resolving a maintenance advert wakes its printer.
 *
 * `technicianBatch` runs the scan→resolve loop INSIDE one proxy activity, with
 * plain-JS sleeps between passes (zero durable cost per pass) — the same hot-loop
 * shape as the broker's `dispatchBatch`. The workflow then checkpoints ONCE per
 * batch instead of once per tick, cutting durable write-churn by an order of
 * magnitude.
 *
 * Replay-safe: `resolve` is `status='pending'`-guarded (a no-op on an already
 * resolved row, and it delivers the wake signal only on the winning update), and
 * each pass re-reads the pending set — so a retried batch re-resolves nothing it
 * already did. A crash mid-batch simply re-scans and finishes the remainder.
 */

import { createClient } from '@hotmeshio/long-tail';

import { PRINTER_POND, PRINTER_FACETS, PRINTER_STATE, fleetKind } from '../types';
import type { CrewBatchInput, CrewBatchResult } from '../types';

export async function technicianBatch(
  input: CrewBatchInput & { technicianId: string },
): Promise<CrewBatchResult> {
  const printerPond = PRINTER_POND[fleetKind(input.diabetic)];

  // Run as the technician operator — a principal holding the printer pond role.
  const lt = createClient({ auth: { userId: input.technicianId } });

  let total = 0;
  for (let i = 0; i < input.maxIterations; i++) {
    const maintenance = await lt.escalations.searchByFacets({
      role: printerPond,
      status: 'pending',
      available: true,
      facets: { [PRINTER_FACETS.STATE]: PRINTER_STATE.MAINTENANCE },
      limit: input.scanLimit,
    });
    if (maintenance.status !== 200) throw new Error(`searchByFacets failed: ${maintenance.error}`);

    // Each maintenance advert is a signal_key row whose resolution must DELIVER the
    // refill signal to wake its printer — so it stays per-row, not set-based.
    let resolvedThisPass = 0;
    for (const e of maintenance.data.escalations) {
      const res = await lt.escalations.resolve({ id: e.id, resolverPayload: { action: 'added-filament' } });
      if (res.status === 200) resolvedThisPass++;
    }
    total += resolvedThisPass;

    await new Promise<void>((r) => setTimeout(r, resolvedThisPass > 0 ? input.activeSleepMs : input.idleSleepMs));
  }

  return { resolved: total, didWork: total > 0 };
}
