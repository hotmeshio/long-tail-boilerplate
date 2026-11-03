import { describe, it, expect } from 'vitest';

import {
  DEFAULT_REACTIONS,
  decideFromReactions,
  formatReactionList,
  normalizeReaction,
  parseReactionList,
  reactionSettingsFrom,
  reactionsKey,
} from '../../../../../src/workflows/claude-workbench/inbox/reactions';

const row = (over: Partial<{ view: string; stage: string; raci: string; need: string }> = {}) =>
  ({ view: 'triage', stage: 'new', raci: 'responsible', need: 'do', ...over }) as any;

describe('reaction names', () => {
  it('reads pasted emoji, :names: and bare names as the names Slack reports', () => {
    expect(normalizeReaction('✅')).toBe('white_check_mark');
    expect(normalizeReaction(':eyes:')).toBe('eyes');
    expect(normalizeReaction('GitHub-Approve')).toBe('github-approve');
    expect(normalizeReaction('+1::skin-tone-3')).toBe('+1');
    expect(normalizeReaction('👍🏽')).toBe('+1');
    expect(normalizeReaction('')).toBeUndefined();
    expect(normalizeReaction('not a name!')).toBeUndefined();
  });

  it('splits a paste box into names, once each, and formats them back', () => {
    expect(parseReactionList('✅ :heavy_check_mark:, done ✅')).toEqual(['white_check_mark', 'heavy_check_mark', 'done']);
    expect(parseReactionList(undefined)).toEqual([]);
    expect(formatReactionList(['white_check_mark', '🦄'])).toBe(':white_check_mark: 🦄');
  });

  it('keeps an unknown pasted emoji so the holder can see it', () => {
    expect(parseReactionList('🦄')).toEqual(['🦄']);
  });
});

describe('reaction settings', () => {
  it('fills every field from the default when an edition is partial or malformed', () => {
    expect(reactionSettingsFrom(undefined)).toEqual(DEFAULT_REACTIONS);
    const settings = reactionSettingsFrom({ done: ['✅', 7], readCloses: 'always', closeFor: ['accountable', 'bogus'], replyMeans: 'maybe' });
    expect(settings.done).toEqual(['white_check_mark']);
    expect(settings.readCloses).toBe('always');
    expect(settings.closeFor).toEqual(['accountable']);
    expect(settings.replyMeans).toBe(DEFAULT_REACTIONS.replyMeans);
    expect(settings.onIt).toEqual(DEFAULT_REACTIONS.onIt);
  });

  it("keys a holder's edition by their name", () => {
    expect(reactionsKey('inbox-ana-ruiz-at-example-com')).toBe('inbox-reactions-ana-ruiz-at-example-com');
    expect(reactionsKey('sam')).toBe('inbox-reactions-sam');
  });
});

describe('what the holder decided', () => {
  const settings = DEFAULT_REACTIONS;

  it('closes on done or approved, and says approved when the item asked for it', () => {
    expect(decideFromReactions(settings, row(), { reactions: ['white_check_mark'], replied: false })).toMatchObject({ decision: 'handle', emoji: 'white_check_mark' });
    expect(decideFromReactions(settings, row({ need: 'review' }), { reactions: ['eyes', 'github-approve'], replied: false })).toMatchObject({ decision: 'handle', reason: 'approved with :github-approve:' });
    expect(decideFromReactions(settings, row({ view: 'waiting' }), { reactions: ['✅'], replied: false })?.decision).toBe('handle');
  });

  it('parks on it, files on ticket, dismisses on not mine, but only where the view allows', () => {
    expect(decideFromReactions(settings, row(), { reactions: ['eyes'], replied: false })?.decision).toBe('on-it');
    expect(decideFromReactions(settings, row({ view: 'waiting', stage: 'waiting' }), { reactions: ['eyes'], replied: false })).toBeUndefined();
    expect(decideFromReactions(settings, row(), { reactions: ['ticket'], replied: false })?.decision).toBe('file-ticket');
    expect(decideFromReactions(settings, row({ view: 'findings', stage: 'returned' }), { reactions: ['ticket'], replied: false })).toBeUndefined();
    expect(decideFromReactions(settings, row(), { reactions: ['x'], replied: false })?.decision).toBe('dismiss');
  });

  it('lets a read emoji close only what the holder allows', () => {
    expect(decideFromReactions(settings, row(), { reactions: ['+1'], replied: false })).toBeUndefined();
    expect(decideFromReactions(settings, row({ stage: 'fyi', raci: 'informed', need: 'read' }), { reactions: ['fire'], replied: false })?.decision).toBe('handle');
    expect(decideFromReactions({ ...settings, readCloses: 'always' }, row(), { reactions: ['+1'], replied: false })?.decision).toBe('handle');
    expect(decideFromReactions({ ...settings, readCloses: 'never' }, row({ stage: 'fyi' }), { reactions: ['+1'], replied: false })).toBeUndefined();
  });

  it('reads a reply the way the holder chose', () => {
    expect(decideFromReactions(settings, row(), { reactions: [], replied: true })?.decision).toBe('on-it');
    expect(decideFromReactions({ ...settings, replyMeans: 'done' }, row(), { reactions: [], replied: true })?.decision).toBe('handle');
    expect(decideFromReactions({ ...settings, replyMeans: 'nothing' }, row(), { reactions: [], replied: true })).toBeUndefined();
  });

  it('never closes outside the roles the holder named, and never touches a draft', () => {
    const narrow = { ...settings, closeFor: ['responsible'] };
    expect(decideFromReactions(narrow, row({ raci: 'consulted' }), { reactions: ['white_check_mark'], replied: false })).toBeUndefined();
    expect(decideFromReactions(narrow, row({ raci: 'consulted' }), { reactions: ['eyes'], replied: false })?.decision).toBe('on-it');
    expect(decideFromReactions(settings, row({ view: 'draft', stage: 'returned' }), { reactions: ['white_check_mark'], replied: false })).toBeUndefined();
    expect(decideFromReactions(settings, row(), { reactions: ['rocket'], replied: false })).toBeUndefined();
  });
});
