'use server';
import { redirect } from 'next/navigation';
import { sessionDatabase } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';
import { safeNext } from '@nagi/shared';
export async function signIn(form: FormData) {
  const db = await sessionDatabase(true);
  const next = safeNext(String(form.get('next') ?? '/app'));
  const callback = new URL('/auth/callback', publicEnv().NEXT_PUBLIC_APP_URL);
  callback.searchParams.set('next', next);
  const { data, error } = await db.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: callback.toString(), scopes: 'identify email' },
  });
  if (error || !data.url) redirect('/login?error=oauth');
  redirect(data.url);
}
export async function signOut() {
  const db = await sessionDatabase(true);
  const { error } = await db.auth.signOut({ scope: 'local' });
  if (error) throw new Error('Déconnexion impossible. Veuillez réessayer.');
  redirect('/');
}
