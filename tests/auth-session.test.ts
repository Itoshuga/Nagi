import { afterEach, describe, expect, it, vi } from 'vitest';
import { withoutProviderCredentials } from '../apps/web/src/lib/supabase/provider-cookies';
import {
  authCookieName,
  createAuthClient,
  isLegacyAuthCookie,
  isSessionCookie,
} from '../apps/web/src/lib/supabase/auth';

type CookieUpdate = Parameters<
  NonNullable<Parameters<typeof createAuthClient>[1]['setAll']>
>[0][number];
const config = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://nagi-test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key-not-a-real-secret',
  NEXT_PUBLIC_APP_URL: 'https://nagi.example',
};
const id = '11111111-1111-4111-8111-111111111111';
function token() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, aud: 'authenticated', role: 'authenticated', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}.c2lnbmF0dXJl`;
}
function store(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const updates: CookieUpdate[] = [];
  const cacheHeaders: Record<string, string>[] = [];
  const methods: Parameters<typeof createAuthClient>[1] = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll(values, headers) {
      updates.push(...values);
      cacheHeaders.push(headers);
      for (const value of values) {
        if (value.options.maxAge === 0) jar.delete(value.name);
        else jar.set(value.name, value.value);
      }
    },
  };
  return { jar, updates, cacheHeaders, methods };
}
const user = {
  id,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'fixture@example.test',
  created_at: new Date(0).toISOString(),
  app_metadata: { provider: 'discord', providers: ['discord'] },
  user_metadata: { name: 'Fixture Discord', large_profile: 'LARGE_DISCORD_PROFILE_'.repeat(1000) },
  identities: [
    {
      id,
      user_id: id,
      identity_id: id,
      provider: 'discord',
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      identity_data: { sub: '111111111111111111' },
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
function mockAuth(validToken: string) {
  const network = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') {
      const valid = new Headers(init?.headers).get('Authorization') === `Bearer ${validToken}`;
      return Response.json(valid ? user : { code: 'bad_jwt', msg: 'Invalid JWT' }, {
        status: valid ? 200 : 401,
      });
    }
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    throw new Error(`Unexpected test endpoint: ${url.pathname}`);
  });
  vi.stubGlobal('fetch', network);
  return network;
}

describe('Nagi authentication, aligned with Kitsu', () => {
  it('captures provider tokens from OAuth only in server memory, never in response cookies', async () => {
    const access = token();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json({
          access_token: access,
          refresh_token: 'supabase-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user,
          provider_token: 'discord-private-access',
          provider_refresh_token: 'discord-private-refresh',
        }),
      ),
    );
    const cookies = store();
    const client = createAuthClient(config, cookies.methods);
    await client.auth.signInWithOAuth({
      provider: 'discord',
      options: { scopes: 'identify guilds' },
    });
    const result = await client.auth.exchangeCodeForSession('fixture-code');
    expect(result.error).toBeNull();
    expect(result.data.session?.provider_token).toBe('discord-private-access');
    const stored = JSON.parse(
      Buffer.from(cookies.jar.get(authCookieName)!.slice(7), 'base64url').toString(),
    );
    expect(stored.access_token).toBe(access);
    expect(stored).not.toHaveProperty('provider_token');
    expect(stored).not.toHaveProperty('provider_refresh_token');
    expect(stored).not.toHaveProperty('user');
  });
  it('reassembles large sessions and expires all obsolete chunks without touching other projects', () => {
    const raw = {
      access_token: 'supabase-access',
      refresh_token: 'supabase-refresh',
      provider_token: 'sensitive'.repeat(2000),
      provider_refresh_token: 'private',
    };
    const encoded = `base64-${Buffer.from(JSON.stringify(raw)).toString('base64url')}`;
    const chunks = Array.from({ length: Math.ceil(encoded.length / 3000) }, (_, i) => ({
      name: `${authCookieName}.${i}`,
      value: encoded.slice(i * 3000, (i + 1) * 3000),
    }));
    expect(chunks.length).toBeGreaterThan(1);
    const result = withoutProviderCredentials(
      [
        ...chunks.map((chunk) => ({ ...chunk, options: { httpOnly: true, path: '/' } })),
        { name: 'kitsu-auth', value: 'untouched', options: {} },
      ],
      chunks,
    );
    expect(result.find((cookie) => cookie.name === 'kitsu-auth')?.value).toBe('untouched');
    expect(
      result
        .filter((cookie) => cookie.name.startsWith('nagi-auth.'))
        .every((cookie) => cookie.options.maxAge === 0),
    ).toBe(true);
    const saved = result.find((cookie) => cookie.name === authCookieName)!;
    expect(JSON.parse(Buffer.from(saved.value.slice(7), 'base64url').toString())).toEqual({
      access_token: 'supabase-access',
      refresh_token: 'supabase-refresh',
    });
    expect(() =>
      withoutProviderCredentials([{ name: authCookieName, value: 'invalid', options: {} }], []),
    ).toThrow();
  });
  it('recognizes only Nagi session cookies, excluding OAuth verifiers and other projects', () => {
    for (const name of ['nagi-auth', 'nagi-auth.0', 'nagi-auth.1'])
      expect(isSessionCookie(name)).toBe(true);
    for (const name of [
      'kitsu-auth',
      'sb-other-auth-token',
      'nagi-auth-code-verifier',
      'nagi-auth-user',
      'nagi-authentication',
    ])
      expect(isSessionCookie(name)).toBe(false);
    expect(isLegacyAuthCookie('sb-nagi-test-auth-token.0', config.NEXT_PUBLIC_SUPABASE_URL)).toBe(
      true,
    );
    expect(isLegacyAuthCookie('sb-other-auth-token.0', config.NEXT_PUBLIC_SUPABASE_URL)).toBe(
      false,
    );
    expect(isLegacyAuthCookie('kitsu-auth', config.NEXT_PUBLIC_SUPABASE_URL)).toBe(false);
  });

  it('stores a compact HttpOnly session without the complete Discord profile', async () => {
    const access = token();
    mockAuth(access);
    const cookies = store({ 'kitsu-auth': 'unrelated-session' });
    const client = createAuthClient(config, cookies.methods);
    const { error } = await client.auth.setSession({
      access_token: access,
      refresh_token: 'fixture-refresh-token',
    });
    expect(error).toBeNull();
    const encoded = cookies.jar.get(authCookieName)!;
    expect(encoded).toMatch(/^base64-/);
    const session = JSON.parse(Buffer.from(encoded.slice(7), 'base64url').toString());
    expect(session.access_token).toBe(access);
    expect(session.refresh_token).toBe('fixture-refresh-token');
    expect(session).not.toHaveProperty('user');
    expect(encoded.length).toBeLessThan(3000);
    expect(cookies.jar.get('kitsu-auth')).toBe('unrelated-session');
    const write = cookies.updates.find((update) => update.name === authCookieName)!;
    expect(write.options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
    expect(
      cookies.cacheHeaders.some((headers) => headers['Cache-Control']?.includes('no-store')),
    ).toBe(true);
  });

  it('restores and verifies the identity from a tokens-only session on a new request', async () => {
    const access = token();
    const network = mockAuth(access);
    const cookies = store();
    await createAuthClient(config, cookies.methods).auth.setSession({
      access_token: access,
      refresh_token: 'fixture-refresh-token',
    });
    const fresh = createAuthClient(config, cookies.methods);
    const { data, error } = await fresh.auth.getClaims();
    expect(error).toBeNull();
    expect(data?.claims.sub).toBe(id);
    expect(network).toHaveBeenCalled();
  });

  it('refuses a token rejected by the authentication server', async () => {
    const access = token();
    mockAuth(access);
    const cookies = store();
    await createAuthClient(config, cookies.methods).auth.setSession({
      access_token: access,
      refresh_token: 'fixture-refresh-token',
    });
    mockAuth('another-valid-token');
    const { data, error } = await createAuthClient(config, cookies.methods).auth.getClaims();
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('starts Discord PKCE with the Nagi cookie namespace and secure callback', async () => {
    const network = vi.fn<typeof fetch>(() => {
      throw new Error('No external request expected');
    });
    vi.stubGlobal('fetch', network);
    const cookies = store();
    const { data, error } = await createAuthClient(config, cookies.methods).auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: 'https://nagi.example/auth/callback' },
    });
    expect(error).toBeNull();
    const url = new URL(data.url!);
    expect(url.searchParams.get('provider')).toBe('discord');
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    expect(
      cookies.updates.some(
        (update) =>
          update.name.startsWith(`${authCookieName}-`) &&
          update.name.includes('code-verifier') &&
          update.options.httpOnly,
      ),
    ).toBe(true);
    expect(network).not.toHaveBeenCalled();
  });

  it('closes only the current Nagi session and preserves other applications', async () => {
    const access = token();
    const network = mockAuth(access);
    const cookies = store({ 'kitsu-auth': 'unrelated-session' });
    const client = createAuthClient(config, cookies.methods);
    await client.auth.setSession({ access_token: access, refresh_token: 'fixture-refresh-token' });
    const { error } = await client.auth.signOut({ scope: 'local' });
    expect(error).toBeNull();
    expect(cookies.jar.has(authCookieName)).toBe(false);
    expect(cookies.jar.get('kitsu-auth')).toBe('unrelated-session');
    expect(
      network.mock.calls.some(([input]) => String(input).includes('/logout?scope=local')),
    ).toBe(true);
  });
});
