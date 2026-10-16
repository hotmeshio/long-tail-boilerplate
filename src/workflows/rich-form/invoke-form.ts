/**
 * The `richForm` invoke form. The invoke API validates `data` against it with
 * the same shared pass the form runs.
 */

import { INTAKE_TIERS, SECTION_CUSTOMER, SECTION_CONTRACT } from './forms';

/** The `richForm` invoke form: the prefill the reviewer will see, plus the edition pin. */
export const INTAKE_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': [
    '## Start an intake review',
    '',
    'Everything here prefills the reviewer\'s form for **{{input.customerName}}**. The reviewer can change any of it.',
    '',
    'Leave **Form edition** empty to render the role\'s latest form. Pin an edition to render that exact snapshot; a missing edition fails the run at creation.',
  ].join('\n'),
  'x-lt-order': ['customerName', 'contactEmail', 'phone', 'tier', 'startDate', 'budget', 'formVersion'],
  required: ['customerName', 'contactEmail', 'tier'],
  properties: {
    customerName: {
      type: 'string',
      title: 'Customer',
      description: 'Enter the legal business name',
      default: 'Acme Widgets LLC',
      minLength: 2,
      'x-lt-bind': 'customer.name',
      'x-lt-section': SECTION_CUSTOMER,
    },
    contactEmail: {
      type: 'string',
      format: 'email',
      title: 'Contact email',
      description: 'Enter the primary contact address',
      default: 'ops@acme.example',
      'x-lt-bind': 'customer.email',
      'x-lt-section': SECTION_CUSTOMER,
    },
    phone: {
      type: 'string',
      title: 'Phone',
      description: 'Optional; with country code',
      default: '+1 555 0100',
      'x-lt-bind': 'customer.phone',
      'x-lt-section': SECTION_CUSTOMER,
    },
    tier: {
      type: 'string',
      title: 'Tier',
      description: 'Pick the tier on the sales order',
      default: 'professional',
      'x-lt-options': [...INTAKE_TIERS],
      'x-lt-bind': 'contract.tier',
      'x-lt-section': SECTION_CONTRACT,
      'x-lt-column-group': 'terms',
    },
    startDate: {
      type: 'string',
      format: 'date',
      title: 'Start date',
      description: 'Optional; the effective date',
      'x-lt-bind': 'contract.startDate',
      'x-lt-section': SECTION_CONTRACT,
      'x-lt-column-group': 'terms',
    },
    budget: {
      type: 'number',
      title: 'Annual budget (USD)',
      description: 'Optional; up to 10 million',
      default: 50_000,
      minimum: 0,
      maximum: 10_000_000,
      'x-lt-bind': 'contract.budget',
      'x-lt-section': SECTION_CONTRACT,
    },
    formVersion: {
      type: 'integer',
      title: 'Form edition',
      description: 'Optional; pin a role form edition',
      minimum: 1,
      'x-lt-section': 'Advanced',
    },
  },
};
