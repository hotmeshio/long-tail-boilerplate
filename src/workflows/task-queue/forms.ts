/**
 * The `taskWorkflow` invoke form. The task id becomes the deterministic
 * workflow id in host apps, so it is pattern-guarded here.
 */

export const TASK_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': [
    '## Task',
    '',
    'Raises one worklist row for **{{input.role}}**, resolved by metadata `taskId = {{input.taskId}}`.',
    '',
    'Set an SLA to arm the timer: when it fires the row expires and the run returns `sla-breach`. Leave it empty for an open-ended wait.',
  ].join('\n'),
  'x-lt-order': ['taskId', 'role', 'title', 'slaSeconds'],
  required: ['taskId', 'role'],
  properties: {
    taskId: {
      type: 'string',
      title: 'Task ID',
      description: 'Enter a unique id for the task',
      default: 'task-001',
      pattern: '^[A-Za-z0-9_-]{3,64}$',
      'x-lt-pattern-error': 'Use 3 to 64 letters, digits, dashes, and underscores',
    },
    role: {
      type: 'string',
      title: 'Role',
      description: 'Enter the role that works the task',
      default: 'reviewer',
      pattern: '^[a-z0-9_-]{2,64}$',
      'x-lt-pattern-error': 'Use a role name: lowercase letters, digits, dashes, underscores',
    },
    title: {
      type: 'string',
      title: 'Title',
      description: 'Optional; the worklist headline',
      default: 'Review this task',
      maxLength: 120,
      'x-lt-span': 2,
    },
    slaSeconds: {
      type: 'integer',
      title: 'SLA (seconds)',
      description: 'Optional; 1 second to 7 days',
      default: 3600,
      minimum: 1,
      maximum: 604_800,
    },
  },
};
