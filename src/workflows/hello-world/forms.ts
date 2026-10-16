/**
 * The `helloWorkflow` invoke form. Nothing is required, so cron and agent
 * reactions that start the workflow with their own data still pass the gate.
 */

export const HELLO_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-help': 'Greets **{{input.name}}** after a durable sleep of **{{input.delaySeconds}}** seconds. The reply carries the IAM identity the activity ran as.',
  'x-lt-order': ['name', 'delaySeconds'],
  properties: {
    name: {
      type: 'string',
      title: 'Name',
      description: 'Enter who to greet',
      default: 'World',
      maxLength: 80,
    },
    delaySeconds: {
      type: 'integer',
      title: 'Sleep (seconds)',
      description: 'Enter how long to sleep before greeting, 0 to 60',
      default: 1,
      minimum: 0,
      maximum: 60,
    },
  },
};
