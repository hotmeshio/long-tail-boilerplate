/**
 * Agent crew principals: stable bot UUIDs (`0d..` namespace), one per agent
 * kind, each holding exactly its persona. Distinct principals make a claim a
 * lease between agents, and `$resolution` names which agent did what.
 */

export const AGENT_PERSONA_KEYS = {
  BUILDER: 'agent-builder',
  REVIEWER: 'agent-reviewer',
  PLANNER: 'agent-planner',
  COORDINATOR: 'workstream-coordinator',
} as const;

export interface AgentPrincipal {
  id: string;
  externalId: string;
  display: string;
  persona: string;
}

function agentUuid(n: number): string {
  return `0d000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export const AGENT_PRINCIPALS: AgentPrincipal[] = [
  { id: agentUuid(1), externalId: 'claude-builder', display: 'Claude Builder', persona: AGENT_PERSONA_KEYS.BUILDER },
  { id: agentUuid(2), externalId: 'claude-reviewer', display: 'Claude Reviewer', persona: AGENT_PERSONA_KEYS.REVIEWER },
  { id: agentUuid(3), externalId: 'claude-planner', display: 'Claude Planner', persona: AGENT_PERSONA_KEYS.PLANNER },
  { id: agentUuid(4), externalId: 'workstream-coordinator', display: 'Workstream Coordinator', persona: AGENT_PERSONA_KEYS.COORDINATOR },
];

/** The principal workstream activities act as when they add a finished piece. */
export const COORDINATOR_ID = agentUuid(4);
