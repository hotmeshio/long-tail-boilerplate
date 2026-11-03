/**
 * Dashboard sign-in providers. Long Tail detects a provider from its env
 * credentials, but its Google default also asks for Gmail read access and
 * keeps a refresh token. Sign-in here is identity only: email and name, which
 * is all the inbox binder needs. Anything that reads a person's mail is their
 * own agent's connector, not this deployment.
 */

import type { LTOAuthProviderConfig } from '@hotmeshio/long-tail';

/** What Google sign-in may see: who the person is, nothing they own. */
export const GOOGLE_IDENTITY_SCOPES = ['openid', 'email', 'profile'];

/** Where Google sends the person back; the same path Long Tail derives for an env-detected provider. */
export function oauthRedirectUri(provider: string, env: NodeJS.ProcessEnv = process.env): string {
  const baseUrl = env.BASE_URL || `http://localhost:${env.PORT || '3000'}`;
  return `${baseUrl}/api/auth/oauth/${provider}/callback`;
}

/** The Google provider with identity scopes, or nothing when its credentials are not set. */
export function oauthProviders(env: NodeJS.ProcessEnv = process.env): LTOAuthProviderConfig[] {
  const clientId = env.OAUTH_GOOGLE_CLIENT_ID;
  const clientSecret = env.OAUTH_GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  return [{ provider: 'google', clientId, clientSecret, scopes: GOOGLE_IDENTITY_SCOPES, redirectUri: oauthRedirectUri('google', env) }];
}
