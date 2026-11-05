import { describe, it, expect } from 'vitest';

import { preferencesBrief, preferencesRow, settingsFromForm } from '../../../../../src/workflows/claude-workbench/inbox/preferences';
import { DEFAULT_REACTIONS } from '../../../../../src/workflows/claude-workbench/inbox/reactions';
import { SEAT_FORM_SCHEMA } from '../../../../../src/workflows/claude-workbench/forms';
import { violationsOf } from '../../../../helpers/form-validation';

const HOLDER = 'inbox-sam';

describe('the reactions row', () => {
  it('opens in the holder\'s inbox under Next, pre-filled with what is in force', () => {
    const row = preferencesRow(HOLDER, DEFAULT_REACTIONS, 'org');
    expect(row).toMatchObject({ role: HOLDER, subtype: 'preferences', workflowType: 'inboxPreferences' });
    expect('assignee' in row).toBe(false);
    expect(row.metadata).toMatchObject({ holder: HOLDER, seat: HOLDER, section: 'preferences', stage: 'new' });
    expect(row.envelope.section).toBe('preferences');
    expect(row.envelope.formDefaults.preferences).toMatchObject({ done: ':white_check_mark: :heavy_check_mark: :ballot_box_with_check:', onIt: ':eyes:', readCloses: 'fyi', replyMeans: 'on-it' });
    expect(row.description.length).toBeLessThanOrEqual(60);
  });

  it('tells the holder what each box does and where the settings came from', () => {
    const brief = preferencesBrief(DEFAULT_REACTIONS, 'holder');
    expect(brief).toContain('**Done.**');
    expect(brief).toContain(':eyes:');
    expect(brief).toContain('These are your own settings.');
    expect(preferencesBrief(DEFAULT_REACTIONS, 'default')).toContain('not saved your own yet');
  });

  it('turns the submitted boxes into settings, clearing a box the holder emptied', () => {
    const next = settingsFromForm({ done: '✅ :github-approve:', approved: undefined, onIt: '👀', read: '👍 🔥', dismissed: undefined, ticket: undefined, readCloses: 'always', replyMeans: undefined, closeFor: ['responsible'] }, DEFAULT_REACTIONS);
    expect(next.done).toEqual(['white_check_mark', 'github-approve']);
    expect(next.approved).toEqual([]);
    expect(next.read).toEqual(['+1', 'fire']);
    expect(next.readCloses).toBe('always');
    expect(next.replyMeans).toBe(DEFAULT_REACTIONS.replyMeans);
    expect(next.closeFor).toEqual(['responsible']);
  });

  it('is a section of the shared seat form that asks only for its two choices', () => {
    const context = { envelope: { section: 'preferences' }, lookup: {} };
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { preferences: { done: '✅' } }, context)).sort()).toEqual(['prefs_read_closes', 'prefs_reply_means']);
    expect(violationsOf(SEAT_FORM_SCHEMA, { preferences: { done: '✅', readCloses: 'fyi', replyMeans: 'on-it', closeFor: ['responsible', 'accountable'] } }, context)).toEqual({});
    expect(Object.keys(violationsOf(SEAT_FORM_SCHEMA, { preferences: { readCloses: 'sometimes', replyMeans: 'on-it' } }, context))).toEqual(['prefs_read_closes']);
  });
});
