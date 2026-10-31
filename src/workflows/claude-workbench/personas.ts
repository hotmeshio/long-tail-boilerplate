/**
 * Workbench personas: `owner` works the owner queues, closes projects and
 * workstreams, and watches everything queued for agents; `claude` (a full
 * session) works its own queues and the whole agent crew, and watches the
 * owner queues.
 */

import { AGENT_PLAN_ROLE, AGENT_REVIEW_ROLE, AGENT_WORK_ROLE, BRANCH_LEASE_ROLE, WORKSTREAM_ROLE } from '../agent-crew/types';
import {
  CLAUDE_NEXT_ROLE,
  CLAUDE_PROJECT_ROLE,
  OWNER_DECIDE_ROLE,
  OWNER_REVIEW_ROLE,
  OWNER_VERIFY_ROLE,
} from './types';

type Relationship = 'write-all' | 'read-all';

const OWNER_ROLES = [OWNER_DECIDE_ROLE, OWNER_VERIFY_ROLE, OWNER_REVIEW_ROLE];
const AGENT_ROLES = [AGENT_WORK_ROLE, AGENT_REVIEW_ROLE, AGENT_PLAN_ROLE, BRANCH_LEASE_ROLE];

const linkAll = (roles: string[], relationship: Relationship) => roles.map((role) => ({ role, relationship }));

export const WORKBENCH_PERSONAS = [
  {
    key: 'owner',
    title: 'Owner',
    description: 'Decides, verifies, reviews and closes projects and workstreams; watches the work queued for agents.',
    roles: [
      ...linkAll([...OWNER_ROLES, CLAUDE_PROJECT_ROLE, WORKSTREAM_ROLE], 'write-all'),
      ...linkAll([CLAUDE_NEXT_ROLE, ...AGENT_ROLES], 'read-all'),
    ],
  },
  {
    key: 'claude',
    title: 'Claude',
    description: 'Works the queued sessions, the project rows and the agent crew; watches the owner queues.',
    roles: [...linkAll([CLAUDE_NEXT_ROLE, CLAUDE_PROJECT_ROLE, ...AGENT_ROLES], 'write-all'), ...linkAll([...OWNER_ROLES, WORKSTREAM_ROLE], 'read-all')],
  },
];
