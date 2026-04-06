/**
 * Hello World activities.
 *
 * Each activity runs as a separate checkpointed step.
 * IAM context is available via getActivityIdentity().
 */

import { getActivityIdentity } from '@hotmeshio/long-tail';

export async function greet(input: { name: string }): Promise<{
  message: string;
  greetedAt: string;
  identity: Record<string, unknown>;
}> {
  const identity = getActivityIdentity();

  return {
    message: `Hello, ${input.name}!`,
    greetedAt: new Date().toISOString(),
    identity: identity
      ? {
          principalId: identity.principal.id,
          principalType: identity.principal.type,
          roles: identity.principal.roles,
        }
      : { note: 'No IAM context (workflow invoked without identity)' },
  };
}
