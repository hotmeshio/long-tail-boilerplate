/**
 * The item's routing table, pure: which decision leads to which act, and
 * which act result leads back to which view. The workflow only parks what
 * these name. An unreadable answer re-parks the same row.
 */

import {
  DRAFT_DECISIONS,
  FOLLOW_UP_DECISIONS,
  INBOX_ACT,
  INBOX_VIEW,
  ITEM_CLOSE,
  TRIAGE_DECISION,
  TRIAGE_DECISIONS,
  WAITING_DECISIONS,
  type ActResult,
  type InboxAct,
  type InboxView,
  type ItemContext,
  type ItemSpec,
  type Next,
  type Step,
  type Triage,
} from './types';

export const WAITING_ON_HOLDER = 'you';

const decide = (view: InboxView, context: ItemContext): Next => ({ step: { kind: 'decide', view }, context });
const act = (name: InboxAct, context: ItemContext): Next => ({ step: { kind: 'act', act: name }, context });
const done = (close: string, context: ItemContext): Next => ({ step: { kind: 'done', close }, context });

export function openingStep(): Step {
  return { kind: 'decide', view: INBOX_VIEW.TRIAGE };
}

/** The choices a view offers. */
export function decisionOptions(view: InboxView) {
  if (view === INBOX_VIEW.DRAFT) return DRAFT_DECISIONS;
  if (view === INBOX_VIEW.WAITING) return WAITING_DECISIONS;
  if (view === INBOX_VIEW.TRIAGE) return TRIAGE_DECISIONS;
  return FOLLOW_UP_DECISIONS;
}

/** What the holder decided on a draft. */
function afterDraftDecision(triage: Triage, context: ItemContext): Next {
  if (triage.decision === TRIAGE_DECISION.POST) return act(INBOX_ACT.REPLY, { ...context, approvedReply: context.draft });
  if (triage.decision === TRIAGE_DECISION.REDRAFT) return act(INBOX_ACT.DRAFT, { ...context, redraftNotes: triage.guidance });
  return done(ITEM_CLOSE.DRAFT_DROPPED, context);
}

/** What the holder decided on a triage, findings, outcome or waiting row. */
export function afterTriage(view: InboxView, triage: Triage, context: ItemContext): Next {
  if (view === INBOX_VIEW.DRAFT) return afterDraftDecision(triage, context);
  const request = { decision: triage.decision, guidance: triage.guidance, replyMode: triage.replyMode, delegateTo: triage.delegateTo };
  const next: ItemContext = { ...context, request };

  switch (triage.decision) {
    case TRIAGE_DECISION.HANDLE:
      return done(ITEM_CLOSE.HANDLED, context);
    case TRIAGE_DECISION.DISMISS:
      return done(ITEM_CLOSE.DISMISSED, context);
    case TRIAGE_DECISION.ON_IT:
      return decide(INBOX_VIEW.WAITING, { ...next, waitingOn: WAITING_ON_HOLDER });
    case TRIAGE_DECISION.REPLY:
      if (triage.replyMode === 'ai-drafts') return act(INBOX_ACT.DRAFT, next);
      return act(INBOX_ACT.REPLY, triage.replyMode === 'verbatim' ? { ...next, approvedReply: triage.guidance } : next);
    case TRIAGE_DECISION.INVESTIGATE:
      return act(INBOX_ACT.INVESTIGATE, next);
    case TRIAGE_DECISION.FILE_TICKET:
      return act(INBOX_ACT.FILE_TICKET, next);
    case TRIAGE_DECISION.DELEGATE:
      return act(INBOX_ACT.DELEGATE, { ...next, waitingOn: triage.delegateTo });
    case TRIAGE_DECISION.APPLY:
      return act(INBOX_ACT.APPLY, next);
    default:
      return decide(view, context);
  }
}

/** What the AI's act result leads to. */
export function afterAct(name: InboxAct, result: ActResult, context: ItemContext): Next {
  if (result.outcome !== 'done') return actFailed(context, result.failureReason ?? `The ${name} act could not be done.`);
  switch (name) {
    case INBOX_ACT.REPLY:
      return context.waitingOn && context.waitingOn !== WAITING_ON_HOLDER
        ? decide(INBOX_VIEW.WAITING, { ...context, permalink: result.permalink })
        : done(ITEM_CLOSE.REPLIED, { ...context, permalink: result.permalink });
    case INBOX_ACT.DRAFT:
      return decide(INBOX_VIEW.DRAFT, { ...context, draft: result.draft });
    case INBOX_ACT.INVESTIGATE:
      return decide(INBOX_VIEW.FINDINGS, { ...context, findings: result.findings });
    case INBOX_ACT.FILE_TICKET:
      return done(ITEM_CLOSE.TICKETED, { ...context, issue: result.issue, permalink: result.permalink });
    case INBOX_ACT.DELEGATE:
      return decide(INBOX_VIEW.WAITING, { ...context, permalink: result.permalink, issue: result.issue });
    case INBOX_ACT.APPLY:
      return decide(INBOX_VIEW.OUTCOME, { ...context, applied: result.summary, permalink: result.permalink ?? context.permalink });
    default:
      return decide(INBOX_VIEW.OUTCOME, context);
  }
}

/** A failed, cancelled or expired act comes back to the holder as an outcome. */
export function actFailed(context: ItemContext, failure: string): Next {
  return decide(INBOX_VIEW.OUTCOME, { ...context, failure });
}

/** The classification the holder changed, if any. */
export function reclassified(item: ItemSpec, triage: Triage): { from: Record<string, string | undefined>; to: Record<string, string | undefined> } | undefined {
  const keys = ['category', 'need', 'raci'] as const;
  const changed = keys.filter((key) => triage[key] !== undefined && triage[key] !== item[key]);
  if (!changed.length) return undefined;
  return {
    from: Object.fromEntries(changed.map((key) => [key, item[key]])),
    to: Object.fromEntries(changed.map((key) => [key, triage[key]])),
  };
}
