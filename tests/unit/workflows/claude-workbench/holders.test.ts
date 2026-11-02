import { describe, it, expect } from 'vitest';

import { holderForEmail, holderRoleSpecs, parseDomain, parseHolder, parseHolders, parseInboxEntries } from '../../../../src/workflows/claude-workbench/types';

describe('inbox holders', () => {
  it('turns a sign-in email into a role and persona in the role alphabet', () => {
    expect(parseHolder('Ana.Ruiz@Example.com')).toEqual({ name: 'ana-ruiz-at-example-com', email: 'ana.ruiz@example.com', role: 'inbox-ana-ruiz-at-example-com', agentRole: 'inbox-agent-ana-ruiz-at-example-com', persona: 'ana-ruiz-at-example-com', title: 'Ana Ruiz' });
  });

  it('accepts a bare name without an account', () => {
    expect(parseHolder('sam')).toEqual({ name: 'sam', email: undefined, role: 'inbox-sam', agentRole: 'inbox-agent-sam', persona: 'sam', title: 'Sam' });
  });

  it('drops what cannot be a role name and duplicates', () => {
    expect(parseHolder('123')).toBeUndefined();
    expect(parseHolder('')).toBeUndefined();
    expect(parseHolders('sam, sam ,ana.ruiz@example.com').map((holder) => holder.role)).toEqual(['inbox-sam', 'inbox-ana-ruiz-at-example-com']);
    expect(parseHolders('ana@a.io,ana@b.io').map((holder) => holder.role)).toEqual(['inbox-ana-at-a-io', 'inbox-ana-at-b-io']);
    expect(parseHolders(undefined).map((holder) => holder.name)).toEqual(['sam']);
  });

  it('gives a holder an inbox in people and an agent queue in agents', () => {
    const specs = holderRoleSpecs(parseHolder('sam')!);
    expect(specs.map((spec) => [spec.role, spec.domain])).toEqual([['inbox-sam', 'people'], ['inbox-agent-sam', 'agents']]);
  });
});

describe('inbox domain rules', () => {
  it('reads a domain with or without the leading at sign, and nothing else', () => {
    expect(parseDomain('Example.com')).toBe('example.com');
    expect(parseDomain('@example.com')).toBe('example.com');
    expect(parseDomain('mail.example.co.uk')).toBe('mail.example.co.uk');
    expect(parseDomain('sam')).toBeUndefined();
    expect(parseDomain('ana@example.com')).toBeUndefined();
    expect(parseDomain('not a domain')).toBeUndefined();
  });

  it('splits entries into named holders and domains', () => {
    const entries = parseInboxEntries(' example.com, sam, ana.ruiz@other.io ,@example.com');
    expect(entries.domains).toEqual(['example.com']);
    expect(entries.holders.map((holder) => holder.name)).toEqual(['sam', 'ana-ruiz-at-other-io']);
    expect(parseInboxEntries(undefined)).toEqual({ domains: [], holders: parseHolders(undefined) });
  });

  it('entitles a named email, mints a holder for a listed domain, and refuses the rest', () => {
    const entries = parseInboxEntries('example.com,ana.ruiz@other.io,sam');
    expect(holderForEmail('Ana.Ruiz@other.io', entries)?.role).toBe('inbox-ana-ruiz-at-other-io');
    expect(holderForEmail('kim.lee@example.com', entries)).toMatchObject({ role: 'inbox-kim-lee-at-example-com', persona: 'kim-lee-at-example-com', title: 'Kim Lee' });
    expect(holderForEmail('kim.lee@sub.example.com', entries)).toBeUndefined();
    expect(holderForEmail('kim.lee@elsewhere.io', entries)).toBeUndefined();
    expect(holderForEmail(null, entries)).toBeUndefined();
    expect(holderForEmail('sam', entries)).toBeUndefined();
  });
});
