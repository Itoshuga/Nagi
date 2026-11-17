import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import { timedFetch, type Database } from '@nagi/database';

export const authCookieName = 'nagi-auth';
export const isSessionCookie = (name: string) => /^nagi-auth(?:\.\d+)?$/.test(name);

type AuthConfig = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
};

/** Only the old cookies for this Supabase project belong to this migration. */
export function isLegacyAuthCookie(name: string, supabaseUrl: string) {
  const project = new URL(supabaseUrl).hostname.split('.')[0];
  const prefix = `sb-${project}-auth-token`;
  return name === prefix || name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`);
}

/** The proxy, actions and callback use the exact same cookie/session contract. */
export function createAuthClient(config: AuthConfig, methods: CookieMethodsServer) {
  return createServerClient<Database>(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { fetch: timedFetch },
      cookieOptions: {
        name: authCookieName,
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NEXT_PUBLIC_APP_URL.startsWith('https://'),
        path: '/',
      },
      // As in Kitsu: keep the complete Discord user object out of request headers.
      cookies: { ...methods, encode: 'tokens-only' },
    },
  );
}
