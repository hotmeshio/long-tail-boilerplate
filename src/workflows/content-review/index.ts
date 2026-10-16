/**
 * Content Review: durable workflow with interceptor-raised escalation.
 *
 * Demonstrates:
 *   - Content analysis with a confidence score
 *   - Confidence-based escalation to the `content-moderator` role, whose
 *     versioned form drives the decision
 *   - The certified re-run: once a moderator resolves, the interceptor runs
 *     the workflow again with `envelope.resolver` set, and it returns
 */

import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import * as activities from './activities';
import { MODERATOR_ROLE, type ModerationResolver } from './forms';

type ActivitiesType = typeof activities;

const { analyzeContent } = Durable.workflow.proxyActivities<ActivitiesType>({
  activities,
});

export async function reviewContent(envelope: LTEnvelope): Promise<any> {
  const { contentId, content, threshold = 0.7 } = envelope.data;

  // Re-run after a moderator resolved the escalation
  const resolver = envelope.resolver as ModerationResolver | undefined;
  if (resolver?.moderation) {
    return {
      type: 'return' as const,
      data: { contentId, status: 'moderated', ...resolver.moderation },
    };
  }

  const analysis = await analyzeContent({ content });

  if (analysis.confidence >= threshold) {
    return {
      type: 'return' as const,
      data: { contentId, status: 'approved', ...analysis },
    };
  }

  return {
    type: 'escalation' as const,
    role: MODERATOR_ROLE,
    message: `Moderate ${contentId ?? 'untitled content'}`,
    data: { contentId, content, status: 'needs_review', ...analysis },
  };
}
