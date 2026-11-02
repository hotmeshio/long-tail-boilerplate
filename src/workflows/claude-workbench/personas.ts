/**
 * Personas are collections of roles, which is how Long Tail organizes
 * access. One member persona and one AI persona per role, a composed example
 * for one person, and the coordinator the system writes boards as. Bots are
 * ordinary principals holding personas; their persona is their mode.
 */

import type { LTPersonaSpec } from '@hotmeshio/long-tail';

import { HOLDERS, ORG_PROGRAMS_ROLE, TEAM_ROLES, parseHolder, type InboxHolder, type OrgRoleSpec } from './types';

type Relationship = LTPersonaSpec['roles'][number]['relationship'];

const link = (roles: readonly string[], relationship: Relationship) => roles.map((role) => ({ role, relationship }));

const domainPeers = (spec: OrgRoleSpec) => TEAM_ROLES.filter((entry) => entry.domain === spec.domain && entry.role !== spec.role).map((entry) => entry.role);

export const memberPersonaKey = (role: string) => `member-${role}`;
export const aiPersonaKey = (role: string) => `ai-${role}`;
export const COORDINATOR_PERSONA = 'org-coordinator';

function memberPersona(spec: OrgRoleSpec): LTPersonaSpec {
  return {
    key: memberPersonaKey(spec.role),
    title: `Member: ${spec.title}`,
    description: `Works the ${spec.role} queue; reads the rest of ${spec.domain} and the programs.`,
    roles: [...link([spec.role], 'write-all'), ...link([...domainPeers(spec), ORG_PROGRAMS_ROLE], 'read-all')],
  };
}

function aiPersona(spec: OrgRoleSpec): LTPersonaSpec {
  return {
    key: aiPersonaKey(spec.role),
    title: `AI: ${spec.title}`,
    description: `Acts only on ${spec.role} rows assigned to it; reads the rest of ${spec.domain} and the programs.`,
    roles: [...link([spec.role], 'write-self'), ...link([...domainPeers(spec), ORG_PROGRAMS_ROLE], 'read-all')],
  };
}

/** The example person: an engineer across four engineering roles, with a personal inbox. */
const SAM_TEAM_ROLES = ['engineering-execution', 'engineering-lab', 'engineering-platform', 'engineering-leadership'];

/** One person's persona: the collection of roles they hold. Their inbox and agent queue, the programs, and for `sam` the example team roles. */
export function holderPersona(holder: InboxHolder): LTPersonaSpec {
  const teamRoles = holder.name === 'sam' ? SAM_TEAM_ROLES : [];
  return {
    key: holder.persona,
    title: holder.title,
    description: teamRoles.length ? 'An engineer across execution, lab, platform and leadership, with a personal inbox.' : 'A person with a personal inbox.',
    roles: [...link([...teamRoles, holder.role, holder.agentRole], 'write-all'), ...link([ORG_PROGRAMS_ROLE], 'read-all')],
  };
}

export const HOLDER_PERSONAS: LTPersonaSpec[] = HOLDERS.map(holderPersona);
export const SAM_PERSONA: LTPersonaSpec = holderPersona(parseHolder('sam')!);

export const COORDINATOR_PERSONA_SPEC: LTPersonaSpec = {
  key: COORDINATOR_PERSONA,
  title: 'Org coordinator',
  description: 'The system principal that adds finished deliverables to program boards and closes them.',
  roles: link([ORG_PROGRAMS_ROLE], 'write-all'),
};

export const WORKBENCH_PERSONAS: LTPersonaSpec[] = [
  ...TEAM_ROLES.map(memberPersona),
  ...TEAM_ROLES.map(aiPersona),
  ...HOLDER_PERSONAS,
  COORDINATOR_PERSONA_SPEC,
];

export interface WorkbenchBot {
  id: string;
  externalId: string;
  display: string;
  personas: string[];
}

const botUuid = (n: number) => `0d000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const CLAUDE_BOT_ID = botUuid(11);
export const COORDINATOR_ID = botUuid(12);

export const WORKBENCH_BOTS: WorkbenchBot[] = [
  { id: CLAUDE_BOT_ID, externalId: 'claude-at-work', display: 'Claude at Work', personas: [aiPersonaKey('engineering-platform')] },
  { id: COORDINATOR_ID, externalId: 'workbench-coordinator', display: 'Workbench Coordinator', personas: [COORDINATOR_PERSONA] },
];
