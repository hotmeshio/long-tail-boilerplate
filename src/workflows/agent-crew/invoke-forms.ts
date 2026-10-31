/**
 * Invoke forms for the agent crew workflows; the invoke API validates `data`
 * against them for MCP callers and the dashboard alike.
 */

import { HEADLINE_MAX_LENGTH, PROJECT_SLUG_PATTERN } from '../claude-workbench/types';
import { DEFAULT_MAX_ROUNDS, KEY_PATTERN } from './types';

const PROJECT = { type: 'string', title: 'Project', description: 'Enter the project slug', pattern: PROJECT_SLUG_PATTERN, 'x-lt-pattern-error': 'Use 2 to 64 lowercase letters, digits and dashes' };
const HEADLINE = { type: 'string', title: 'Headline', description: 'A few words; the list and the detail page show it', minLength: 3, maxLength: HEADLINE_MAX_LENGTH };
const BRIEF = { type: 'string', title: 'Brief', description: 'Markdown: the ask, the constraints, the links', 'x-lt-widget': 'markdown', minLength: 10, maxLength: 20_000, 'x-lt-span': 2 };
const REPO = { type: 'string', title: 'Repo', description: 'Optional; owner/name', maxLength: 200 };
const MAX_ROUNDS = { type: 'integer', title: 'Max rounds', description: `Optional; work and review rounds before it stops (default ${DEFAULT_MAX_ROUNDS})`, minimum: 1, maximum: 10 };
const FACET = (title: string) => ({ type: 'string', title, description: 'Optional; agents claim by it', maxLength: 64 });

export const AGENT_WORK_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Name the piece.\n2. Set the area and skill agents claim by.\n3. Put the ask in the brief.',
  'x-lt-order': ['key', 'project', 'headline', 'area', 'skill', 'repo', 'maxRounds', 'brief'],
  required: ['key', 'project', 'headline', 'brief'],
  properties: {
    key: { type: 'string', title: 'Piece key', description: 'Enter a slug, e.g. handoff-form', pattern: KEY_PATTERN, 'x-lt-pattern-error': 'Use 2 to 64 lowercase letters, digits and dashes' },
    project: PROJECT,
    headline: HEADLINE,
    area: FACET('Area'),
    skill: FACET('Skill'),
    repo: REPO,
    maxRounds: MAX_ROUNDS,
    brief: BRIEF,
  },
};

export const BRANCH_LEASE_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Name the repo and branch.\n2. Claim the row it parks to hold the branch.',
  'x-lt-order': ['repo', 'branch', 'project'],
  required: ['repo', 'branch'],
  properties: {
    repo: { ...REPO, description: 'owner/name' },
    branch: { type: 'string', title: 'Branch', description: 'Enter the branch name', minLength: 1, maxLength: 200 },
    project: { ...PROJECT, description: 'Optional; the project slug' },
  },
};

export const WORKSTREAM_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Name the goal.\n2. Put the goal, constraints and links in the brief.\n3. A planner agent breaks it into pieces.',
  'x-lt-order': ['project', 'headline', 'repo', 'maxRounds', 'brief'],
  required: ['project', 'headline', 'brief'],
  properties: { project: PROJECT, headline: HEADLINE, repo: REPO, maxRounds: MAX_ROUNDS, brief: BRIEF },
};
