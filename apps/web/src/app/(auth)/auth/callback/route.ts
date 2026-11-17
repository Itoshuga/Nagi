import { NextResponse, type NextRequest } from 'next/server';
import { describeError, safeNext } from '@nagi/shared';
import { sessionDatabase } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';
import { ensureBackendStartup } from '@/lib/startup';
import { discordServices } from '@/features/spaces/server';

export async function GET(request: NextRequest) {
  const origin = publicEnv().NEXT_PUBLIC_APP_URL;
  function go(path: string) {
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  const code = request.nextUrl.searchParams.get('code');
  if (!code || request.nextUrl.searchParams.has('error')) return go('/login?error=oauth');
  const db = await sessionDatabase(true);
  try {
    await ensureBackendStartup();
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.user?.identities?.some((identity) => identity.provider === 'discord')) {
      throw new Error('Une identité Discord vérifiée est requise.');
    }
    const { data: profile, error: profileError } = await db.rpc('sync_discord_profile');
    if (profileError) throw profileError;
    if (!data.session?.provider_token || !profile) throw new Error('Autorisation Discord requise.');
    await discordServices().tokens.capture(
      data.user.id,
      profile.discord_id,
      data.session.provider_token,
      data.session.provider_refresh_token ?? null,
    );
    return go(safeNext(request.nextUrl.searchParams.get('next')));
  } catch (error) {
    console.error(
      JSON.stringify({
        service: 'nagi-web',
        event: 'oauth.failed',
        ...describeError(error, process.env),
      }),
    );
    await db.auth.signOut({ scope: 'local' });
    return go('/login?error=callback');
  }
}
