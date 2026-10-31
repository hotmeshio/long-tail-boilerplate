/**
 * Agent crew personas, one per agent kind. A builder cannot review and a
 * reviewer cannot build, so approval always comes from a different agent.
 */

import { AGENT_PERSONA_KEYS } from './principals';
import { AGENT_PLAN_ROLE, AGENT_REVIEW_ROLE, AGENT_WORK_ROLE, BRANCH_LEASE_ROLE, WORKSTREAM_ROLE } from './types';

type Relationship = 'write-all' | 'read-all';

const linkAll = (roles: string[], relationship: Relationship) => roles.map((role) => ({ role, relationship }));

export const CREW_PERSONAS = [
  {
    key: AGENT_PERSONA_KEYS.BUILDER,
    title: 'Agent: Builder',
    description: 'Works pieces and holds branch leases; reads plans and reviews.',
    roles: [...linkAll([AGENT_WORK_ROLE, BRANCH_LEASE_ROLE], 'write-all'), ...linkAll([AGENT_PLAN_ROLE, AGENT_REVIEW_ROLE, WORKSTREAM_ROLE], 'read-all')],
  },
  {
    key: AGENT_PERSONA_KEYS.REVIEWER,
    title: 'Agent: Reviewer',
    description: 'Reviews pieces another agent handed off; reads the work and the leases.',
    roles: [...linkAll([AGENT_REVIEW_ROLE], 'write-all'), ...linkAll([AGENT_WORK_ROLE, BRANCH_LEASE_ROLE, WORKSTREAM_ROLE], 'read-all')],
  },
  {
    key: AGENT_PERSONA_KEYS.PLANNER,
    title: 'Agent: Planner',
    description: 'Breaks goals into pieces; reads the work it started.',
    roles: [...linkAll([AGENT_PLAN_ROLE], 'write-all'), ...linkAll([AGENT_WORK_ROLE, WORKSTREAM_ROLE], 'read-all')],
  },
  {
    key: AGENT_PERSONA_KEYS.COORDINATOR,
    title: 'Workstream Coordinator',
    description: 'Adds finished pieces to their workstream row.',
    roles: linkAll([WORKSTREAM_ROLE], 'write-all'),
  },
];
