/**
 * Row builders, pure: the holder's decide row, the AI's act row, the sweep's
 * check row. Each returns the options `conditional` takes.
 */

import { FACET, present, sectionEnvelope } from '../facets';
import { RACI, ROW_TYPE, SECTION, agentRoleFor } from '../types';
import { ACT_NAMES, actInstructions, checkInstructions, decideBrief } from './brief';
import { decisionOptions } from './steps';
import {
  INBOX_ACT,
  INBOX_ACT_PRIORITY,
  INBOX_ACT_TIMEOUT,
  INBOX_CHECK_PRIORITY,
  INBOX_CHECK_TIMEOUT,
  INBOX_DECIDE_TIMEOUT,
  INBOX_STAGE,
  INBOX_VIEW,
  INBOX_WAITING_TIMEOUT,
  type InboxAct,
  type InboxStage,
  type InboxView,
  type ItemContext,
  type ItemSpec,
  type SweepInput,
} from './types';
import { INBOX_LOOKUPS, actLookups, checkLookups } from './vocabulary';

const WORKFLOW = { ITEM: 'inboxItem', SWEEP: 'inboxSweep' } as const;

const VIEW_PREFIX: Record<InboxView, string> = {
  triage: '',
  draft: 'Draft: ',
  findings: 'Findings: ',
  outcome: 'Outcome: ',
  waiting: 'Waiting: ',
};

function itemFacets(itemId: string, item: ItemSpec) {
  return present({
    [FACET.HOLDER]: item.holder,
    [FACET.ITEM]: itemId,
    [FACET.SOURCE]: item.source,
    [FACET.KIND]: item.kind,
    [FACET.CATEGORY]: item.category,
    [FACET.NEED]: item.need,
    [FACET.CHANNEL]: item.channelId,
    [FACET.SENT_AT]: item.sentAt,
  });
}

/** Where the item stands for the holder, from the view it shows and how it was filed. */
export function stageOf(view: InboxView, item: ItemSpec): InboxStage {
  if (view === INBOX_VIEW.WAITING) return INBOX_STAGE.WAITING;
  if (view !== INBOX_VIEW.TRIAGE) return INBOX_STAGE.RETURNED;
  return item.raci === 'informed' || item.need === 'read' ? INBOX_STAGE.FYI : INBOX_STAGE.NEW;
}

/** The holder's row: the card, what came back, and the decision the rules suggest. */
export function decideRow(itemId: string, view: InboxView, item: ItemSpec, context: ItemContext) {
  const prefill = view === INBOX_VIEW.TRIAGE ? item.suggestion : undefined;
  return {
    type: ROW_TYPE,
    subtype: view,
    role: item.holder,
    workflowType: WORKFLOW.ITEM,
    priority: item.priority,
    description: `${VIEW_PREFIX[view]}${item.headline}`.slice(0, 60),
    timeout: view === INBOX_VIEW.WAITING ? INBOX_WAITING_TIMEOUT : INBOX_DECIDE_TIMEOUT,
    metadata: present({
      ...itemFacets(itemId, item),
      [FACET.SEAT]: item.holder,
      [FACET.SECTION]: SECTION.TRIAGE,
      [FACET.VIEW]: view,
      [FACET.STAGE]: stageOf(view, item),
      [FACET.RACI]: item.raci ?? RACI.ACCOUNTABLE,
      [FACET.WAITING_ON]: view === INBOX_VIEW.WAITING ? context.waitingOn : undefined,
    }),
    envelope: {
      ...sectionEnvelope(SECTION.TRIAGE, decideBrief(view, item, context), { view, decision_options: [...decisionOptions(view)], permalink: item.permalink }),
      formDefaults: {
        brief: decideBrief(view, item, context),
        triage: present({
          decision: prefill?.decision,
          guidance: prefill?.guidance,
          replyMode: prefill?.replyMode,
          category: item.category,
          need: item.need,
          raci: item.raci,
        }),
      },
    },
    lookups: INBOX_LOOKUPS,
  };
}

/** The agent's row in the holder's agent queue: the instructions for one act. */
export function actRow(itemId: string, name: Exclude<InboxAct, 'check'>, item: ItemSpec, context: ItemContext) {
  const role = agentRoleFor(item.holder);
  return {
    type: ROW_TYPE,
    subtype: name,
    role,
    workflowType: WORKFLOW.ITEM,
    priority: INBOX_ACT_PRIORITY,
    description: `${ACT_NAMES[name]}: ${item.headline}`.slice(0, 60),
    timeout: INBOX_ACT_TIMEOUT,
    metadata: present({ ...itemFacets(itemId, item), [FACET.SEAT]: role, [FACET.SECTION]: SECTION.ACT, [FACET.ACT]: name, [FACET.RACI]: RACI.RESPONSIBLE }),
    envelope: sectionEnvelope(SECTION.ACT, actInstructions(name, item, context), { act: name, permalink: item.permalink }),
    lookups: actLookups(item.holder),
  };
}

/** The sweep's row: one check of one source for one holder. */
export function checkRow(input: SweepInput, watermark: string | undefined) {
  const role = agentRoleFor(input.holder);
  return {
    type: ROW_TYPE,
    subtype: INBOX_ACT.CHECK,
    role,
    workflowType: WORKFLOW.SWEEP,
    priority: INBOX_CHECK_PRIORITY,
    description: `Check ${input.source} for ${input.holder}`.slice(0, 60),
    timeout: INBOX_CHECK_TIMEOUT,
    metadata: present({ [FACET.HOLDER]: input.holder, [FACET.SOURCE]: input.source, [FACET.SEAT]: role, [FACET.SECTION]: SECTION.ACT, [FACET.ACT]: INBOX_ACT.CHECK, [FACET.RACI]: RACI.RESPONSIBLE }),
    envelope: sectionEnvelope(SECTION.ACT, checkInstructions(input.holder, input.source, watermark, input.maxItems), {
      act: INBOX_ACT.CHECK,
      source: input.source,
      holder: input.holder,
      watermark,
    }),
    lookups: checkLookups(input.holder),
  };
}
