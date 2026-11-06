/**
 * The inbox's sections of the shared seat form: `triage` (the holder's
 * decision on an item, with its classification editable in place), `act`
 * (the AI's result, whose fields follow the act named on the row) and
 * `preferences` (what the holder's own reactions mean). Merged into
 * SEAT_FORM_SCHEMA; every seat carries them, only inbox rows show them.
 */

import { NOTES_MAX_LENGTH, SECTION } from '../types';
import { ACT_OUTCOMES, INBOX_ACT, INBOX_CHECK_MAX_ITEMS, REPLY_MODES } from '../inbox/types';
import { RACI_VALUES, READ_CLOSES, REPLY_MEANS } from '../inbox/reactions';

const TRIAGE = `envelope.section=${SECTION.TRIAGE}`;
const ACT = `envelope.section=${SECTION.ACT}`;
const PREFERENCES = `envelope.section=${SECTION.PREFERENCES}`;
const TRIAGE_TITLE = 'Decide';
const FILED_TITLE = 'Filed as';

/** Read-only preamble for the classification fields below the decision. */
export const FILED_AS_GUIDE = [
  '**Above is your intent:** what happens to this message now. **Below is how it is filed:** what the AI took it to be.',
  '',
  'Filing changes nothing about this item. It is how the AI learns: fix a wrong category, need or role and submit, and the next message like this one is filed your way and opens on a better suggestion.',
  '',
  '| Your role | Means |',
  '|---|---|',
  '| **Responsible** | You do the work. |',
  '| **Accountable** | You own the outcome: you decide, approve or sign off. One per item. |',
  '| **Consulted** | Your input is asked for before it is done. |',
  '| **Informed** | You are told after; nothing to do. Files as FYI. |',
].join('\n');
const ACT_TITLE = 'Report';
const PREFERENCES_TITLE = 'Your reactions';
const REACTIONS_MAX_LENGTH = 300;

/** One paste box: the emoji that carry one meaning. */
function reactionBox(title: string, description: string, bind: string) {
  return { type: 'string', title, description, maxLength: REACTIONS_MAX_LENGTH, 'x-lt-bind': bind, 'x-lt-section': PREFERENCES_TITLE, 'x-lt-showIf': PREFERENCES };
}

const actFor = (name: string) => `envelope.act=${name}`;
const DONE = 'resolver.act_outcome=done';

function textarea(title: string, description: string, bind: string, section: string, showIf: string | string[]) {
  return { type: 'string', format: 'textarea', title, description, maxLength: NOTES_MAX_LENGTH, 'x-lt-span': 2, 'x-lt-bind': bind, 'x-lt-section': section, 'x-lt-showIf': showIf };
}

function lookupSelect(title: string, description: string, bind: string, lookup: string) {
  return { type: 'string', title, description, 'x-lt-options': `lookup.${lookup}.items`, 'x-lt-bind': bind, 'x-lt-section': FILED_TITLE, 'x-lt-showIf': TRIAGE };
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
  triage_filed_guide: {
    type: 'string',
    title: 'How this is filed',
    readOnly: true,
    default: FILED_AS_GUIDE,
    'x-lt-widget': 'markdown',
    'x-lt-span': 2,
    'x-lt-section': FILED_TITLE,
    'x-lt-showIf': TRIAGE,
  },
  triage_category: lookupSelect('Category', 'What it is about; change it and the AI learns', 'triage.category', 'categories'),
  triage_need: lookupSelect('Needs', 'What it needs from you; change it and the AI learns', 'triage.need', 'needs'),
  triage_raci: lookupSelect('Your role', 'Your part in it, per the table above; change it and the AI learns', 'triage.raci', 'raci'),

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

  prefs_done: reactionBox('Done', 'Paste the emoji that mean "I took care of it", from Slack or anywhere: ✅ or :white_check_mark:', 'preferences.done'),
  prefs_approved: reactionBox('Approved', 'I approved what was asked: a PR, a plan, a request', 'preferences.approved'),
  prefs_on_it: reactionBox('On it', "I'm looking at it; keep it open and wait on me", 'preferences.onIt'),
  prefs_read: reactionBox('Read', 'I read it', 'preferences.read'),
  prefs_dismissed: reactionBox('Not mine', 'Dismiss it; nothing for me here', 'preferences.dismissed'),
  prefs_ticket: reactionBox('Ticket', 'File the ticket', 'preferences.ticket'),
  prefs_read_closes: {
    type: 'string',
    title: 'A Read emoji closes',
    description: 'What a Read emoji is enough to close',
    'x-lt-options': [...READ_CLOSES],
    'x-lt-bind': 'preferences.readCloses',
    'x-lt-section': PREFERENCES_TITLE,
    'x-lt-showIf': PREFERENCES,
  },
  prefs_reply_means: {
    type: 'string',
    title: 'My reply in the thread means',
    description: 'When you answer in the thread and add no emoji',
    'x-lt-options': [...REPLY_MEANS],
    'x-lt-bind': 'preferences.replyMeans',
    'x-lt-section': PREFERENCES_TITLE,
    'x-lt-showIf': PREFERENCES,
  },
  prefs_close_for: {
    type: 'array',
    title: 'Close only when my role is',
    description: 'A reaction closes an item only when your role on it is one of these',
    items: { type: 'string' },
    'x-lt-options': RACI_VALUES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
    'x-lt-span': 2,
    'x-lt-bind': 'preferences.closeFor',
    'x-lt-section': PREFERENCES_TITLE,
    'x-lt-showIf': PREFERENCES,
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
  'prefs_read_closes',
  'prefs_reply_means',
];
