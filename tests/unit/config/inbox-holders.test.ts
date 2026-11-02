import { describe, it, expect } from 'vitest';

import { dynamicHolders, unboundHolders } from '../../../src/config/inbox-holders';
import { parseInboxEntries } from '../../../src/workflows/claude-workbench/types';

const entries = parseInboxEntries('example.com,ana.ruiz@other.io,sam');
const named = entries.holders;

const account = (id: string, email: string, personas: string[] = []) => ({ id, email, personas });

describe('inbox binding', () => {
  it('binds an account in a listed domain once, as a dynamic holder', () => {
    const kim = account('u1', 'kim.lee@example.com');
    const [binding] = unboundHolders([kim], entries, named);
    expect(binding).toMatchObject({ account: kim, dynamic: true, holder: { persona: 'kim-lee-at-example-com' } });
    expect(unboundHolders([account('u1', 'kim.lee@example.com', ['kim-lee-at-example-com'])], entries, named)).toEqual([]);
  });

  it('binds a named email as a static holder, whose roles exist from boot', () => {
    const [binding] = unboundHolders([account('u2', 'ana.ruiz@other.io')], entries, named);
    expect(binding).toMatchObject({ dynamic: false, holder: { role: 'inbox-ana-ruiz-at-other-io' } });
  });

  it('leaves accounts outside the rules alone', () => {
    const accounts = [account('u3', 'someone@elsewhere.io'), account('u4', 'admin@longtail.local', ['org-coordinator'])];
    expect(unboundHolders(accounts, entries, named)).toEqual([]);
  });

  it('lists each dynamic holder once for a schema refresh', () => {
    const accounts = [account('u1', 'kim.lee@example.com', ['kim-lee-at-example-com']), account('u5', 'Kim.Lee@example.com'), account('u2', 'ana.ruiz@other.io'), account('u3', 'x@elsewhere.io')];
    expect(dynamicHolders(accounts, entries, named).map((holder) => holder.name)).toEqual(['kim-lee-at-example-com']);
  });
});
