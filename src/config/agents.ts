import type { LTAgentConfig } from '@hotmeshio/long-tail';

export const AGENTS: LTAgentConfig[] = [
  {
    name: 'health-monitor',
    description: 'Watches for workflow failures and alerts before cascading issues',
    goals: 'Detect failures early, capture diagnostics, and alert before cascading issues',
    rules: 'Do not restart failed workflows automatically. Capture state and escalate.',
    status: 'active',
    knowledge_domain: 'system-health',
    schedules: [
      { cron: '*/15 * * * *', workflow_type: 'helloWorkflow', execute_as: 'superadmin' },
    ],
    subscriptions: [
      {
        topic: 'workflow.failed',
        reaction_type: 'durable',
        workflow_type: 'helloWorkflow',
        execute_as: 'superadmin',
        input_mapping: { data: { error: '{event.status}', workflowId: '{event.workflowId}' } },
      },
      {
        topic: 'activity.failed',
        reaction_type: 'durable',
        workflow_type: 'helloWorkflow',
        execute_as: 'superadmin',
        input_mapping: { data: { activity: '{event.activityName}', workflowId: '{event.workflowId}' } },
      },
    ],
  },
  {
    name: 'event-coordinator',
    description: 'Routes cross-system events to workflows for automated processing',
    goals: 'Serve as the central nervous system for event-driven automation',
    rules: 'Route critical events within 5 seconds. Never drop events.',
    status: 'active',
    knowledge_domain: 'event-routing',
    subscriptions: [
      {
        topic: 'app.>',
        reaction_type: 'durable',
        workflow_type: 'helloWorkflow',
        execute_as: 'superadmin',
        input_mapping: { data: { topic: '{event.type}', source: '{event.source}', payload: '{event.data}' } },
      },
      {
        topic: 'knowledge.stored',
        reaction_type: 'durable',
        workflow_type: 'helloWorkflow',
        execute_as: 'superadmin',
        input_mapping: { data: { domain: '{event.data.domain}', key: '{event.data.key}' } },
      },
    ],
  },
];
