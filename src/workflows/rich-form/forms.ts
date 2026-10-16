/**
 * Rich-form surfaces: the `intake-reviewer` role's escalation form and list
 * page. The `richForm` invoke form lives in invoke-form.ts.
 *
 * The role owns the escalation form (versioned in lt_role_schemas) and the
 * list page (versioned independently). Both are declared in code and applied
 * on every boot (see src/config/hitl-roles.ts), so local and AWS converge.
 * The payload shape is the workflow's own contract (`IntakeResolverSchema`),
 * produced by the form's `x-lt-bind` map.
 */

import { z } from 'zod';

import { blankAsAbsent } from '../../lib/form-values';

/** The role that owns the intake escalation form and list page. */
export const INTAKE_ROLE = 'intake-reviewer';

export const INTAKE_TIERS = [
  { value: 'free', label: 'Free' },
  { value: 'starter', label: 'Starter' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise', label: 'Enterprise' },
] as const;
type IntakeTier = (typeof INTAKE_TIERS)[number]['value'];
const TIER_VALUES = INTAKE_TIERS.map((t) => t.value) as [IntakeTier, ...IntakeTier[]];

export const INTAKE_DECISIONS = [
  { value: 'approve', label: 'Approve' },
  { value: 'needs-info', label: 'Request more information' },
  { value: 'reject', label: 'Reject' },
] as const;
type IntakeDecision = (typeof INTAKE_DECISIONS)[number]['value'];
const DECISION_VALUES = INTAKE_DECISIONS.map((d) => d.value) as [IntakeDecision, ...IntakeDecision[]];

/**
 * The payload `conditional` returns, declared once: the type derives from it
 * and the activity parses resolutions through it.
 */
export const IntakeResolverSchema = z.object({
  customer: z.object({
    name: z.string(),
    email: z.string(),
    phone: blankAsAbsent(z.string()),
  }),
  contract: z.object({
    tier: z.enum(TIER_VALUES),
    startDate: z.string(),
    budget: blankAsAbsent(z.number()),
  }),
  review: z.object({
    decision: z.enum(DECISION_VALUES),
    missing: blankAsAbsent(z.array(z.string())),
    reason: blankAsAbsent(z.string()),
    note: blankAsAbsent(z.string()),
  }),
  attachment: blankAsAbsent(z.string()),
});
export type IntakeResolver = z.infer<typeof IntakeResolverSchema>;

/** What the invoke form submits (x-lt-bind shape) and the workflow reads. */
export interface IntakeInput {
  customer?: { name?: string; email?: string; phone?: string };
  contract?: { tier?: IntakeTier; startDate?: string; budget?: number };
  /** Pin the role form edition this escalation renders; omit for the latest. */
  formVersion?: number | null;
}

export const SECTION_CUSTOMER = 'Customer';
export const SECTION_CONTRACT = 'Contract';
const SECTION_DECISION = 'Decision';

const showForDecision = (decision: IntakeDecision) => `resolver.decision=${decision}`;

/**
 * The escalation form. Doctrine: facts first, one decision gates the rest,
 * each outcome reveals only its own fields, sign-off last.
 */
export const INTAKE_FORM_SCHEMA = {
  title: 'Customer Intake',
  description: 'Confirm the customer record, then decide.',
  'x-lt-layout': 'two-column',
  'x-lt-labels': { submit: 'Record decision' },
  'x-lt-help': [
    '### Review checklist',
    '',
    '1. Confirm the **legal business name** matches the signed agreement.',
    '2. Send a test message to **{{envelope.formDefaults.customer.email}}** before approving.',
    '3. Pick the tier from the sales order:',
    '',
    '| Tier | When |',
    '|------|------|',
    '| Starter | Single team, standard SLA |',
    '| Professional | Multi-team, priority SLA |',
    '| Enterprise | Custom contract terms |',
    '',
    '> Request more information when the agreement or budget is missing. Reject only duplicates and fraud.',
    '',
    'This escalation is **{{escalation.status}}** in the **{{escalation.role}}** queue. Pinned form edition: **{{metadata.schema_version}}** (a dash means it renders the latest).',
    '',
    '[Back to the intake queue](/escalations/available?role=intake-reviewer)',
  ].join('\n'),
  'x-lt-order': [
    'customer_name', 'contact_email', 'phone',
    'tier', 'start_date', 'budget',
    'decision', 'missing', 'reject_reason', 'approve_note', 'attachment',
  ],
  required: ['customer_name', 'contact_email', 'tier', 'start_date', 'decision', 'missing', 'reject_reason'],
  properties: {
    customer_name: {
      type: 'string',
      title: 'Legal name',
      description: 'Enter the name exactly as it reads on the agreement',
      minLength: 2,
      'x-lt-bind': 'customer.name',
      'x-lt-section': SECTION_CUSTOMER,
    },
    contact_email: {
      type: 'string',
      format: 'email',
      title: 'Contact email',
      description: 'Enter the primary contact address',
      'x-lt-bind': 'customer.email',
      'x-lt-section': SECTION_CUSTOMER,
    },
    phone: {
      type: 'string',
      title: 'Phone',
      description: 'Enter the number with its country code',
      pattern: '^\\+?[0-9 ()-]{7,20}$',
      'x-lt-pattern-error': 'Enter digits, spaces, and dashes, starting with + and the country code',
      'x-lt-bind': 'customer.phone',
      'x-lt-section': SECTION_CUSTOMER,
    },
    tier: {
      type: 'string',
      title: 'Tier',
      description: 'Pick the tier on the sales order',
      'x-lt-options': [...INTAKE_TIERS],
      'x-lt-bind': 'contract.tier',
      'x-lt-section': SECTION_CONTRACT,
      'x-lt-column-group': 'terms',
    },
    start_date: {
      type: 'string',
      format: 'date',
      title: 'Start date',
      description: 'Pick the effective date',
      'x-lt-bind': 'contract.startDate',
      'x-lt-section': SECTION_CONTRACT,
      'x-lt-column-group': 'terms',
    },
    budget: {
      type: 'number',
      title: 'Annual budget (USD)',
      description: 'Enter a whole-dollar amount up to 10 million',
      minimum: 0,
      maximum: 10_000_000,
      'x-lt-bind': 'contract.budget',
      'x-lt-section': SECTION_CONTRACT,
    },
    decision: {
      type: 'string',
      title: 'Decision',
      description: 'Pick the outcome; the form shows what that outcome needs',
      'x-lt-options': [...INTAKE_DECISIONS],
      'x-lt-bind': 'review.decision',
      'x-lt-section': SECTION_DECISION,
    },
    missing: {
      type: 'array',
      title: 'Missing items',
      description: 'Pick everything the customer must send',
      items: { type: 'string' },
      'x-lt-options': [
        { value: 'agreement', label: 'Signed agreement' },
        { value: 'budget', label: 'Budget approval' },
        { value: 'tax-form', label: 'Tax form' },
        { value: 'contact', label: 'Working contact' },
      ],
      minItems: 1,
      'x-lt-bind': 'review.missing',
      'x-lt-section': SECTION_DECISION,
      'x-lt-showIf': showForDecision('needs-info'),
    },
    reject_reason: {
      type: 'string',
      format: 'textarea',
      title: 'Reason',
      description: 'Say why this intake is rejected, in one or two sentences',
      minLength: 10,
      maxLength: 500,
      'x-lt-span': 2,
      'x-lt-bind': 'review.reason',
      'x-lt-section': SECTION_DECISION,
      'x-lt-showIf': showForDecision('reject'),
    },
    approve_note: {
      type: 'string',
      format: 'textarea',
      title: 'Hand-off note',
      description: 'Optional; anything onboarding should know',
      maxLength: 500,
      'x-lt-span': 2,
      'x-lt-bind': 'review.note',
      'x-lt-section': SECTION_DECISION,
      'x-lt-showIf': showForDecision('approve'),
    },
    attachment: {
      type: 'string',
      title: 'Supporting document',
      description: 'Optional; upload the signed agreement',
      'x-lt-widget': 'file-upload',
      accept: '.pdf,.png,.jpg',
      'x-lt-span': 2,
      'x-lt-section': SECTION_DECISION,
      'x-lt-showIf': 'resolver.decision',
    },
  },
};

/** The intake queue as a scannable table that folds to cards on narrow screens. */
export const INTAKE_LIST_SCHEMA = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Customer', value: '{{metadata.customer}}', priority: 1, width: '28%' },
    { label: 'Tier', value: '{{metadata.tier}}', priority: 2 },
    { label: 'Budget', value: '{{envelope.formDefaults.contract.budget}}', priority: 2 },
    { label: 'Starts', value: '{{envelope.formDefaults.contract.startDate}}', priority: 3 },
    { label: 'Reviewer', value: '{{escalation.assigned_to}}', format: 'user', priority: 2 },
    { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age', priority: 1 },
  ],
  'x-lt-row-action': { action: 'claim', label: 'Review', durationMinutes: 30 },
};
