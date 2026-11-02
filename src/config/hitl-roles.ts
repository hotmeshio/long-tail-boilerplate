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
import { WORKBENCH_ROLES } from '../workflows/claude-workbench';

/**
 * The ortho pipeline's stations. They exist for load testing and were once
 * switched onto the Pace Board by hand; the boards belong to the workbench,
 * so code keeps them off. Only the two board flags are declared, so the
 * rest of each row (forms, capacity dials) stays as it is.
 */
const ORTHO_STATIONS = ['ingester', 'renderer', 'validator', 'printer', 'grinder', 'finisher', 'packager', 'shipper'];
const BOARD_HIDDEN_ROLES: LTRoleConfig[] = ORTHO_STATIONS.map((role) => ({ role, ops_visible: false, ops_home_default: false, reset: true }));

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
  // The workbench org: one seat per role, sharing one form, plus the program board.
  ...WORKBENCH_ROLES,
  ...BOARD_HIDDEN_ROLES,
];
