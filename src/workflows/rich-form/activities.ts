/**
 * Rich Form Activities — post-resolution processing.
 *
 * The input is payload-shaped, not form-shaped: the resolve step already mapped
 * the flat submission through the form's `x-lt-bind` into the nested tree this
 * workflow owns as `IntakeResolverV1`. So this reads `customer.name` /
 * `contract.tier`, never `customer_name` / `tier` — the form can be re-laid-out
 * without changing this consumer.
 */

import type { IntakeResolverV1 } from './forms';

export async function processIntake(input: IntakeResolverV1): Promise<{
  received: boolean;
  customerName: string;
  tier: string;
  approved: boolean;
  processedAt: string;
}> {
  const customer = input.customer ?? ({} as IntakeResolverV1['customer']);
  const contract = input.contract ?? ({} as IntakeResolverV1['contract']);
  return {
    received: true,
    customerName: customer.name ?? '',
    tier: contract.tier ?? '',
    approved: contract.approved ?? false,
    processedAt: new Date().toISOString(),
  };
}
