/**
 * Pure builders for what a row carries: its metadata facets, its envelope and
 * its ids. Absent optional facts are left off, so `metadata @>` never matches
 * a null. Every signal id is scoped to the workflow that owns it; HotMesh
 * keeps workflow ids unique per invoke and across continueAsNew.
 */

import { AI_WINDOW_MINUTES, ORG_ROLES, type AiMode, type Section } from './types';

export const FACET = {
  PROGRAM: 'program',
  PHASE: 'phase',
  DELIVERABLE: 'deliverable',
  KIND: 'kind',
  SEAT: 'seat',
  DOMAIN: 'domain',
  RACI: 'raci',
  ROUND: 'round',
  AI: 'ai',
  TEMPLATE: 'template',
  SECTION: 'section',
  HOLDER: 'holder',
  SOURCE: 'source',
  ITEM: 'item',
  ACT: 'act',
  CATEGORY: 'category',
  NEED: 'need',
  CHANNEL: 'channel',
  SENT_AT: 'sentAt',
  VIEW: 'view',
  WAITING_ON: 'waitingOn',
  STAGE: 'stage',
} as const;

/** Drops undefined values so absent facts never become null facets. */
export function present<T extends Record<string, unknown>>(facets: T): Partial<T> {
  return Object.fromEntries(Object.entries(facets).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export function domainOf(role: string): string | undefined {
  return ORG_ROLES.find((entry) => entry.role === role)?.domain;
}

export interface RowFacetSource {
  seat: string;
  section: Section;
  raci: string;
  program?: string;
  phase?: string;
  deliverable?: string;
  kind?: string;
  round?: number;
  ai?: AiMode;
  template?: string;
}

export function rowFacets(source: RowFacetSource) {
  return present({
    [FACET.SEAT]: source.seat,
    [FACET.DOMAIN]: domainOf(source.seat),
    [FACET.SECTION]: source.section,
    [FACET.RACI]: source.raci,
    [FACET.PROGRAM]: source.program,
    [FACET.PHASE]: source.phase,
    [FACET.DELIVERABLE]: source.deliverable,
    [FACET.KIND]: source.kind,
    [FACET.ROUND]: source.round,
    [FACET.AI]: source.ai,
    [FACET.TEMPLATE]: source.template,
  });
}

/** The envelope a seat row renders from: its section gates the form, the brief fills it. */
export function sectionEnvelope(section: Section, brief: string, extra: Record<string, unknown> = {}) {
  return { section, ...extra, formDefaults: { brief } };
}

/** A work row's assignment under an AI mode: none, or a hard claim for the bot's first-right window. */
export function aiAssignment(ai: AiMode | undefined, botId: string): { assignee?: string; durationMinutes?: number } {
  if (!ai || ai === 'none') return {};
  return { assignee: botId, durationMinutes: AI_WINDOW_MINUTES[ai] };
}

export const boardSignal = (programWfId: string) => `${programWfId}-board`;
export const deliverableChildId = (programWfId: string, phaseIndex: number, kind: string, gateRound: number) =>
  `${programWfId}-p${phaseIndex}-${kind}-g${gateRound}`;
export const roundSignal = (deliverableWfId: string, round: number, section: Section) => `${deliverableWfId}-r${round}-${section}`;
export const gateSignal = (programWfId: string, phaseIndex: number, gateRound: number, role: string) =>
  `${programWfId}-p${phaseIndex}-g${gateRound}-${role}`;
export const holdSignal = (programWfId: string, phaseIndex: number, gateRound: number) => `${programWfId}-p${phaseIndex}-g${gateRound}-decide`;
export const askSignal = (askWfId: string) => `${askWfId}-ask`;
