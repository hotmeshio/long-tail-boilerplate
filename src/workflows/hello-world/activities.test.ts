import { describe, it, expect, vi } from 'vitest';

// Mock getActivityIdentity before importing the module
vi.mock('@hotmeshio/long-tail', () => ({
  getActivityIdentity: () => ({
    principal: {
      id: 'user-42',
      type: 'user',
      roles: ['admin'],
    },
  }),
}));

import { greet } from './activities';

describe('hello-world / greet', () => {
  it('returns a greeting with the given name', async () => {
    const result = await greet({ name: 'Ada' });

    expect(result.message).toBe('Hello, Ada!');
    expect(result.greetedAt).toBeTruthy();
    expect(new Date(result.greetedAt).getTime()).not.toBeNaN();
  });

  it('includes IAM identity when available', async () => {
    const result = await greet({ name: 'Test' });

    expect(result.identity).toEqual({
      principalId: 'user-42',
      principalType: 'user',
      roles: ['admin'],
    });
  });
});
