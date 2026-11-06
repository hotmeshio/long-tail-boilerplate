/**
 * Markdown for inbox rows: the holder's card (what arrived, what the AI
 * brought back) and the AI's instructions (exactly what to do and what to
 * resolve with). Every free text is escaped so a message cannot inject markup.
 */

import { INBOX_ACT, INBOX_CHECK_MAX_ITEMS, INBOX_VIEW, type InboxAct, type InboxSource, type InboxView, type ItemContext, type ItemSpec } from './types';
const RULES = 'Rules: the `guide` lookup on this row (`get_escalation_lookups`).';

/** Escapes HTML and drops links that are not http(s). */
export function safeMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\]\((?!https?:\/\/)[^)]*\)/g, ']()');
}

function headerLine(item: ItemSpec): string {
  const parts = [item.fromName, item.channelName ? `#${item.channelName}` : undefined, item.sentAt].filter(Boolean);
  return parts.length ? `#### ${safeMarkdown(parts.join(' · '))}` : `#### ${item.source}`;
}

function classificationLine(item: ItemSpec): string {
  const bits = [`\`${item.kind}\``, item.category, item.need ? `needs: ${item.need}` : undefined, item.raci ? `you: ${item.raci}` : undefined, `P${item.priority}`, item.team]
    .filter(Boolean)
    .map((bit) => safeMarkdown(String(bit)));
  return bits.join(' · ');
}

/** The card the holder reads: who, where, when, what, and how it was filed. */
export function itemCard(item: ItemSpec): string {
  return [
    headerLine(item),
    '',
    safeMarkdown(item.summary),
    '',
    classificationLine(item),
    ...(item.permalink?.startsWith('http') ? [`[Open the source](${item.permalink})`] : []),
  ].join('\n');
}

/** What the AI brought back, for the view the row shows. */
export function viewUpdate(view: InboxView, context: ItemContext): string {
  const asked = context.request?.guidance ? ['', `**You asked:** ${safeMarkdown(context.request.guidance)}`] : [];
  switch (view) {
    case INBOX_VIEW.FINDINGS:
      return ['### Findings', '', safeMarkdown(context.findings ?? ''), ...asked].join('\n');
    case INBOX_VIEW.DRAFT:
      return ['### Draft', '', ...safeMarkdown(context.draft ?? '').split('\n').map((line) => `> ${line}`), ...asked].join('\n');
    case INBOX_VIEW.OUTCOME:
      return [
        '### Outcome',
        '',
        safeMarkdown(context.failure ?? context.applied ?? 'Done.'),
        ...(context.issue ? [`Issue: ${safeMarkdown(context.issue)}`] : []),
        ...(context.permalink ? ['', `[Where it went](${context.permalink})`] : []),
      ].join('\n');
    case INBOX_VIEW.WAITING:
      return [`### Waiting on ${safeMarkdown(context.waitingOn ?? 'you')}`, ...(context.permalink ? ['', `[Where it went](${context.permalink})`] : [])].join('\n');
    default:
      return '';
  }
}

/** The whole brief of a decide row: the card, then what came back. */
export function decideBrief(view: InboxView, item: ItemSpec, context: ItemContext): string {
  const update = viewUpdate(view, context);
  return update ? [itemCard(item), '', '---', '', update].join('\n') : itemCard(item);
}

function threadLines(item: ItemSpec): string[] {
  return [
    `**Item:** ${safeMarkdown(item.headline)}`,
    ...(item.channelName || item.channelId ? [`**Channel:** ${safeMarkdown(item.channelName ?? '')} ${item.channelId ? `(${safeMarkdown(item.channelId)})` : ''}`] : []),
    ...(item.threadTs || item.messageTs ? [`**Thread:** ${safeMarkdown(item.threadTs ?? item.messageTs ?? '')}`] : []),
    ...(item.permalink ? [`**Link:** ${safeMarkdown(item.permalink)}`] : []),
    '',
    safeMarkdown(item.summary),
  ];
}

const ACT_LINES: Record<Exclude<InboxAct, 'check'>, (item: ItemSpec, context: ItemContext) => string[]> = {
  apply: (_item, context) => [
    'The holder approved the findings below. Carry them out exactly as proposed; change nothing else. Stop and resolve with outcome = failed if anything differs from what the findings assumed.',
    '',
    '### Findings you are carrying out',
    '',
    safeMarkdown(context.findings ?? ''),
    ...(context.request?.guidance ? ['', `Note from the holder: ${safeMarkdown(context.request.guidance)}`] : []),
    '',
    'Resolve with act.outcome = done, act.summary (what changed) and act.permalink (where).',
  ],
  reply: (_item, context) => [
    context.approvedReply
      ? `Post these exact words in the thread; change nothing:\n\n> ${safeMarkdown(context.approvedReply).replace(/\n/g, '\n> ')}`
      : `Write a short reply in the holder's voice from this gist and post it in the thread:\n\n${safeMarkdown(context.request?.guidance ?? '')}`,
    '',
    'Resolve with act.outcome = done and act.permalink.',
  ],
  draft: (_item, context) => [
    "Draft a reply in the holder's voice. Post nothing.",
    '',
    `Gist: ${safeMarkdown(context.request?.guidance ?? '')}`,
    ...(context.redraftNotes ? ['', `Change: ${safeMarkdown(context.redraftNotes)}`, '', 'Your last draft:', '', `> ${safeMarkdown(context.draft ?? '').replace(/\n/g, '\n> ')}`] : []),
    '',
    'Resolve with act.outcome = done and act.draft.',
  ],
  investigate: (_item, context) => [
    'Investigate, read only. Resolve with act.findings: what you found, the evidence, what you recommend.',
    ...(context.request?.guidance ? ['', `Focus: ${safeMarkdown(context.request.guidance)}`] : []),
  ],
  'file-ticket': (item, context) => [
    `Create the issue: title "${safeMarkdown(item.headline)}", body from the summary${context.request?.guidance ? ` and this note: ${safeMarkdown(context.request.guidance)}` : ''}.`,
    '',
    'Resolve with act.outcome = done, act.issue (the identifier) and act.permalink (its link).',
  ],
  delegate: (_item, context) => [
    `Hand this to ${safeMarkdown(context.request?.delegateTo ?? 'the role named')}: write a short hand-off in the holder's voice from this note and send it where the role works.`,
    '',
    safeMarkdown(context.request?.guidance ?? ''),
    '',
    'Resolve with act.outcome = done, act.summary (where it went) and act.permalink or act.issue when there is one.',
  ],
};

/** The AI's instructions for one act on one item. */
export function actInstructions(name: Exclude<InboxAct, 'check'>, item: ItemSpec, context: ItemContext): string {
  return [...ACT_LINES[name](item, context), '', '---', '', ...threadLines(item), '', RULES].join('\n');
}

/** The AI's instructions for a check. */
function sinceText(watermark: string | undefined): string {
  if (!watermark) return 'the last day';
  const seconds = Number(watermark);
  const when = Number.isFinite(seconds) && seconds > 0 ? ` (${new Date(seconds * 1000).toISOString()})` : '';
  return `\`${safeMarkdown(watermark)}\`${when}`;
}

export function checkInstructions(holder: string, source: InboxSource, watermark: string | undefined, max = INBOX_CHECK_MAX_ITEMS): string {
  return [
    `Check **${source}** for everything that named the holder of \`${holder}\` since ${sinceText(watermark)}, oldest first.`,
    '',
    'Classify each with the lookups on this row (kinds, categories, needs, raci) and follow its `corrections` lookup.',
    '',
    `Resolve with act.outcome = done, act.checkedThrough (the newest timestamp you read) and act.items (at most ${max}). An empty check resolves with no items.`,
    '',
    RULES,
  ].join('\n');
}

export const ACT_NAMES: Record<InboxAct, string> = {
  [INBOX_ACT.CHECK]: 'Check',
  [INBOX_ACT.REPLY]: 'Reply',
  [INBOX_ACT.DRAFT]: 'Draft',
  [INBOX_ACT.INVESTIGATE]: 'Investigate',
  [INBOX_ACT.FILE_TICKET]: 'File',
  [INBOX_ACT.DELEGATE]: 'Delegate',
  [INBOX_ACT.APPLY]: 'Apply',
};
