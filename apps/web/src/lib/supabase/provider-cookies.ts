import { createChunks, type CookieOptions } from '@supabase/ssr';

const sessionCookie = (name: string) => /^nagi-auth(?:\.\d+)?$/.test(name);
type Cookie = { name: string; value: string; options: CookieOptions };

/** Keep Discord credentials in the server vault, including when SSR chunks a large session. */
export function withoutProviderCredentials(
  updates: Cookie[],
  existing: { name: string; value: string }[],
) {
  const active = updates.filter(
    (cookie) => sessionCookie(cookie.name) && cookie.value && cookie.options.maxAge !== 0,
  );
  if (!active.length) return updates;
  const encoded =
    active.find((cookie) => cookie.name === 'nagi-auth')?.value ??
    active
      .sort((a, b) => Number(a.name.split('.').at(-1)) - Number(b.name.split('.').at(-1)))
      .map((cookie) => cookie.value)
      .join('');
  const session: unknown = JSON.parse(
    encoded.startsWith('base64-')
      ? Buffer.from(encoded.slice(7), 'base64url').toString('utf8')
      : encoded,
  );
  if (!session || typeof session !== 'object' || Array.isArray(session))
    throw new Error('Session invalide.');
  const clean = { ...session } as Record<string, unknown>;
  delete clean.provider_token;
  delete clean.provider_refresh_token;
  delete clean.user;
  const chunks = createChunks(
    'nagi-auth',
    `base64-${Buffer.from(JSON.stringify(clean)).toString('base64url')}`,
  );
  const options = active[0]!.options;
  const stale = new Set(
    [...existing, ...updates]
      .filter((cookie) => sessionCookie(cookie.name))
      .map((cookie) => cookie.name),
  );
  for (const chunk of chunks) stale.delete(chunk.name);
  return [
    ...updates.filter((cookie) => !sessionCookie(cookie.name)),
    ...[...stale].map((name) => ({ name, value: '', options: { ...options, maxAge: 0 } })),
    ...chunks.map((chunk) => ({ ...chunk, options })),
  ];
}
