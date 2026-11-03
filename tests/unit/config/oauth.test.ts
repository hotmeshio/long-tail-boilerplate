import { describe, it, expect } from 'vitest';

import { GOOGLE_IDENTITY_SCOPES, oauthProviders, oauthRedirectUri } from '../../../src/config/oauth';

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
