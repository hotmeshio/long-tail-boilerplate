import { describe, it, expect } from 'vitest';

import { actFailed, afterAct, afterTriage, decisionOptions, openingStep, reclassified } from '../../../../../src/workflows/claude-workbench/inbox/steps';
import type { ItemSpec } from '../../../../../src/workflows/claude-workbench/inbox/types';

const item: ItemSpec = { holder: 'inbox-sam', source: 'slack', kind: 'request', category: 'platform', need: 'approve', raci: 'accountable', priority: 2, headline: 'Approve the rollout', summary: 'Can we roll out tonight?' };

describe('inbox triage routes', () => {
  it('opens on triage and offers the view\'s options', () => {
    expect(openingStep()).toEqual({ kind: 'decide', view: 'triage' });
    expect(decisionOptions('triage').map((o) => o.value)).toContain('on-it');
    expect(decisionOptions('findings').map((o) => o.value)).not.toContain('on-it');
    expect(decisionOptions('draft').map((o) => o.value)).toEqual(['post', 'redraft', 'drop']);
  });

  it('closes on handle and dismiss', () => {
    expect(afterTriage('triage', { decision: 'handle' }, {}).step).toEqual({ kind: 'done', close: 'handled' });
    expect(afterTriage('findings', { decision: 'dismiss' }, {}).step).toEqual({ kind: 'done', close: 'dismissed' });
  });

  it('routes a reply by its mode', () => {
    expect(afterTriage('triage', { decision: 'reply', replyMode: 'ai-drafts', guidance: 'Say yes.' }, {}).step).toEqual({ kind: 'act', act: 'draft' });
    const verbatim = afterTriage('triage', { decision: 'reply', replyMode: 'verbatim', guidance: 'Yes, tonight.' }, {});
    expect(verbatim.step).toEqual({ kind: 'act', act: 'reply' });
    expect(verbatim.context.approvedReply).toBe('Yes, tonight.');
    expect(afterTriage('triage', { decision: 'reply', replyMode: 'ai-posts', guidance: 'Yes.' }, {}).context.approvedReply).toBeUndefined();
  });

  it('routes investigate, file-ticket, delegate and on-it', () => {
    expect(afterTriage('triage', { decision: 'investigate', guidance: 'Why?' }, {}).step).toEqual({ kind: 'act', act: 'investigate' });
    expect(afterTriage('triage', { decision: 'file-ticket' }, {}).step).toEqual({ kind: 'act', act: 'file-ticket' });
    const delegated = afterTriage('triage', { decision: 'delegate', delegateTo: 'sre' }, {});
    expect(delegated.step).toEqual({ kind: 'act', act: 'delegate' });
    expect(delegated.context.waitingOn).toBe('sre');
    const onIt = afterTriage('triage', { decision: 'on-it' }, {});
    expect(onIt.step).toEqual({ kind: 'decide', view: 'waiting' });
    expect(onIt.context.waitingOn).toBe('you');
  });

  it('handles a draft: post, redraft, drop', () => {
    const context = { draft: 'Hello there.' };
    expect(afterTriage('draft', { decision: 'post' }, context)).toMatchObject({ step: { kind: 'act', act: 'reply' }, context: { approvedReply: 'Hello there.' } });
    expect(afterTriage('draft', { decision: 'redraft', guidance: 'Shorter.' }, context)).toMatchObject({ step: { kind: 'act', act: 'draft' }, context: { redraftNotes: 'Shorter.' } });
    expect(afterTriage('draft', { decision: 'drop' }, context).step).toEqual({ kind: 'done', close: 'draft-dropped' });
  });

  it('carries approved findings out and reports the outcome', () => {
    const findings = { findings: 'Replace the five order codes.', request: { decision: 'investigate' } };
    expect(afterTriage('findings', { decision: 'apply', guidance: 'Go.' }, findings).step).toEqual({ kind: 'act', act: 'apply' });
    expect(decisionOptions('findings')[0].value).toBe('apply');
    expect(decisionOptions('triage').map((o) => o.value)).not.toContain('apply');
    const outcome = afterAct('apply', { outcome: 'done', summary: 'Replaced them.', permalink: 'https://doc' }, findings);
    expect(outcome).toMatchObject({ step: { kind: 'decide', view: 'outcome' }, context: { applied: 'Replaced them.', permalink: 'https://doc' } });
  });

  it('re-parks on an unknown decision', () => {
    expect(afterTriage('triage', { decision: 'teleport' }, {}).step).toEqual({ kind: 'decide', view: 'triage' });
  });
});

describe('inbox act routes', () => {
  it('brings results back to the holder', () => {
    expect(afterAct('draft', { outcome: 'done', draft: 'Hi.' }, {})).toMatchObject({ step: { kind: 'decide', view: 'draft' }, context: { draft: 'Hi.' } });
    expect(afterAct('investigate', { outcome: 'done', findings: 'It was DNS.' }, {})).toMatchObject({ step: { kind: 'decide', view: 'findings' } });
    expect(afterAct('file-ticket', { outcome: 'done', issue: 'ENG-12' }, {})).toMatchObject({ step: { kind: 'done', close: 'ticketed' }, context: { issue: 'ENG-12' } });
    expect(afterAct('delegate', { outcome: 'done' }, { waitingOn: 'sre' }).step).toEqual({ kind: 'decide', view: 'waiting' });
  });

  it('closes a reply, or waits when someone else is on it', () => {
    expect(afterAct('reply', { outcome: 'done', permalink: 'https://x' }, {}).step).toEqual({ kind: 'done', close: 'replied' });
    expect(afterAct('reply', { outcome: 'done' }, { waitingOn: 'sre' }).step).toEqual({ kind: 'decide', view: 'waiting' });
  });

  it('turns a failure into an outcome for the holder', () => {
    expect(afterAct('reply', { outcome: 'failed', failureReason: 'No access.' }, {})).toMatchObject({ step: { kind: 'decide', view: 'outcome' }, context: { failure: 'No access.' } });
    expect(actFailed({}, 'Timed out.').context.failure).toBe('Timed out.');
  });
});

describe('reclassification', () => {
  it('reports only what changed', () => {
    expect(reclassified(item, { decision: 'handle' })).toBeUndefined();
    expect(reclassified(item, { decision: 'handle', category: 'platform' })).toBeUndefined();
    expect(reclassified(item, { decision: 'handle', need: 'decide', raci: 'responsible' })).toEqual({ from: { need: 'approve', raci: 'accountable' }, to: { need: 'decide', raci: 'responsible' } });
  });
});
