/**
 * Lot inspection activities: parse each resolution through its declared zod
 * schema at the activity boundary and reduce it to what the workflow needs.
 */

import { parseFormPayload } from '../../lib/form-values';

import { ReceiptResolverSchema, VerdictResolverSchema } from './types';
import type { LotInspectionResult } from './types';

export interface ReceiptSummary {
  accepted: boolean;
  unitsReceived: number;
  dock?: string;
  reason?: string;
}

export async function recordReceipt(input: { payload: unknown; expectedUnits: number }): Promise<ReceiptSummary> {
  const { receipt } = parseFormPayload(ReceiptResolverSchema, input.payload);
  if (receipt.outcome === 'refuse') {
    return { accepted: false, unitsReceived: 0, reason: receipt.reason };
  }
  const unitsReceived = receipt.outcome === 'short'
    ? receipt.unitsReceived ?? input.expectedUnits
    : input.expectedUnits;
  return { accepted: true, unitsReceived, dock: receipt.dock };
}

const VERDICT_OUTCOMES = { pass: 'passed', rework: 'rework', scrap: 'scrapped' } as const;

export async function recordVerdict(input: {
  payload: unknown;
  lotNumber: string;
  unitsReceived: number;
}): Promise<LotInspectionResult> {
  const verdict = parseFormPayload(VerdictResolverSchema, input.payload);
  const { category, type, unitsFailed } = verdict.defect ?? {};
  return {
    lotNumber: input.lotNumber,
    outcome: VERDICT_OUTCOMES[verdict.verdict],
    unitsReceived: input.unitsReceived,
    measuredMm: verdict.verdict === 'pass' ? verdict.measurement?.mm : undefined,
    defect: verdict.verdict !== 'pass' && category && type && unitsFailed
      ? { category, type, unitsFailed }
      : undefined,
    reason: verdict.signoff.note,
  };
}
