/**
 * Invoke forms for the workbench workflows. The invoke API validates `data`
 * against these, so MCP callers get the same guards as the dashboard.
 */

import { HEADLINE_MAX_LENGTH, PROJECT_SLUG_PATTERN, WORK_ROLES } from './types';

const ROLE_OPTIONS = WORK_ROLES.map((role) => ({ value: role, label: role }));

const PROJECT_FIELD = {
  type: 'string',
  title: 'Project',
  description: 'Enter the project slug',
  pattern: PROJECT_SLUG_PATTERN,
  'x-lt-pattern-error': 'Use 2 to 64 lowercase letters, digits and dashes',
};

const HEADLINE_FIELD = {
  type: 'string',
  title: 'Headline',
  description: 'A few words; the list and the detail page show it',
  minLength: 3,
  maxLength: HEADLINE_MAX_LENGTH,
};

const BRIEF_INPUT_FIELD = {
  type: 'string',
  title: 'Brief',
  description: 'Markdown shown at the top of the form: the question, the options, the links',
  'x-lt-widget': 'markdown',
  minLength: 10,
  maxLength: 20_000,
  'x-lt-span': 2,
};

const SESSION_FIELD = {
  type: 'string',
  title: 'Session id',
  description: 'Optional; the Claude session that parked it',
  pattern: '^[0-9a-f-]{36}$',
  'x-lt-pattern-error': 'Use a session UUID',
};

const PR_FIELD = {
  type: 'integer',
  title: 'PR',
  description: 'Optional; the pull request number',
  minimum: 1,
};

export const OWNER_ESCALATION_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Pick the queue.\n2. Write a short headline.\n3. Put the context in the brief.',
  'x-lt-order': ['role', 'project', 'headline', 'pr', 'sessionId', 'priority', 'timeoutHours', 'brief'],
  required: ['role', 'project', 'headline', 'brief'],
  properties: {
    role: { type: 'string', title: 'Queue', description: 'Pick the role that works it', 'x-lt-options': ROLE_OPTIONS },
    project: PROJECT_FIELD,
    headline: HEADLINE_FIELD,
    pr: PR_FIELD,
    sessionId: SESSION_FIELD,
    priority: { type: 'integer', title: 'Priority', description: 'Optional; 1 is most urgent', minimum: 1, maximum: 4 },
    timeoutHours: { type: 'integer', title: 'Expires after (hours)', description: 'Optional; leave empty to wait', minimum: 1, maximum: 2160 },
    brief: BRIEF_INPUT_FIELD,
  },
};

export const CLAUDE_PROJECT_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Name the project.\n2. Write a short headline.\n3. Put the goal in the brief.',
  'x-lt-order': ['project', 'headline', 'repo', 'brief'],
  required: ['project', 'headline', 'brief'],
  properties: {
    project: PROJECT_FIELD,
    headline: HEADLINE_FIELD,
    repo: { type: 'string', title: 'Repo', description: 'Optional; owner/name', maxLength: 200 },
    brief: BRIEF_INPUT_FIELD,
  },
};

export const PROJECT_PLAN_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Pick the queue.\n2. List the step keys.\n3. Describe each step in the brief.',
  'x-lt-order': ['role', 'project', 'headline', 'sessionId', 'steps', 'brief'],
  required: ['role', 'project', 'headline', 'steps', 'brief'],
  properties: {
    role: { type: 'string', title: 'Queue', description: 'Pick the role that works it', 'x-lt-options': ROLE_OPTIONS },
    project: PROJECT_FIELD,
    headline: HEADLINE_FIELD,
    sessionId: SESSION_FIELD,
    steps: {
      type: 'array',
      title: 'Steps',
      description: 'Enter each step key, e.g. declare-personas',
      'x-lt-widget': 'json',
      items: { type: 'string', pattern: PROJECT_SLUG_PATTERN },
      minItems: 1,
      maxItems: 20,
      'x-lt-span': 2,
    },
    brief: BRIEF_INPUT_FIELD,
  },
};
