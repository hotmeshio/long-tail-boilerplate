/**
 * Content review surfaces: the `content-moderator` escalation form and the
 * `reviewContent` invoke form.
 *
 * The escalation is raised by the certified-workflow interceptor (the
 * workflow returns `type: 'escalation'`), so the analysis rides the row's
 * `escalation_payload`; the help panel reads it through `{{payload.*}}`.
 */

export const MODERATOR_ROLE = 'content-moderator';

export const CONTENT_TYPES = [
  { value: 'article', label: 'Article' },
  { value: 'comment', label: 'Comment' },
  { value: 'listing', label: 'Listing' },
] as const;

export const MODERATION_DECISIONS = [
  { value: 'approve', label: 'Approve as written' },
  { value: 'edit', label: 'Approve with edits' },
  { value: 'remove', label: 'Remove' },
] as const;

/** What a moderator's resolution delivers on the workflow's re-run. */
export interface ModerationResolver {
  moderation: {
    decision: (typeof MODERATION_DECISIONS)[number]['value'];
    editedContent?: string;
    removalReason?: string;
    note?: string;
  };
}

export const MODERATOR_FORM_SCHEMA = {
  title: 'Moderate Content',
  description: 'Read the flagged content in the side panel, then decide.',
  'x-lt-layout': 'two-column',
  'x-lt-labels': { submit: 'Record decision' },
  'x-lt-help': [
    '### {{payload.contentId}}',
    '',
    '**Analysis:** {{payload.summary}} (confidence {{payload.confidence}})',
    '',
    '---',
    '',
    '{{payload.content}}',
    '',
    '---',
    '',
    '| Decision | When |',
    '|---|---|',
    '| Approve as written | The flag is a false positive |',
    '| Approve with edits | A small fix makes it publishable |',
    '| Remove | Spam, abuse, or off-topic |',
  ].join('\n'),
  'x-lt-order': ['decision', 'edited_content', 'removal_reason', 'note'],
  required: ['decision', 'edited_content', 'removal_reason'],
  properties: {
    decision: {
      type: 'string',
      title: 'Decision',
      description: 'Pick the outcome for this content',
      'x-lt-options': [...MODERATION_DECISIONS],
      'x-lt-bind': 'moderation.decision',
    },
    edited_content: {
      type: 'string',
      format: 'textarea',
      title: 'Edited content',
      description: 'Paste the corrected text that will publish',
      minLength: 10,
      maxLength: 10_000,
      'x-lt-span': 2,
      'x-lt-bind': 'moderation.editedContent',
      'x-lt-showIf': 'resolver.decision=edit',
    },
    removal_reason: {
      type: 'string',
      title: 'Removal reason',
      description: 'Pick the policy it breaks',
      'x-lt-options': [
        { value: 'spam', label: 'Spam' },
        { value: 'abuse', label: 'Abuse' },
        { value: 'off-topic', label: 'Off-topic' },
        { value: 'unsafe-markup', label: 'Unsafe markup' },
      ],
      'x-lt-bind': 'moderation.removalReason',
      'x-lt-showIf': 'resolver.decision=remove',
    },
    note: {
      type: 'string',
      format: 'textarea',
      title: 'Note',
      description: 'Optional; context for the author',
      maxLength: 500,
      'x-lt-span': 2,
      'x-lt-bind': 'moderation.note',
      'x-lt-showIf': 'resolver.decision',
    },
  },
};

export const MODERATOR_LIST_SCHEMA = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Content', value: '{{payload.contentId}}', priority: 1, width: '30%' },
    { label: 'Flags', value: '{{payload.flags}}', priority: 2 },
    { label: 'Confidence', value: '{{payload.confidence}}', priority: 2 },
    { label: 'Moderator', value: '{{escalation.assigned_to}}', format: 'user', priority: 3 },
    { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age', priority: 1 },
  ],
  'x-lt-row-action': { action: 'claim', label: 'Moderate', durationMinutes: 15 },
};

export const CONTENT_REVIEW_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': [
    '## Content review',
    '',
    'The analyzer scores the content. At or above the threshold it auto-approves; below it, a moderator decides.',
    '',
    'Short text, text over 10,000 characters, and HTML markup are flagged. Try `<b>hi</b>` to force a moderation.',
  ].join('\n'),
  'x-lt-order': ['contentId', 'contentType', 'threshold', 'content'],
  required: ['contentId', 'contentType', 'content'],
  properties: {
    contentId: {
      type: 'string',
      title: 'Content ID',
      description: 'Enter the id of the item under review',
      default: 'article-001',
      pattern: '^[a-z0-9-]{3,64}$',
      'x-lt-pattern-error': 'Use 3 to 64 lowercase letters, digits, and dashes',
    },
    contentType: {
      type: 'string',
      title: 'Type',
      description: 'Pick the kind of content',
      default: 'article',
      'x-lt-options': [...CONTENT_TYPES],
    },
    threshold: {
      type: 'number',
      title: 'Auto-approve threshold',
      description: 'Confidence needed to skip a moderator, 0 to 1',
      default: 0.7,
      minimum: 0,
      maximum: 1,
    },
    content: {
      type: 'string',
      format: 'textarea',
      title: 'Content',
      description: 'Paste the text to review',
      default: 'Content to review...',
      minLength: 1,
      maxLength: 20_000,
      'x-lt-span': 2,
    },
  },
};
