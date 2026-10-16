/**
 * Lot inspection contracts: role names, the invoke input, and the payloads
 * each escalation returns (declared once as zod; types derive from them).
 */

import { z } from 'zod';

import { blankAsAbsent } from '../../lib/form-values';

export const LOT_RECEIVER_ROLE = 'lot-receiver';
export const LOT_INSPECTOR_ROLE = 'lot-inspector';

export const RECEIPT_OUTCOMES = [
  { value: 'accept', label: 'Accept the full lot' },
  { value: 'short', label: 'Accept a short count' },
  { value: 'refuse', label: 'Refuse the lot' },
] as const;

export const VERDICTS = [
  { value: 'pass', label: 'Pass' },
  { value: 'rework', label: 'Rework' },
  { value: 'scrap', label: 'Scrap' },
] as const;

export const DOCK_DOORS = ['D1', 'D2', 'D3', 'D4'] as const;

type Values<T extends readonly { value: string }[]> = [T[number]['value'], ...T[number]['value'][]];
const receiptValues = RECEIPT_OUTCOMES.map((o) => o.value) as Values<typeof RECEIPT_OUTCOMES>;
const verdictValues = VERDICTS.map((v) => v.value) as Values<typeof VERDICTS>;

/** The invoke payload (x-lt-bind shape of the lotInspection input form). */
export interface LotInspectionInput {
  lot: { number: string; partFamily: string; expectedUnits: number };
  inspection: { sampleSize: number; tolerance: { min: number; max: number } };
  receiving?: { docks?: string[] };
  priority?: number | null;
}

const lotFacts = z.object({
  number: blankAsAbsent(z.string()),
  partFamily: blankAsAbsent(z.string()),
  expectedUnits: blankAsAbsent(z.number()),
  unitsReceived: blankAsAbsent(z.number()),
  sampleSize: blankAsAbsent(z.number()),
}).optional();

export const ReceiptResolverSchema = z.object({
  lot: lotFacts,
  receipt: z.object({
    outcome: z.enum(receiptValues),
    unitsReceived: blankAsAbsent(z.number().int().positive()),
    reason: blankAsAbsent(z.string()),
    dock: blankAsAbsent(z.string()),
  }),
});
export type ReceiptResolver = z.infer<typeof ReceiptResolverSchema>;

/** Hidden branches arrive blank, so every branch field is optional here; the activity reads the verdict's branch. */
export const VerdictResolverSchema = z.object({
  lot: lotFacts,
  verdict: z.enum(verdictValues),
  measurement: z.object({ mm: blankAsAbsent(z.number()) }).optional(),
  inspection: z.object({ checks: z.record(z.boolean()) }).optional(),
  defect: z.object({
    category: blankAsAbsent(z.string()),
    type: blankAsAbsent(z.string()),
    unitsFailed: blankAsAbsent(z.number().int().positive()),
    evidence: blankAsAbsent(z.string()),
  }).optional(),
  signoff: z.object({ note: blankAsAbsent(z.string()), signature: z.string().min(1) }),
});
export type VerdictResolver = z.infer<typeof VerdictResolverSchema>;

export interface LotInspectionResult {
  lotNumber: string;
  outcome: 'refused' | 'passed' | 'rework' | 'scrapped' | 'cancelled' | 'expired';
  unitsReceived?: number;
  measuredMm?: number;
  defect?: { category: string; type: string; unitsFailed: number };
  reason?: string;
}
