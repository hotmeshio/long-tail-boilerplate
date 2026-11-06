import { describe, it, expect } from 'vitest';

import { actInstructions, checkInstructions, decideBrief, itemCard, safeMarkdown } from '../../../../../src/workflows/claude-workbench/inbox/brief';
import { actRow, checkRow, decideRow, stageOf } from '../../../../../src/workflows/claude-workbench/inbox/rows';
import type { ItemSpec } from '../../../../../src/workflows/claude-workbench/inbox/types';

const item: ItemSpec = {
  holder: 'inbox-sam', source: 'slack', kind: 'request', category: 'platform', need: 'approve', raci: 'accountable', priority: 2,
  headline: 'Approve the rollout', summary: 'Can we roll out <b>tonight</b>?', channelId: 'C1', channelName: 'platform', messageTs: '1.0',
  permalink: 'https://slack.example/p1', fromName: 'Ana', suggestion: { decision: 'investigate', guidance: 'Check the risk.' },
};

describe('inbox briefs', () => {
  it('escapes message text and drops non-http links', () => {
    expect(safeMarkdown('<b>x</b> [go](javascript:void) [ok](https://x)')).toBe('&lt;b&gt;x&lt;/b&gt; [go]() [ok](https://x)');
    expect(itemCard(item)).toContain('&lt;b&gt;tonight&lt;/b&gt;');
    expect(itemCard(item)).toContain('#### Ana · #platform');
    expect(itemCard(item)).toContain('`request` · platform · needs: approve · you: accountable · P2');
  });

  it('adds what the AI brought back under the card', () => {
    const brief = decideBrief('findings', item, { findings: 'It was DNS.', request: { decision: 'investigate', guidance: 'Why?' } });
    expect(brief).toContain('### Findings');
    expect(brief).toContain('It was DNS.');
    expect(brief).toContain('**You asked:** Why?');
    expect(decideBrief('triage', item, {})).toBe(itemCard(item));
  });

  it('tells the AI what to do and what to resolve with', () => {
    expect(actInstructions('reply', item, { approvedReply: 'Yes, tonight.' })).toContain('Post these exact words');
    expect(actInstructions('draft', item, { request: { decision: 'reply', guidance: 'Say yes.' }, redraftNotes: 'Shorter.', draft: 'Long draft.' })).toContain('Change: Shorter.');
    expect(actInstructions('investigate', item, {})).toContain('Resolve with act.findings');
    expect(checkInstructions('inbox-sam', 'slack', '1700000000.5', 20)).toContain('since `1700000000.5`');
  });
});

describe('inbox stages', () => {
  it('names where an item stands for the holder', () => {
    expect(stageOf('triage', item)).toBe('new');
    expect(stageOf('triage', { ...item, raci: 'informed' })).toBe('fyi');
    expect(stageOf('triage', { ...item, need: 'read' })).toBe('fyi');
    expect(stageOf('findings', item)).toBe('returned');
    expect(stageOf('draft', item)).toBe('returned');
    expect(stageOf('waiting', item)).toBe('waiting');
  });
});

describe('inbox rows', () => {
  it('parks the holder\'s row with the suggestion pre-filled', () => {
    const row = decideRow('item-1', 'triage', item, {});
    expect(row).toMatchObject({ role: 'inbox-sam', subtype: 'triage', priority: 2, description: 'Approve the rollout' });
    expect(row.envelope.section).toBe('triage');
    expect(row.envelope.formDefaults.triage).toEqual({ decision: 'investigate', guidance: 'Check the risk.', category: 'platform', need: 'approve', raci: 'accountable' });
    expect(row.metadata).toMatchObject({ holder: 'inbox-sam', item: 'item-1', kind: 'request', category: 'platform', view: 'triage', stage: 'new' });
  });

  it('parks the agent\'s rows in the holder\'s own agent queue', () => {
    const row = actRow('item-1', 'investigate', item, {});
    expect(row).toMatchObject({ role: 'inbox-agent-sam', subtype: 'investigate' });
    expect('assignee' in row).toBe(false);
    expect('assignee' in decideRow('item-1', 'triage', item, {})).toBe(false);
    expect(row.envelope).toMatchObject({ section: 'act', act: 'investigate' });
    const check = checkRow({ holder: 'inbox-sam', source: 'slack' }, '1.0');
    expect(check).toMatchObject({ role: 'inbox-agent-sam', subtype: 'check' });
    expect(check.envelope).toMatchObject({ act: 'check', watermark: '1.0', holder: 'inbox-sam' });
  });

  it('carries what the agent reads as lookups, so a member needs no knowledge grant', () => {
    const asOf = (refs: { key: string; as?: string; version?: unknown }[]) => Object.fromEntries(refs.map((ref) => [ref.as, ref.key]));
    const act = actRow('item-1', 'reply', item, {}).lookups;
    expect(asOf(act)).toMatchObject({ guide: 'inbox-triage-guide', reactions: 'inbox-reactions-sam', reactionsDefault: 'inbox-reactions', kinds: 'inbox-kinds' });
    expect(asOf(act)).not.toHaveProperty('corrections');
    const check = checkRow({ holder: 'inbox-sam', source: 'slack' }, '1.0').lookups;
    expect(asOf(check)).toMatchObject({ guide: 'inbox-triage-guide', reactions: 'inbox-reactions-sam', rules: 'inbox-rules', corrections: 'inbox-corrections' });
    expect([...act, ...check].every((ref) => ref.version === undefined)).toBe(true);
    expect(asOf(decideRow('item-1', 'triage', item, {}).lookups)).not.toHaveProperty('guide');
  });

  it('points the agent at the row\'s lookups, not at the knowledge store', () => {
    for (const text of [actInstructions('reply', item, { approvedReply: 'Yes.' }), checkInstructions('inbox-sam', 'slack', '1.0')]) {
      expect(text).toContain('`guide` lookup');
      expect(text).not.toContain('org/');
    }
    expect(checkInstructions('inbox-sam', 'slack', '1.0')).toContain('`corrections` lookup');
  });
});
