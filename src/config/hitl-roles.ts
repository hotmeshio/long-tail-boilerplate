/**
 * Code-owned HITL roles: each carries its versioned escalation form, its
 * independently versioned list page, and `enforce_schema`, so every resolve
 * surface validates against the same contract the form runs.
 *
 * `reset: true` makes each entry code-owned while the rest of the app stays
 * db-owned: boot compares and applies the declaration, a changed form
 * advances the role's schema version (snapshotted in lt_role_schemas), and
 * local and AWS converge on the same surfaces without a DB wipe. Version
 * numbers are DB history, not code identity (a fresh DB starts at 1), so the
 * workflows render the latest edition rather than pinning a literal.
 */

import type { LTRoleConfig } from '@hotmeshio/long-tail';

import { INTAKE_ROLE, INTAKE_FORM_SCHEMA, INTAKE_LIST_SCHEMA } from '../workflows/rich-form/forms';
import { MODERATOR_ROLE, MODERATOR_FORM_SCHEMA, MODERATOR_LIST_SCHEMA } from '../workflows/content-review/forms';
import { LOT_RECEIVER_ROLE, LOT_INSPECTOR_ROLE } from '../workflows/lot-inspection/types';
import {
  RECEIVE_FORM_SCHEMA,
  RECEIVE_LIST_SCHEMA,
  INSPECT_FORM_SCHEMA,
  INSPECT_LIST_SCHEMA,
} from '../workflows/lot-inspection/forms';
import {
  OWNER_DECIDE_ROLE,
  OWNER_VERIFY_ROLE,
  OWNER_REVIEW_ROLE,
  CLAUDE_NEXT_ROLE,
  CLAUDE_PROJECT_ROLE,
} from '../workflows/claude-workbench/types';
import {
  OWNER_DECIDE_FORM_SCHEMA,
  OWNER_VERIFY_FORM_SCHEMA,
  OWNER_REVIEW_FORM_SCHEMA,
  CLAUDE_NEXT_FORM_SCHEMA,
  OWNER_DECIDE_LIST_SCHEMA,
  OWNER_VERIFY_LIST_SCHEMA,
  OWNER_REVIEW_LIST_SCHEMA,
  CLAUDE_NEXT_LIST_SCHEMA,
} from '../workflows/claude-workbench/forms';
import { CLAUDE_PROJECT_FORM_SCHEMA, CLAUDE_PROJECT_LIST_SCHEMA } from '../workflows/claude-workbench/project-form';
import { CREW_ROLES } from '../workflows/agent-crew/roles';

const queue = (role: string) => `/escalations/available?role=${role}`;

export const HITL_ROLES: LTRoleConfig[] = [
  {
    role: INTAKE_ROLE,
    title: 'Intake Reviewer',
    description: 'Reviews new-customer intake: the rich-form escalation surface.',
    form_schema: INTAKE_FORM_SCHEMA,
    list_schema: INTAKE_LIST_SCHEMA,
    enforce_schema: true,
    reset: true,
  },
  {
    role: MODERATOR_ROLE,
    title: 'Content Moderator',
    description: 'Decides content the analyzer could not approve.',
    form_schema: MODERATOR_FORM_SCHEMA,
    list_schema: MODERATOR_LIST_SCHEMA,
    enforce_schema: true,
    reset: true,
  },
  {
    role: LOT_RECEIVER_ROLE,
    title: 'Lot Receiver',
    description: 'Counts incoming lots at the dock.',
    form_schema: RECEIVE_FORM_SCHEMA,
    list_schema: RECEIVE_LIST_SCHEMA,
    enforce_schema: true,
    default_pins: [{ label: 'Receiving', url: queue(LOT_RECEIVER_ROLE), badge: true }],
    reset: true,
  },
  {
    role: LOT_INSPECTOR_ROLE,
    title: 'Lot Inspector',
    description: 'Measures received lots and records pass, rework, or scrap.',
    form_schema: INSPECT_FORM_SCHEMA,
    list_schema: INSPECT_LIST_SCHEMA,
    enforce_schema: true,
    default_pins: [
      { label: 'Inspection', url: queue(LOT_INSPECTOR_ROLE), badge: true },
      { label: 'At the dock', url: queue(LOT_RECEIVER_ROLE), badge: true },
    ],
    reset: true,
  },
  {
    role: OWNER_DECIDE_ROLE,
    title: 'Owner: Decide',
    description: 'Decisions only the owner can make; Claude parks the question and stops.',
    form_schema: OWNER_DECIDE_FORM_SCHEMA,
    list_schema: OWNER_DECIDE_LIST_SCHEMA,
    enforce_schema: true,
    default_pins: [{ label: 'Decide', url: queue(OWNER_DECIDE_ROLE), badge: true }],
    reset: true,
  },
  {
    role: OWNER_VERIFY_ROLE,
    title: 'Owner: Verify',
    description: 'Manual checks for the owner: a sim, a browser pass, staging.',
    form_schema: OWNER_VERIFY_FORM_SCHEMA,
    list_schema: OWNER_VERIFY_LIST_SCHEMA,
    enforce_schema: true,
    default_pins: [{ label: 'Verify', url: queue(OWNER_VERIFY_ROLE), badge: true }],
    reset: true,
  },
  {
    role: OWNER_REVIEW_ROLE,
    title: 'Owner: Review',
    description: 'PRs and documents ready for the owner to review.',
    form_schema: OWNER_REVIEW_FORM_SCHEMA,
    list_schema: OWNER_REVIEW_LIST_SCHEMA,
    enforce_schema: true,
    default_pins: [{ label: 'Review', url: queue(OWNER_REVIEW_ROLE), badge: true }],
    reset: true,
  },
  {
    role: CLAUDE_NEXT_ROLE,
    title: 'Claude: Next',
    description: 'Work queued for a future Claude session, claimed at session start.',
    form_schema: CLAUDE_NEXT_FORM_SCHEMA,
    list_schema: CLAUDE_NEXT_LIST_SCHEMA,
    enforce_schema: true,
    default_pins: [{ label: 'Claude next', url: queue(CLAUDE_NEXT_ROLE), badge: true }],
    reset: true,
  },
  {
    role: CLAUDE_PROJECT_ROLE,
    title: 'Claude: Projects',
    description: 'One open row per project; each Claude session that works it joins as an item.',
    form_schema: CLAUDE_PROJECT_FORM_SCHEMA,
    list_schema: CLAUDE_PROJECT_LIST_SCHEMA,
    enforce_schema: true,
    default_pins: [{ label: 'Projects', url: queue(CLAUDE_PROJECT_ROLE), badge: true }],
    reset: true,
  },
  ...CREW_ROLES,
];
