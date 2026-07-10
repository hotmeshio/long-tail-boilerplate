/**
 * Rich-form role interface — the escalation FORM the `intake-reviewer` role owns.
 * The role owns a versioned `form_schema` (the JIT UI a human fills); its fields
 * carry `x-lt-bind` to map submitted values into the payload shape the workflow
 * consumes (`IntakeResolverV1`). The form is seeded on the role (seed) and the
 * workflow pins the version it is coded against.
 */

/** The role that owns the intake escalation form. */
export const INTAKE_ROLE = 'intake-reviewer';

/** The form version this workflow is coded against — bump with the schema + type. */
export const INTAKE_SCHEMA_VERSION = 1;

/**
 * The payload the workflow consumes — its own contract, produced by the form's
 * x-lt-bind map. Validate with zod on the conditionLT return if you want; nothing
 * on the role validates it.
 */
export interface IntakeResolverV1 {
  customer: { name: string; email: string; phone?: string };
  contract: {
    tier: 'free' | 'starter' | 'professional' | 'enterprise';
    startDate: string;
    budget?: number;
    approved: boolean;
  };
  notes?: string;
  attachment?: string;
}

/**
 * The versioned FORM: a flat, two-column customer-intake form. Exercises every
 * HITL form feature (date, email, textarea, file-upload, enum, required,
 * ordering) AND carries `x-lt-bind` on the fields that map into a nested payload
 * group (a property with no bind lands at its own name, 1:1).
 */
export const INTAKE_FORM_SCHEMA = {
  title: 'Customer Intake',
  description: 'Fill out all required fields for the new customer. Verify the contact email is correct and select the appropriate service tier.',
  'x-lt-layout': 'two-column',
  'x-lt-order': ['customer_name', 'contact_email', 'phone', 'tier', 'start_date', 'budget', 'approved', 'notes', 'attachment'],
  required: ['customer_name', 'contact_email', 'tier', 'start_date', 'approved'],
  properties: {
    customer_name: { type: 'string', default: '', description: 'Full legal business name', 'x-lt-bind': 'customer.name' },
    contact_email: { type: 'string', format: 'email', default: '', description: 'Primary contact email address', 'x-lt-bind': 'customer.email' },
    phone:         { type: 'string', default: '', description: 'Phone number with country code', 'x-lt-bind': 'customer.phone' },
    tier:          { type: 'string', enum: ['free', 'starter', 'professional', 'enterprise'], default: 'starter', description: 'Service tier determines SLA and feature set', 'x-lt-bind': 'contract.tier' },
    start_date:    { type: 'string', format: 'date', default: '', description: 'Effective start date of the contract', 'x-lt-bind': 'contract.startDate' },
    budget:        { type: 'number', default: 0, description: 'Annual budget in USD', 'x-lt-bind': 'contract.budget' },
    approved:      { type: 'boolean', default: false, description: 'I confirm all information is accurate', 'x-lt-bind': 'contract.approved' },
    notes:         { type: 'string', format: 'textarea', default: '', description: 'Additional context or special requirements', 'x-lt-span': 2 },
    attachment:    { type: 'string', default: '', 'x-lt-widget': 'file-upload', accept: '.pdf,.doc,.docx,.png,.jpg', description: 'Upload signed agreement or supporting documents', 'x-lt-span': 2 },
  },
};
