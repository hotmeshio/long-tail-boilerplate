import { describe, it, expect } from 'vitest';

import { admit, itemWorkflowId, laterWatermark, readItem, suggestionFor } from '../../../../../src/workflows/claude-workbench/inbox/admission';
import { STARTER_VOCABULARY, editionValues, readRule } from '../../../../../src/workflows/claude-workbench/inbox/vocabulary';

const defaults = { holder: 'inbox-sam', source: 'slack' as const };

describe('admission', () => {
  it('reads an item, dropping what is outside the vocabulary', () => {
    const item = readItem({ kind: 'request', category: 'platform', need: 'approve', raci: 'nobody', priority: '2', headline: 'Approve the rollout', summary: 'Tonight?', channelId: 'C1', messageTs: '1700000000.000100' }, STARTER_VOCABULARY, defaults);
    expect(item).toMatchObject({ holder: 'inbox-sam', source: 'slack', kind: 'request', category: 'platform', need: 'approve', priority: 2, channelId: 'C1' });
    expect(item?.raci).toBeUndefined();
    expect(item?.suggestion).toBeUndefined();
    expect(readItem({ kind: 'fyi', need: 'read', headline: 'FYI', summary: 's' }, STARTER_VOCABULARY, defaults)?.suggestion?.decision).toBe('handle');
  });

  it('refuses an unknown kind or a missing summary, and defaults the priority', () => {
    expect(readItem({ kind: 'poem', headline: 'x', summary: 'y' }, STARTER_VOCABULARY, defaults)).toBeUndefined();
    expect(readItem({ kind: 'request', headline: 'x' }, STARTER_VOCABULARY, defaults)).toBeUndefined();
    expect(readItem({ kind: 'request', headline: 'x', summary: 'y', priority: 9 }, STARTER_VOCABULARY, defaults)?.priority).toBe(3);
  });

  it('applies the first matching rule and ignores a suggestion the reporter sent', () => {
    expect(suggestionFor({ kind: 'incident' }, STARTER_VOCABULARY.rules)?.decision).toBe('investigate');
    expect(suggestionFor({ kind: 'request', need: 'answer' }, STARTER_VOCABULARY.rules)).toMatchObject({ decision: 'reply', replyMode: 'ai-drafts' });
    expect(suggestionFor({ kind: 'request' }, STARTER_VOCABULARY.rules)).toBeUndefined();
    const item = readItem({ kind: 'incident', headline: 'Down', summary: 'The site is down.', suggestion: { decision: 'dismiss' } }, STARTER_VOCABULARY, defaults);
    expect(item?.suggestion?.decision).toBe('investigate');
  });

  it('derives one id per source thing', () => {
    const a = readItem({ kind: 'request', headline: 'A', summary: 's', channelId: 'C1', messageTs: '1.5', threadTs: '1.0' }, STARTER_VOCABULARY, defaults)!;
    const b = readItem({ kind: 'request', headline: 'B', summary: 's', channelId: 'C1', messageTs: '1.7', threadTs: '1.0' }, STARTER_VOCABULARY, defaults)!;
    expect(itemWorkflowId(a)).toBe('inbox-inbox-sam-slack-c1-1-0');
    expect(itemWorkflowId(a)).toBe(itemWorkflowId(b));
    const note = readItem({ kind: 'note', headline: 'Call the vendor', summary: 's' }, STARTER_VOCABULARY, { holder: 'inbox-sam', source: 'manual' })!;
    expect(itemWorkflowId(note)).toBe('inbox-inbox-sam-manual-call-the-vendor');
  });

  it('admits in order up to the cap and moves the watermark forward only', () => {
    const items = admit([{ kind: 'request', headline: '1', summary: 's' }, { kind: 'poem', headline: '2', summary: 's' }, { kind: 'fyi', headline: '3', summary: 's' }], STARTER_VOCABULARY, defaults, 2);
    expect(items.map((item) => item.headline)).toEqual(['1']);
    expect(laterWatermark('100.1', '99.9')).toBe('100.1');
    expect(laterWatermark('100.1', '100.2')).toBe('100.2');
    expect(laterWatermark(undefined, '5')).toBe('5');
    expect(laterWatermark('5', undefined)).toBe('5');
  });

  it('reads edition values and rules back', () => {
    expect(editionValues({ items: [{ value: 'a' }, { nope: 1 }, { value: 'b' }] })).toEqual(['a', 'b']);
    expect(editionValues({ items: [] })).toBeUndefined();
    expect(readRule({ when: { kind: 'incident' }, suggests: { decision: 'investigate', guidance: 'g' } })).toEqual({ when: { kind: 'incident', category: undefined, need: undefined, raci: undefined }, suggests: { decision: 'investigate', guidance: 'g' } });
    expect(readRule({ when: {}, suggests: {} })).toBeUndefined();
  });
});
