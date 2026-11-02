/**
 * Workbench activities. All act as the coordinator principal and are safe to
 * run twice: a repeated add answers `duplicate-item`, a repeated close finds
 * the row already resolved, and both count as done. A missing edition throws
 * so the activity retries until the seed has written it.
 */

import { KnowledgeApi, createClient } from '@hotmeshio/long-tail';

import { EDITION_KEY, ORG_DOMAIN, PINNED_KEYS, deliverableTypeByKind, templateByKey } from './org';
import { COORDINATOR_ID } from './personas';
import type { BoardItem, Closing, DeliverableType, OrgPins, ProgramTemplate } from './types';

const lt = () => createClient({ auth: { userId: COORDINATOR_ID } });

const DUPLICATE_ITEM = 'duplicate-item';

function isDuplicate(result: { status: number; data?: { outcome?: string }; error?: string }) {
  return result.status === 409 && (result.data?.outcome === DUPLICATE_ITEM || result.error?.includes(DUPLICATE_ITEM));
}

function currentVersion(result: { status: number; data?: any; error?: string }, key: string): number {
  const versions: any[] = Array.isArray(result.data?.versions) ? result.data.versions : Array.isArray(result.data) ? result.data : [];
  const numbers = versions.map((entry) => Number(entry?.version)).filter((n) => Number.isFinite(n) && n > 0);
  if (result.status >= 400 || !numbers.length) throw new Error(`org/${key}: no edition yet (${result.error ?? result.status})`);
  return Math.max(...numbers);
}

/** The edition numbers in force now; a program pins these for life. */
export async function pinOrgEditions(): Promise<OrgPins> {
  const pins: Partial<OrgPins> = {};
  for (const key of PINNED_KEYS) {
    const result = await KnowledgeApi.listEntryVersions({ domain: ORG_DOMAIN, key });
    pins[key] = currentVersion(result, key);
  }
  return pins as OrgPins;
}

function editionItems<T>(result: { status: number; data?: any; error?: string }, key: string): T[] {
  const items = result.data?.data?.items ?? result.data?.items;
  if (result.status >= 400 || !Array.isArray(items)) throw new Error(`org/${key}: edition unreadable (${result.error ?? result.status})`);
  return items as T[];
}

/** The template and the deliverable types a program runs against, from its pinned editions. */
export async function readTemplate(input: { pins: OrgPins; template: string }): Promise<{ template: ProgramTemplate; types: Record<string, DeliverableType> }> {
  const programs = await KnowledgeApi.getEntryVersion({ domain: ORG_DOMAIN, key: EDITION_KEY.PROGRAMS, version: input.pins.programs });
  const template = templateByKey(editionItems<ProgramTemplate>(programs, EDITION_KEY.PROGRAMS), input.template);
  if (!template) throw new Error(`org/programs: no template "${input.template}"`);

  const typesResult = await KnowledgeApi.getEntryVersion({ domain: ORG_DOMAIN, key: EDITION_KEY.TYPES, version: input.pins['deliverable-types'] });
  const typeItems = editionItems<DeliverableType>(typesResult, EDITION_KEY.TYPES);
  const types: Record<string, DeliverableType> = {};
  for (const phase of template.phases) {
    for (const kind of phase.deliverables) {
      const type = deliverableTypeByKind(typeItems, kind);
      if (!type) throw new Error(`org/deliverable-types: no type "${kind}" for template "${input.template}"`);
      types[kind] = type;
    }
  }
  return { template, types };
}

/** The deliverable type in force now; a standalone deliverable takes its producer, reviewer and AI mode from it. */
export async function readDeliverableType(input: { kind: string }): Promise<DeliverableType> {
  const result = await KnowledgeApi.getEntry({ domain: ORG_DOMAIN, key: EDITION_KEY.TYPES });
  const type = deliverableTypeByKind(editionItems<DeliverableType>(result, EDITION_KEY.TYPES), input.kind);
  if (!type) throw new Error(`org/deliverable-types: no type "${input.kind}"`);
  return type;
}

/** Add a finished deliverable to its program's board. */
export async function recordDeliverable(input: { signalKey: string; item: BoardItem }): Promise<{ recorded: boolean }> {
  const result = await lt().escalations.accumulateBySignalKey({
    signalKey: input.signalKey,
    itemKey: input.item.key,
    payload: { item: input.item },
  });
  if (result.status < 300 || isDuplicate(result)) return { recorded: true };
  throw new Error(`recordDeliverable ${input.item.key}: ${result.status} ${result.error ?? ''}`);
}

/** Close the board when the program ends. A board already closed by hand counts as closed. */
export async function closeProgram(input: { signalKey: string; closing: Closing }): Promise<{ closed: boolean }> {
  const result = await lt().escalations.resolveBySignalKey({ signalKey: input.signalKey, resolverPayload: { closing: input.closing } });
  if (result.status < 300 || result.status === 404 || result.status === 409) return { closed: true };
  throw new Error(`closeProgram ${input.signalKey}: ${result.status} ${result.error ?? ''}`);
}
