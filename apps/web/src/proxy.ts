import { NextResponse, type NextRequest } from 'next/server';
import { isPrivatePath } from '@nagi/shared';
import { publicEnv } from '@/lib/env';
import { createAuthClient, isLegacyAuthCookie, isSessionCookie } from '@/lib/supabase/auth';
import { withoutProviderCredentials } from '@/lib/supabase/provider-cookies';

export async function proxy(request: NextRequest) {
  const env = publicEnv();
  const privateRoute = isPrivatePath(request.nextUrl.pathname);
  let response = NextResponse.next({ request });
  const cacheHeaders = new Headers();
  // Upgrade existing Phase 1 sessions too, without waiting for their next Supabase refresh.
  const incoming = request.cookies
    .getAll()
    .filter((cookie) => isSessionCookie(cookie.name) && cookie.value);
  if (incoming.length) {
    try {
      const clean = withoutProviderCredentials(
        incoming.map((cookie) => ({
          ...cookie,
          options: {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: env.NEXT_PUBLIC_APP_URL.startsWith('https://'),
            maxAge: 400 * 24 * 60 * 60,
          },
        })),
        incoming,
      );
      if (
        clean.some(
          (cookie) => cookie.value !== incoming.find((old) => old.name === cookie.name)?.value,
        )
      ) {
        for (const { name, value, options } of clean) {
          if (options.maxAge === 0) request.cookies.delete(name);
          else request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      }
    } catch {
      // The Auth client below rejects/clears malformed sessions; never trust their contents.
    }
  }
  function signInRedirect() {
    const url = new URL('/login', env.NEXT_PUBLIC_APP_URL);
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set('Cache-Control', 'private, no-store');
    return redirect;
  }

  const hasSession = request.cookies
    .getAll()
    .some((cookie) => isSessionCookie(cookie.name) && cookie.value);
  if (!hasSession) return privateRoute ? signInRedirect() : response;

  const db = createAuthClient(env, {
    getAll: () => request.cookies.getAll(),
    setAll(updates, headers) {
      for (const { name, value } of updates) request.cookies.set(name, value);
      const legacy = request.cookies
        .getAll()
        .filter((cookie) => isLegacyAuthCookie(cookie.name, env.NEXT_PUBLIC_SUPABASE_URL));
      for (const cookie of legacy) request.cookies.delete(cookie.name);
      const next = NextResponse.next({ request });
      for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
      for (const cookie of legacy) {
        next.cookies.set(cookie.name, '', {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: env.NEXT_PUBLIC_APP_URL.startsWith('https://'),
          maxAge: 0,
        });
      }
      for (const { name, value, options } of updates) next.cookies.set(name, value, options);
      for (const [name, value] of Object.entries(headers)) cacheHeaders.set(name, value);
      for (const [name, value] of cacheHeaders) next.headers.set(name, value);
      response = next;
    },
  });
  const { data, error } = await db.auth.getClaims();
  // A provider outage keeps the session in place; the page renders its error state.
  if (
    privateRoute &&
    !data?.claims &&
    (!error ||
      error.name === 'AuthSessionMissingError' ||
      [400, 401, 403].includes(error.status ?? 0))
  ) {
    return signInRedirect();
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

// Refresh public signed-in pages too, so tokens never rotate in a read-only render.
export const config = {
  matcher: ['/', '/login', '/select-server', '/app/:path*', '/admin/:path*'],
};
