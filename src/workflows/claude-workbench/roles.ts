/**
 * Code-owned roles: every seat shares one versioned form and list page, and
 * enforces them, so every resolve surface validates against the same
 * contract the form runs. The program board has its own.
 */

import type { LTRoleConfig } from '@hotmeshio/long-tail';

import { PROGRAM_FORM_SCHEMA, PROGRAM_LIST_SCHEMA, SEAT_FORM_SCHEMA, SEAT_LIST_SCHEMA, SEAT_METADATA_SCHEMA } from './forms';
import { FACET } from './facets';
import { INBOX_STAGE } from './inbox/types';
import { ORG_PROGRAMS_ROLE, ORG_ROLES, SECTION, holderRoleSpecs, type InboxHolder, type OrgRoleSpec } from './types';

const available = (role: string) => `/escalations/available?role=${role}`;
const bySection = (role: string, section: string) => `${available(role)}&subtype=${section}`;
const PROGRAMS_URL = `${available(ORG_PROGRAMS_ROLE)}&view=table`;

function domainUrl(domain: string) {
  const roles = ORG_ROLES.filter((entry) => entry.domain === domain).map((entry) => entry.role);
  return `/escalations/available?roles=${encodeURIComponent(JSON.stringify(roles))}&view=table`;
}

const json = (value: unknown) => encodeURIComponent(JSON.stringify(value));
/** Soonest first: priority, then age. */
const BY_PRIORITY = json([{ field: 'priority', direction: 'asc' }, { field: 'created_at', direction: 'asc' }]);
const byStage = (role: string, stage: string) => `${available(role)}&facets=${json({ [FACET.STAGE]: stage })}&orderBy=${BY_PRIORITY}`;

/**
 * An inbox's pins are its "what's next": what needs a first decision (soonest
 * first), what the agent brought back, what waits on others, what needs nothing.
 */
function pinsFor(spec: OrgRoleSpec) {
  if (spec.domain === 'people') {
    return [
      { label: 'Next', url: byStage(spec.role, INBOX_STAGE.NEW), badge: true },
      { label: 'Back to you', url: byStage(spec.role, INBOX_STAGE.RETURNED), badge: true },
      { label: 'Waiting on others', url: byStage(spec.role, INBOX_STAGE.WAITING) },
      { label: 'FYI', url: byStage(spec.role, INBOX_STAGE.FYI) },
    ];
  }
  if (spec.domain === 'agents') {
    return [
      { label: 'Acts', url: `${available(spec.role)}&view=table`, badge: true },
      { label: 'Checks', url: bySection(spec.role, 'check') },
    ];
  }
  return [
    { label: 'Work', url: bySection(spec.role, SECTION.WORK), badge: true },
    { label: 'Reviews', url: bySection(spec.role, SECTION.REVIEW), badge: true },
    { label: 'Decisions', url: bySection(spec.role, SECTION.DECIDE), badge: true },
    { label: 'Gates', url: bySection(spec.role, SECTION.GATE), badge: true },
    { label: spec.domain, url: domainUrl(spec.domain) },
    { label: 'Programs', url: PROGRAMS_URL },
  ];
}

/** What cancel and expiry mean for a role's rows, surfaced by get_domain_context and cancel_escalation. */
function verbsFor(spec: OrgRoleSpec) {
  if (spec.domain === 'people') {
    return { on_cancel: 'the item closes as cancelled and keeps its history', on_timeout: 'the same view re-parks after seven days', worked_by: 'people' };
  }
  if (spec.domain === 'agents') {
    return { on_cancel: 'the act fails back to the holder as an outcome; a cancelled check ends the sweep', on_timeout: 'a check re-parks; an act fails back to the holder after a day', worked_by: 'machines' };
  }
  return {
    on_cancel: 'a work, review or decide row ends the deliverable as cancelled; a gate row ends the program',
    on_timeout: 'a work or review round expires and the next begins; a gate timeout counts as a hold',
    worked_by: 'people or AI, by persona',
  };
}

function seatRole(spec: OrgRoleSpec): LTRoleConfig {
  return {
    role: spec.role,
    title: spec.title,
    description: spec.meaning,
    form_schema: SEAT_FORM_SCHEMA,
    list_schema: SEAT_LIST_SCHEMA,
    metadata_schema: SEAT_METADATA_SCHEMA,
    enforce_schema: true,
    default_pins: pinsFor(spec),
    properties: verbsFor(spec),
    reset: true,
  };
}

const programsRole: LTRoleConfig = {
  role: ORG_PROGRAMS_ROLE,
  title: 'Programs',
  description: 'One open row per program; finished deliverables join it until it launches or stops.',
  form_schema: PROGRAM_FORM_SCHEMA,
  list_schema: PROGRAM_LIST_SCHEMA,
  enforce_schema: true,
  default_pins: [{ label: 'Programs', url: PROGRAMS_URL, badge: true }],
  reset: true,
};

export const WORKBENCH_ROLES: LTRoleConfig[] = [...ORG_ROLES.map(seatRole), programsRole];

/** The role configs for a holder bound after boot; the same seat config the code-owned roles use. */
export function holderRoleConfigs(holder: InboxHolder): LTRoleConfig[] {
  return holderRoleSpecs(holder).map(seatRole);
}
