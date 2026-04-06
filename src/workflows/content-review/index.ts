/**
 * Content Review — durable workflow with escalation.
 *
 * Demonstrates:
 *   - AI-powered content analysis
 *   - Confidence-based escalation to human reviewers
 *   - Return vs escalation envelope types
 */

import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import * as activities from './activities';

type ActivitiesType = typeof activities;

const { analyzeContent } = Durable.workflow.proxyActivities<ActivitiesType>({
  activities,
});

export async function reviewContent(envelope: LTEnvelope): Promise<any> {
  const { content, threshold = 0.7 } = envelope.data;

  const analysis = await analyzeContent({ content });

  if (analysis.confidence >= threshold) {
    return {
      type: 'return' as const,
      data: {
        status: 'approved',
        ...analysis,
      },
    };
  }

  // Low confidence — escalate to a human reviewer
  return {
    type: 'escalation' as const,
    role: 'reviewer',
    message: `Content flagged for review (confidence: ${analysis.confidence})`,
    data: {
      status: 'needs_review',
      ...analysis,
    },
  };
}
