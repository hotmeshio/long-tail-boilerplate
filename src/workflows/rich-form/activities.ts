/**
 * Rich Form Activities — post-resolution processing.
 */

import { EscalationService } from '@hotmeshio/long-tail';

export async function createRichFormEscalation(input: {
  role: string;
  workflowId: string;
  workflowType: string;
  taskQueue: string;
  signalId: string;
}): Promise<string> {
  const escalation = await EscalationService.createEscalation({
    type: 'intake',
    subtype: 'rich-form',
    description: 'Complete the customer intake form. Review all fields carefully before submitting.',
    priority: 2,
    role: input.role,
    envelope: JSON.stringify({}),
    workflow_id: input.workflowId,
    task_queue: input.taskQueue,
    workflow_type: input.workflowType,
  });

  await EscalationService.enrichEscalationRouting(
    escalation.id,
    {
      signal_routing: {
        engine: 'durable',
        taskQueue: input.taskQueue,
        workflowType: input.workflowType,
        workflowId: input.workflowId,
        signalId: input.signalId,
      },
      form_schema: {
        title: 'Customer Intake',
        description: 'Fill out all required fields for the new customer. Verify the contact email is correct and select the appropriate service tier.',
        'x-lt-layout': 'two-column',
        'x-lt-order': ['customer_name', 'contact_email', 'phone', 'tier', 'start_date', 'budget', 'approved', 'notes', 'attachment'],
        required: ['customer_name', 'contact_email', 'tier', 'start_date', 'approved'],
        properties: {
          customer_name: {
            type: 'string',
            default: '',
            description: 'Full legal business name',
          },
          contact_email: {
            type: 'string',
            format: 'email',
            default: '',
            description: 'Primary contact email address',
          },
          phone: {
            type: 'string',
            default: '',
            description: 'Phone number with country code',
          },
          tier: {
            type: 'string',
            enum: ['free', 'starter', 'professional', 'enterprise'],
            default: 'starter',
            description: 'Service tier determines SLA and feature set',
          },
          start_date: {
            type: 'string',
            format: 'date',
            default: '',
            description: 'Effective start date of the contract',
          },
          budget: {
            type: 'number',
            default: 0,
            description: 'Annual budget in USD',
          },
          approved: {
            type: 'boolean',
            default: false,
            description: 'I confirm all information is accurate',
          },
          notes: {
            type: 'string',
            format: 'textarea',
            default: '',
            description: 'Additional context or special requirements',
            'x-lt-span': 2,
          },
          attachment: {
            type: 'string',
            default: '',
            'x-lt-widget': 'file-upload',
            accept: '.pdf,.doc,.docx,.png,.jpg',
            description: 'Upload signed agreement or supporting documents',
            'x-lt-span': 2,
          },
        },
      },
    },
    {
      workflowType: input.workflowType,
      workflowId: input.workflowId,
      taskQueue: input.taskQueue,
    },
  );

  return escalation.id;
}

export async function processIntake(input: Record<string, unknown>): Promise<{
  received: boolean;
  fieldCount: number;
  processedAt: string;
}> {
  return {
    received: true,
    fieldCount: Object.keys(input).length,
    processedAt: new Date().toISOString(),
  };
}
