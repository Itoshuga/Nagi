import 'server-only';
import { cookies } from 'next/headers';
import { createServiceDatabase } from '@nagi/database';
import { publicEnv, serverEnv } from '@/lib/env';
import { createAuthClient, isLegacyAuthCookie } from './auth';

export async function sessionDatabase(writable = false) {
  const env = publicEnv();
  const store = await cookies();
  return createAuthClient(env, {
    getAll: () => store.getAll(),
    setAll(updates) {
      // Renders are read-only. The proxy persists refreshes before rendering.
      if (!writable) return;
      for (const cookie of store.getAll()) {
        if (isLegacyAuthCookie(cookie.name, env.NEXT_PUBLIC_SUPABASE_URL)) {
          store.set(cookie.name, '', {
            httpOnly: true,
            sameSite: 'lax',
            secure: env.NEXT_PUBLIC_APP_URL.startsWith('https://'),
            path: '/',
            maxAge: 0,
          });
        }
      }
      for (const { name, value, options } of updates) store.set(name, value, options);
    },
  });
}
export function serviceDatabase() {
  const env = serverEnv();
  return createServiceDatabase(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Published catalog pages always use ordinary RLS, including when viewed by an admin. */
export function publicCatalogDatabase() {
  return createAuthClient(publicEnv(), { getAll: () => [] });
}
