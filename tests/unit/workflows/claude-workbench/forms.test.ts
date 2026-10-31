import { describe, it, expect } from 'vitest';

import { violationsOf } from '../../../helpers/form-validation';
import {
  OWNER_DECIDE_FORM_SCHEMA,
  CLAUDE_NEXT_FORM_SCHEMA,
  OWNER_DECIDE_LIST_SCHEMA,
} from '../../../../src/workflows/claude-workbench/forms';
import { CLAUDE_PROJECT_FORM_SCHEMA } from '../../../../src/workflows/claude-workbench/project-form';

const brief = '### AGENTS.md\n\nRestore the block?';

describe('owner and claude-next forms', () => {
  it('accept an outcome with the brief riding along', () => {
    expect(violationsOf(OWNER_DECIDE_FORM_SCHEMA, { brief, outcome: 'go-ahead' })).toEqual({});
  });

  it('require an outcome', () => {
    expect(violationsOf(OWNER_DECIDE_FORM_SCHEMA, { brief, notes: 'later' })).toHaveProperty('outcome');
  });

  it('refuse an outcome the role does not offer', () => {
    expect(violationsOf(CLAUDE_NEXT_FORM_SCHEMA, { outcome: 'go-ahead' })).toHaveProperty('outcome');
  });

  it('render the brief first, as read-only markdown', () => {
    expect(OWNER_DECIDE_FORM_SCHEMA['x-lt-order'][0]).toBe('brief');
    expect(OWNER_DECIDE_FORM_SCHEMA.properties.brief).toMatchObject({ readOnly: true, 'x-lt-widget': 'markdown' });
  });

  it('list rows by headline and project', () => {
    const labels = OWNER_DECIDE_LIST_SCHEMA['x-lt-columns'].map((column) => column.label);
    expect(labels.slice(0, 2)).toEqual(['Headline', 'Project']);
  });
});

describe('CLAUDE_PROJECT_FORM_SCHEMA', () => {
  const session = { resume: 'claude --resume 9b2034cd-7593-4d1d-a221-7941c02529fe', note: 'PostHog default on', pr: 9266 };

  it('accepts a session item without the close fields', () => {
    expect(violationsOf(CLAUDE_PROJECT_FORM_SCHEMA, { session })).toEqual({});
  });

  it('asks a session item for its note', () => {
    expect(violationsOf(CLAUDE_PROJECT_FORM_SCHEMA, { session: { resume: session.resume } })).toHaveProperty('session_note');
  });

  it('asks a manual close for its closing', () => {
    expect(violationsOf(CLAUDE_PROJECT_FORM_SCHEMA, { summary: 'done' })).toHaveProperty('closing');
  });

  it('accepts a manual close', () => {
    expect(violationsOf(CLAUDE_PROJECT_FORM_SCHEMA, { closing: 'shipped', summary: 'Merged as PR 9266' })).toEqual({});
  });
});
