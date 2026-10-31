/**
 * claudeProject: one open accumulator per project. Sessions join it by its
 * home signal, `accumulateBySignalKey({ signalKey: 'claude-project-<slug>',
 * itemKey: sessionId, payload: { session } })`; the row stays pending until the
 * owner closes it by hand. "Which sessions worked this project" and "which
 * project holds this session" both read from the row (`accumulate_keys` is
 * `metadata @>`-queryable).
 */

import { conditionalAccumulator } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { briefEnvelope, projectSignalId, workbenchFacets } from './facets';
import { CLAUDE_PROJECT_ROLE } from './types';
import type { ClaudeProjectInput, SessionItem, WorkbenchResult } from './types';

const PROJECT_PRIORITY = 4;

export async function claudeProject(envelope: LTEnvelope): Promise<{ type: 'return'; data: WorkbenchResult }> {
  const input = envelope.data as ClaudeProjectInput;

  const project = await conditionalAccumulator<{ session: SessionItem }>(projectSignalId(input.project), {
    role: CLAUDE_PROJECT_ROLE,
    type: 'workbench',
    subtype: CLAUDE_PROJECT_ROLE,
    priority: PROJECT_PRIORITY,
    description: input.headline,
    workflowType: 'claudeProject',
    metadata: { ...workbenchFacets(input, CLAUDE_PROJECT_ROLE), ...(input.repo ? { repo: input.repo } : {}) },
    envelope: briefEnvelope(input.brief),
    accumulate: {},
  });

  if (project === null) return { type: 'return', data: { project: input.project, outcome: 'cancelled' } };

  const { $accumulated, $trigger, $resolution, ...closing } = project;
  return {
    type: 'return',
    data: {
      project: input.project,
      outcome: 'resolved',
      resolution: { ...closing, trigger: $trigger, sessions: $accumulated.map((entry) => entry.itemKey) },
      resolvedBy: $resolution?.resolvedBy,
    },
  };
}
