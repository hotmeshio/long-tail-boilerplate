import { describe, it, expect } from 'vitest';

import { GOOGLE_IDENTITY_SCOPES, oauthAllowedDomains, oauthProviders, oauthRedirectUri } from '../../../src/config/oauth';

describe('sign-in providers', () => {
  it('registers Google with identity scopes only, never mail', () => {
    const [google] = oauthProviders({ OAUTH_GOOGLE_CLIENT_ID: 'id', OAUTH_GOOGLE_CLIENT_SECRET: 'secret', BASE_URL: 'https://lt.example.com' });
    expect(google.provider).toBe('google');
    expect(google.scopes).toEqual(['openid', 'email', 'profile']);
    expect(google.scopes.some((scope) => scope.includes('gmail'))).toBe(false);
    expect(GOOGLE_IDENTITY_SCOPES).toEqual(google.scopes);
  });

  it('sends Google back to the same callback path Long Tail derives on its own', () => {
    expect(oauthRedirectUri('google', { BASE_URL: 'https://lt.example.com' })).toBe('https://lt.example.com/api/auth/oauth/google/callback');
    expect(oauthRedirectUri('google', { PORT: '3030' })).toBe('http://localhost:3030/api/auth/oauth/google/callback');
    expect(oauthRedirectUri('google', {})).toBe('http://localhost:3000/api/auth/oauth/google/callback');
  });

  it('registers nothing when the Google credentials are not set', () => {
    expect(oauthProviders({})).toEqual([]);
    expect(oauthProviders({ OAUTH_GOOGLE_CLIENT_ID: 'id' })).toEqual([]);
  });
});

describe('domains a sign-in may self-provision from', () => {
  it('reads OAUTH_ALLOWED_DOMAINS as a comma-separated list', () => {
    expect(oauthAllowedDomains({ OAUTH_ALLOWED_DOMAINS: 'example.com, other.org ,,' })).toEqual(['example.com', 'other.org']);
  });

  it('falls back to the domain entries of WORKBENCH_INBOX_HOLDERS', () => {
    expect(oauthAllowedDomains({ WORKBENCH_INBOX_HOLDERS: 'example.com,ana.ruiz@example.com,sam' })).toEqual(['example.com']);
  });

  it('is open when neither is set, or when the list is set empty on purpose', () => {
    expect(oauthAllowedDomains({})).toEqual([]);
    expect(oauthAllowedDomains({ WORKBENCH_INBOX_HOLDERS: 'sam' })).toEqual([]);
    expect(oauthAllowedDomains({ OAUTH_ALLOWED_DOMAINS: '', WORKBENCH_INBOX_HOLDERS: 'example.com' })).toEqual([]);
  });
});
