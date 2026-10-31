/**
 * Code-owned agent crew roles. Each enforces its form, so every resolve and
 * every accumulator add validates the same contract the form runs.
 */

import type { LTRoleConfig } from '@hotmeshio/long-tail';

import { AGENT_WORK_FORM_SCHEMA, AGENT_WORK_LIST_SCHEMA } from './handoff-form';
import {
  AGENT_REVIEW_FORM_SCHEMA,
  AGENT_REVIEW_LIST_SCHEMA,
  AGENT_PLAN_FORM_SCHEMA,
  AGENT_PLAN_LIST_SCHEMA,
  BRANCH_LEASE_FORM_SCHEMA,
  BRANCH_LEASE_LIST_SCHEMA,
} from './crew-forms';
import { WORKSTREAM_FORM_SCHEMA, WORKSTREAM_LIST_SCHEMA } from './workstream-form';
import { AGENT_PLAN_ROLE, AGENT_REVIEW_ROLE, AGENT_WORK_ROLE, BRANCH_LEASE_ROLE, WORKSTREAM_ROLE } from './types';

const queue = (role: string) => `/escalations/available?role=${role}`;

function crewRole(role: string, title: string, description: string, formSchema: object, listSchema: object, pinLabel: string): LTRoleConfig {
  return {
    role,
    title,
    description,
    form_schema: formSchema,
    list_schema: listSchema,
    enforce_schema: true,
    default_pins: [{ label: pinLabel, url: queue(role), badge: true }],
    reset: true,
  };
}

export const CREW_ROLES: LTRoleConfig[] = [
  crewRole(AGENT_WORK_ROLE, 'Agent: Work', 'Pieces of work any agent may claim by area and skill; the claim is the lease.', AGENT_WORK_FORM_SCHEMA, AGENT_WORK_LIST_SCHEMA, 'Agent work'),
  crewRole(AGENT_REVIEW_ROLE, 'Agent: Review', 'Handoffs awaiting review by an agent that did not build them.', AGENT_REVIEW_FORM_SCHEMA, AGENT_REVIEW_LIST_SCHEMA, 'Agent review'),
  crewRole(AGENT_PLAN_ROLE, 'Agent: Plan', 'Goals awaiting a planner to break them into pieces.', AGENT_PLAN_FORM_SCHEMA, AGENT_PLAN_LIST_SCHEMA, 'Agent plan'),
  crewRole(BRANCH_LEASE_ROLE, 'Branch leases', 'One row per repo and branch; holding the claim is holding the branch.', BRANCH_LEASE_FORM_SCHEMA, BRANCH_LEASE_LIST_SCHEMA, 'Branch leases'),
  crewRole(WORKSTREAM_ROLE, 'Workstreams', 'One row per goal; finished pieces join it until every piece is in.', WORKSTREAM_FORM_SCHEMA, WORKSTREAM_LIST_SCHEMA, 'Workstreams'),
];
