/**
 * emitBambuEvent — the machine's voice. Builds a real `PrinterBambuDto`-shaped
 * event and delivers it the way real hardware does: an HTTP POST to a webhook.
 *
 * Delivery target is env-driven (`BAMBU_WEBHOOK_URL`); when set, the event POSTs
 * with the shared-secret header Acme's guard will enforce (`BAMBU_WEBHOOK_SECRET`).
 * When unset the emit is log-only — the boilerplate's tests assert on the event
 * history the workflow accumulates from this activity's return value, so no sink
 * is required to prove behavior.
 *
 * The timestamp is minted HERE (activities are checkpointed; workflows must stay
 * deterministic) and returned so the workflow can record it replay-safe.
 */

import { HMS_WIKI_URL } from '../types';
import type { BambuErrorDetails, BambuEventType, BambuPrinterEvent } from '../types';

const WEBHOOK_HEADER = 'x-printer-webhook-secret';
const DELIVERY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

export interface EmitBambuEventInput {
  eventType: BambuEventType;
  deviceId: string;
  fileName?: string;
  errorDetails?: BambuErrorDetails;
}

export async function emitBambuEvent(input: EmitBambuEventInput): Promise<BambuPrinterEvent> {
  const event: BambuPrinterEvent = {
    event_type: input.eventType,
    printer_sn: input.deviceId,
    timestamp: Math.floor(Date.now() / 1000),
    ...(input.fileName ? { file_name: input.fileName } : {}),
    ...(input.errorDetails
      ? { error_details: { hms_wiki_url: HMS_WIKI_URL, ...input.errorDetails } }
      : {}),
  };

  const url = process.env.BAMBU_WEBHOOK_URL;
  if (!url) {
    console.log(`[bambu-farm] ${event.printer_sn} → ${event.event_type} (log-only, no BAMBU_WEBHOOK_URL)`);
    return event;
  }

  const secret = process.env.BAMBU_WEBHOOK_SECRET;
  let lastError: unknown;
  for (let attempt = 0; attempt < DELIVERY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { [WEBHOOK_HEADER]: secret } : {}),
        },
        body: JSON.stringify(event),
      });
      if (res.ok) return event;
      lastError = new Error(`webhook ${url} → ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  throw new Error(`bambu event delivery failed after ${DELIVERY_ATTEMPTS} attempts: ${String(lastError)}`);
}
