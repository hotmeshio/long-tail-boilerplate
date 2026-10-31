/**
 * Agent crew activities. `recordPiece` adds a finished piece to its
 * workstream row by the row's home signal, acting as the coordinator. It is
 * safe to run twice: a repeated add answers `duplicate-item`, which counts as
 * done. A missing row throws so the activity retries until the workstream
 * has parked it.
 */

import { createClient } from '@hotmeshio/long-tail';

import type { PieceItem } from './types';

const DUPLICATE_ITEM = 'duplicate-item';

function isDuplicate(result: { status: number; data?: { outcome?: string }; error?: string }) {
  return result.status === 409 && (result.data?.outcome === DUPLICATE_ITEM || result.error?.includes(DUPLICATE_ITEM));
}

export async function recordPiece(input: { signalKey: string; item: PieceItem; coordinatorId: string }): Promise<{ recorded: boolean }> {
  const lt = createClient({ auth: { userId: input.coordinatorId } });
  const result = await lt.escalations.accumulateBySignalKey({
    signalKey: input.signalKey,
    itemKey: input.item.key,
    payload: { piece: input.item },
  });
  if (result.status < 300 || isDuplicate(result)) return { recorded: true };
  throw new Error(`recordPiece ${input.item.key}: ${result.status} ${result.error ?? ''}`);
}
