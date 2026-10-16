/**
 * Rich Form activities: post-resolution processing.
 *
 * The input is payload-shaped (the x-lt-bind tree), not form-shaped, and is
 * parsed through the declared zod schema at the activity boundary so a
 * drifted payload fails loud with a per-field violation list.
 */

import { parseFormPayload } from '../../lib/form-values';

import { IntakeResolverSchema } from './forms';

export interface IntakeOutcome {
  customerName: string;
  contactEmail: string;
  tier: string;
  decision: string;
  followUp: string[];
  processedAt: string;
}

export async function processIntake(input: unknown): Promise<IntakeOutcome> {
  const intake = parseFormPayload(IntakeResolverSchema, input);
  return {
    customerName: intake.customer.name,
    contactEmail: intake.customer.email,
    tier: intake.contract.tier,
    decision: intake.review.decision,
    followUp: intake.review.decision === 'needs-info' ? intake.review.missing ?? [] : [],
    processedAt: new Date().toISOString(),
  };
}
