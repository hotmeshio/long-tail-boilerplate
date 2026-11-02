/**
 * The inbox's two sections of the shared seat form: `triage` (the holder's
 * decision on an item, with its classification editable in place) and `act`
 * (the AI's result, whose fields follow the act named on the row). Merged
 * into SEAT_FORM_SCHEMA; every seat carries them, only inbox rows show them.
 */

import { NOTES_MAX_LENGTH, SECTION } from '../types';
import { ACT_OUTCOMES, INBOX_ACT, INBOX_CHECK_MAX_ITEMS, REPLY_MODES } from '../inbox/types';

const TRIAGE = `envelope.section=${SECTION.TRIAGE}`;
const ACT = `envelope.section=${SECTION.ACT}`;
const TRIAGE_TITLE = 'Decide';
const ACT_TITLE = 'Report';

const actFor = (name: string) => `envelope.act=${name}`;
const DONE = 'resolver.act_outcome=done';

function textarea(title: string, description: string, bind: string, section: string, showIf: string | string[]) {
  return { type: 'string', format: 'textarea', title, description, maxLength: NOTES_MAX_LENGTH, 'x-lt-span': 2, 'x-lt-bind': bind, 'x-lt-section': section, 'x-lt-showIf': showIf };
}

function lookupSelect(title: string, description: string, bind: string, lookup: string) {
  return { type: 'string', title, description, 'x-lt-options': `lookup.${lookup}.items`, 'x-lt-bind': bind, 'x-lt-section': 'Filed as', 'x-lt-showIf': TRIAGE };
}

export const INBOX_FIELDS = {
  triage_decision: {
    type: 'string',
    title: 'Decision',
    description: 'What happens next; the suggestion is pre-selected',
    'x-lt-options': 'envelope.decision_options',
    'x-lt-bind': 'triage.decision',
    'x-lt-section': TRIAGE_TITLE,
    'x-lt-showIf': TRIAGE,
  },
  triage_guidance: textarea('Your words', 'The reply, the gist, what to look into, or what to change', 'triage.guidance', TRIAGE_TITLE, TRIAGE),
  triage_reply_mode: {
    type: 'string',
    title: 'Reply mode',
    description: 'Whose words, and who posts',
    'x-lt-options': [...REPLY_MODES],
    'x-lt-bind': 'triage.replyMode',
    'x-lt-section': TRIAGE_TITLE,
    'x-lt-showIf': [TRIAGE, 'resolver.triage_decision=reply'],
  },
  triage_delegate_to: {
    type: 'string',
    title: 'Delegate to',
    description: 'The role that takes it',
    'x-lt-options': 'lookup.roles.items',
    'x-lt-bind': 'triage.delegateTo',
    'x-lt-section': TRIAGE_TITLE,
    'x-lt-showIf': [TRIAGE, 'resolver.triage_decision=delegate'],
  },
  triage_category: lookupSelect('Category', 'What it is about; change it and the AI learns', 'triage.category', 'categories'),
  triage_need: lookupSelect('Needs', 'What it needs from you', 'triage.need', 'needs'),
  triage_raci: lookupSelect('Your role', 'Responsible, accountable, consulted or informed', 'triage.raci', 'raci'),

  act_outcome: {
    type: 'string',
    title: 'Result',
    description: 'Done, or why not',
    'x-lt-options': [...ACT_OUTCOMES],
    'x-lt-bind': 'act.outcome',
    'x-lt-section': ACT_TITLE,
    'x-lt-showIf': ACT,
  },
  act_failure_reason: textarea('Why not', 'What stopped you', 'act.failureReason', ACT_TITLE, [ACT, 'resolver.act_outcome=failed']),
  act_summary: textarea('Summary', 'What you did, in a line or two', 'act.summary', ACT_TITLE, ACT),
  act_applied_link: {
    type: 'string',
    title: 'Link',
    description: 'Optional; where the change is',
    maxLength: 2000,
    'x-lt-bind': 'act.permalink',
    'x-lt-section': ACT_TITLE,
    'x-lt-showIf': [ACT, DONE, actFor(INBOX_ACT.APPLY)],
  },
  act_permalink: {
    type: 'string',
    title: 'Link',
    description: 'Where it went',
    maxLength: 2000,
    'x-lt-bind': 'act.permalink',
    'x-lt-section': ACT_TITLE,
    'x-lt-showIf': [ACT, DONE, `envelope.act!=${INBOX_ACT.CHECK}`, `envelope.act!=${INBOX_ACT.DRAFT}`, `envelope.act!=${INBOX_ACT.INVESTIGATE}`, `envelope.act!=${INBOX_ACT.APPLY}`],
  },
  act_draft: textarea('Draft', "The reply, in the holder's voice", 'act.draft', ACT_TITLE, [ACT, DONE, actFor(INBOX_ACT.DRAFT)]),
  act_findings: textarea('Findings', 'What you found, the evidence, what you recommend', 'act.findings', ACT_TITLE, [ACT, DONE, actFor(INBOX_ACT.INVESTIGATE)]),
  act_issue: {
    type: 'string',
    title: 'Issue',
    description: 'The identifier',
    maxLength: 200,
    'x-lt-bind': 'act.issue',
    'x-lt-section': ACT_TITLE,
    'x-lt-showIf': [ACT, DONE, actFor(INBOX_ACT.FILE_TICKET)],
  },
  act_checked_through: {
    type: 'string',
    title: 'Checked through',
    description: 'The newest timestamp you read',
    maxLength: 64,
    'x-lt-bind': 'act.checkedThrough',
    'x-lt-section': ACT_TITLE,
    'x-lt-showIf': [ACT, DONE, actFor(INBOX_ACT.CHECK)],
  },
  act_items: {
    type: 'array',
    title: 'Items',
    description: 'What you found, oldest first',
    'x-lt-widget': 'json',
    maxItems: INBOX_CHECK_MAX_ITEMS,
    items: {
      type: 'object',
      required: ['kind', 'headline', 'summary'],
      properties: {
        source: { type: 'string' },
        kind: { type: 'string' },
        category: { type: 'string' },
        need: { type: 'string' },
        raci: { type: 'string' },
        priority: { type: 'integer', minimum: 1, maximum: 4 },
        headline: { type: 'string', maxLength: 120 },
        summary: { type: 'string', maxLength: 4000 },
        channelId: { type: 'string' },
        channelName: { type: 'string' },
        messageTs: { type: 'string' },
        threadTs: { type: 'string' },
        permalink: { type: 'string' },
        fromName: { type: 'string' },
        team: { type: 'string' },
        sentAt: { type: 'string' },
      },
    },
    'x-lt-span': 2,
    'x-lt-bind': 'act.items',
    'x-lt-section': ACT_TITLE,
    'x-lt-showIf': [ACT, DONE, actFor(INBOX_ACT.CHECK)],
  },
};

export const INBOX_ORDER = Object.keys(INBOX_FIELDS);

export const INBOX_REQUIRED = [
  'triage_decision',
  'triage_reply_mode',
  'triage_delegate_to',
  'act_outcome',
  'act_failure_reason',
  'act_permalink',
  'act_draft',
  'act_findings',
  'act_issue',
  'act_checked_through',
];
