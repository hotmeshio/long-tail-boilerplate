import { describe, it, expect } from 'vitest';

import { violationsOf } from '../../../helpers/form-validation';
import { MODERATOR_FORM_SCHEMA, CONTENT_REVIEW_INPUT_SCHEMA } from '../../../../src/workflows/content-review/forms';

describe('MODERATOR_FORM_SCHEMA', () => {
  it('accepts a plain approval', () => {
    expect(violationsOf(MODERATOR_FORM_SCHEMA, { moderation: { decision: 'approve' } })).toEqual({});
  });

  it('asks an edit for the corrected text', () => {
    expect(Object.keys(violationsOf(MODERATOR_FORM_SCHEMA, { moderation: { decision: 'edit' } }))).toEqual(['edited_content']);
  });

  it('asks a removal for a listed reason', () => {
    expect(violationsOf(MODERATOR_FORM_SCHEMA, { moderation: { decision: 'remove' } })).toHaveProperty('removal_reason');
    expect(violationsOf(MODERATOR_FORM_SCHEMA, { moderation: { decision: 'remove', removalReason: 'boring' } })).toHaveProperty('removal_reason');
    expect(violationsOf(MODERATOR_FORM_SCHEMA, { moderation: { decision: 'remove', removalReason: 'spam' } })).toEqual({});
  });
});

describe('CONTENT_REVIEW_INPUT_SCHEMA', () => {
  it('accepts the dashboard defaults', () => {
    const v = violationsOf(CONTENT_REVIEW_INPUT_SCHEMA, { contentId: 'article-001', contentType: 'article', content: 'Content to review...' });
    expect(v).toEqual({});
  });

  it('bounds the threshold and guards the id', () => {
    const v = violationsOf(CONTENT_REVIEW_INPUT_SCHEMA, { contentId: 'Article 1', contentType: 'article', content: 'x', threshold: 2 });
    expect(Object.keys(v).sort()).toEqual(['contentId', 'threshold']);
  });
});
