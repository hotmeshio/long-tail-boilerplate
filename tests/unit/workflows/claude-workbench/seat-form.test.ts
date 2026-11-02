import { describe, it, expect } from 'vitest';

import { SEAT_FORM_SCHEMA, SEAT_LIST_SCHEMA } from '../../../../src/workflows/claude-workbench/forms';
import { DELIVERABLE_TYPES } from '../../../../src/workflows/claude-workbench/org';
import { violationsOf } from '../../../helpers/form-validation';

const ctx = (section: string, extra: Record<string, unknown> = {}) => ({
  envelope: { section, ...extra },
  lookup: { types: { items: DELIVERABLE_TYPES } },
});

const SUMMARY = 'Wrote the TDD, linked the diagram, left two open questions.';

describe('SEAT_FORM_SCHEMA', () => {
  it('has no cancel and lists every field in its order', () => {
    expect(SEAT_FORM_SCHEMA['x-lt-labels'].cancel).toBe(false);
    const fields = Object.keys(SEAT_FORM_SCHEMA.properties).sort();
    expect([...SEAT_FORM_SCHEMA['x-lt-order']].sort()).toEqual(fields);
  });

  describe('work section', () => {
    it('accepts a done handoff with assets', () => {
      const payload = { handoff: { outcome: 'done', summary: SUMMARY, assets: [{ label: 'PR 42', url: 'https://example.com/pr/42' }] } };
      expect(violationsOf(SEAT_FORM_SCHEMA, payload, ctx('work'))).toEqual({});
    });

    it('requires the question when blocked, and a summary long enough to read', () => {
      const payload = { handoff: { outcome: 'blocked', summary: 'x' } };
      expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, payload, ctx('work'))).sort()).toEqual(['work_blocker_question', 'work_summary']);
    });

    it('does not require the question when done', () => {
      const payload = { handoff: { outcome: 'done', summary: SUMMARY } };
      expect(violationsOf(SEAT_FORM_SCHEMA, payload, ctx('work'))).toEqual({});
    });

    it('never asks for review, decision or gate fields', () => {
      const violations = violationsOf(SEAT_FORM_SCHEMA, { handoff: {} }, ctx('work'));
      expect(Object.keys(violations).every((field) => field.startsWith('work_'))).toBe(true);
    });
  });

  describe('review section', () => {
    it('accepts an acceptance without findings', () => {
      expect(violationsOf(SEAT_FORM_SCHEMA, { review: { verdict: 'accepted' } }, ctx('review'))).toEqual({});
    });

    it('requires findings when changes are requested', () => {
      expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { review: { verdict: 'changes-requested' } }, ctx('review')))).toEqual(['review_findings']);
    });
  });

  describe('decide section', () => {
    const options = [{ value: 'go-ahead', label: 'Go' }, { value: 'rework', label: 'Rework' }];

    it('takes its options from the row', () => {
      expect(violationsOf(SEAT_FORM_SCHEMA, { decision: { outcome: 'go-ahead' } }, ctx('decide', { decision_options: options }))).toEqual({});
      expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { decision: { outcome: 'nope' } }, ctx('decide', { decision_options: options })))).toEqual(['decision_outcome']);
    });

    it('requires the rework list only on rework, drawn from the deliverable types', () => {
      const held = ctx('decide', { decision_options: options });
      expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { decision: { outcome: 'rework' } }, held))).toEqual(['decision_rework']);
      expect(violationsOf(SEAT_FORM_SCHEMA, { decision: { outcome: 'rework', rework: ['tdd'] } }, held)).toEqual({});
      expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { decision: { outcome: 'rework', rework: ['not-a-kind'] } }, held))).toEqual(['decision_rework']);
    });
  });

  describe('gate section', () => {
    it('approves without notes and holds with them', () => {
      expect(violationsOf(SEAT_FORM_SCHEMA, { gate: { verdict: 'approve' } }, ctx('gate'))).toEqual({});
      expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { gate: { verdict: 'hold' } }, ctx('gate')))).toEqual(['gate_notes']);
      expect(violationsOf(SEAT_FORM_SCHEMA, { gate: { verdict: 'hold', notes: 'The runbook is missing recovery.' } }, ctx('gate'))).toEqual({});
    });
  });
});

describe('SEAT_LIST_SCHEMA', () => {
  it('is a facet table that opens rows by claim', () => {
    expect(SEAT_LIST_SCHEMA['x-lt-layout']).toBe('facet-table');
    expect(SEAT_LIST_SCHEMA['x-lt-row-action']).toMatchObject({ action: 'claim' });
    expect(SEAT_LIST_SCHEMA['x-lt-columns'].map((column) => column.label)).toContain('Section');
  });
});
