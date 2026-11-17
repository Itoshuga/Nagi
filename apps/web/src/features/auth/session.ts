import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { isAdmin, resolveRole } from '@nagi/permissions';
import { sessionDatabase } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { ensureBackendStartup } from '@/lib/startup';
import { isSessionCookie } from '@/lib/supabase/auth';

export const getViewer = cache(async () => {
  // Ignore cookies from Kitsu and other localhost projects. Claims are verified by Supabase.
  const store = await cookies();
  if (!store.getAll().some((cookie) => isSessionCookie(cookie.name) && cookie.value)) return null;
  const db = await sessionDatabase();
  const { data, error } = await db.auth.getClaims();
  if (
    error &&
    error.name !== 'AuthSessionMissingError' &&
    ![400, 401, 403].includes(error.status ?? 0)
  ) {
    throw new Error('Impossible de vérifier votre session pour le moment.', { cause: error });
  }
  if (!data?.claims.sub) return null;
  await ensureBackendStartup();
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('*')
    .eq('id', data.claims.sub)
    .maybeSingle();
  if (profileError) throw new Error('Impossible de charger votre profil.');
  if (!profile) return null;
  const role = resolveRole(profile.discord_id, profile.role, serverEnv().NAGI_OWNER_DISCORD_IDS);
  return { ...profile, role };
});
export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  return viewer;
}
export async function requireAdmin() {
  const viewer = await requireViewer();
  if (!isAdmin(viewer.role)) redirect('/app?notice=forbidden');
  return viewer;
}
