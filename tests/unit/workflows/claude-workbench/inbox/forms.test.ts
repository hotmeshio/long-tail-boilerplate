import { describe, it, expect } from 'vitest';

import { SEAT_FORM_SCHEMA } from '../../../../../src/workflows/claude-workbench/forms';
import { INBOX_CATEGORIES, INBOX_KINDS, INBOX_NEEDS } from '../../../../../src/workflows/claude-workbench/inbox/vocabulary';
import { RACI_ITEMS, ROLE_ITEMS } from '../../../../../src/workflows/claude-workbench/org';
import { violationsOf } from '../../../../helpers/form-validation';

const lookup = { roles: { items: ROLE_ITEMS }, raci: { items: RACI_ITEMS }, kinds: { items: INBOX_KINDS }, categories: { items: INBOX_CATEGORIES }, needs: { items: INBOX_NEEDS } };
const options = [{ value: 'handle', label: 'Handle' }, { value: 'reply', label: 'Reply' }, { value: 'delegate', label: 'Delegate' }];
const triage = (extra: Record<string, unknown> = {}) => ({ envelope: { section: 'triage', decision_options: options, ...extra }, lookup });
const act = (name: string) => ({ envelope: { section: 'act', act: name }, lookup });

describe('inbox sections of the seat form', () => {
  it('decides with the row\'s options and the lookups\' classification', () => {
    expect(violationsOf(SEAT_FORM_SCHEMA, { triage: { decision: 'handle', category: 'platform', need: 'approve', raci: 'accountable' } }, triage())).toEqual({});
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { triage: { decision: 'nope', category: 'poetry' } }, triage())).sort()).toEqual(['triage_category', 'triage_decision']);
  });

  it('heads the filing fields with a read-only note: intent above, filing below, and what each role means', () => {
    const props = SEAT_FORM_SCHEMA.properties as Record<string, any>;
    const guide = props.triage_filed_guide;
    expect(guide).toMatchObject({ readOnly: true, 'x-lt-widget': 'markdown', 'x-lt-section': 'Filed as', 'x-lt-showIf': 'envelope.section=triage' });
    expect(guide.default).toContain('Above is your intent');
    for (const role of ['Responsible', 'Accountable', 'Consulted', 'Informed']) expect(guide.default).toContain(`**${role}**`);
    const filed = (SEAT_FORM_SCHEMA['x-lt-order'] as string[]).filter((key) => props[key]?.['x-lt-section'] === 'Filed as');
    expect(filed).toEqual(['triage_filed_guide', 'triage_category', 'triage_need', 'triage_raci']);
    expect(SEAT_FORM_SCHEMA.required).not.toContain('triage_filed_guide');
  });

  it('requires a reply mode on reply and a role on delegate', () => {
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { triage: { decision: 'reply' } }, triage()))).toEqual(['triage_reply_mode']);
    expect(violationsOf(SEAT_FORM_SCHEMA, { triage: { decision: 'reply', replyMode: 'ai-drafts', guidance: 'Say yes.' } }, triage())).toEqual({});
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { triage: { decision: 'delegate', delegateTo: 'ceo' } }, triage()))).toEqual(['triage_delegate_to']);
    expect(violationsOf(SEAT_FORM_SCHEMA, { triage: { decision: 'delegate', delegateTo: 'sre' } }, triage())).toEqual({});
  });

  it('asks the AI for the fields its act produces', () => {
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { act: { outcome: 'done' } }, act('reply')))).toEqual(['act_permalink']);
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { act: { outcome: 'done' } }, act('draft')))).toEqual(['act_draft']);
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { act: { outcome: 'done' } }, act('investigate')))).toEqual(['act_findings']);
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { act: { outcome: 'done' } }, act('file-ticket'))).sort()).toEqual(['act_issue', 'act_permalink']);
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { act: { outcome: 'done' } }, act('check')))).toEqual(['act_checked_through']);
    expect(violationsOf(SEAT_FORM_SCHEMA, { act: { outcome: 'done', checkedThrough: '1700000000.1', items: [] } }, act('check'))).toEqual({});
  });

  it('asks why when an act failed, and nothing else', () => {
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { act: { outcome: 'failed' } }, act('reply')))).toEqual(['act_failure_reason']);
    expect(violationsOf(SEAT_FORM_SCHEMA, { act: { outcome: 'failed', failureReason: 'No access to the channel.' } }, act('reply'))).toEqual({});
  });

  it('never asks a work row for inbox fields', () => {
    const violations = violationsOf(SEAT_FORM_SCHEMA, { handoff: { outcome: 'done', summary: 'Twenty characters at least.' } }, { envelope: { section: 'work' }, lookup });
    expect(violations).toEqual({});
  });
});
