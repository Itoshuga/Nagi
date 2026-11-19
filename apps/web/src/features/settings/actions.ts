'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { snowflakeSchema } from '@nagi/shared';
import { requireViewer } from '@/features/auth/session';
import { requireGuild, spaceServices } from '@/features/spaces/server';
import { cleanProfileBanners } from '@/features/profiles/banner';
import { serviceDatabase, sessionDatabase } from '@/lib/supabase/server';
import { isLegacyAuthCookie, isSessionCookie } from '@/lib/supabase/auth';
import { publicEnv } from '@/lib/env';

export type SettingsState = { error: string; message?: string };

export async function saveDefaultSpace(
  _state: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const id = snowflakeSchema.safeParse(form.get('guildId'));
  if (!id.success) return { error: 'Choisissez un espace.' };
  const { viewer } = await requireGuild(id.data, 'read', true);
  try {
    await (await spaceServices()).preferences.select(viewer.id, id.data, true);
  } catch {
    return { error: 'Impossible d’enregistrer votre espace par défaut. Réessayez.' };
  }
  revalidatePath('/app', 'layout');
  return { error: '', message: 'Votre espace par défaut a été enregistré.' };
}

export async function signOutOtherSessions(_state: SettingsState): Promise<SettingsState> {
  await requireViewer();
  try {
    const { error } = await (await sessionDatabase(true)).auth.signOut({ scope: 'others' });
    if (!error) return { error: '', message: 'Les autres appareils ont été déconnectés de Nagi.' };
  } catch {
    /* Return retryable feedback below. */
  }
  return { error: 'Impossible de déconnecter les autres appareils. Réessayez.' };
}

export async function deleteAccount(
  expectedUserId: string,
  _state: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const viewer = await requireViewer();
  if (viewer.id !== expectedUserId)
    return { error: 'Le compte connecté a changé. Rechargez cette page avant de réessayer.' };
  if (form.get('confirmation') !== 'SUPPRIMER' || form.get('understood') !== 'yes')
    return {
      error: 'Saisissez SUPPRIMER et confirmez la suppression définitive de votre compte Nagi.',
    };
  try {
    const session = await sessionDatabase(true);
    const { data, error } = await session.auth.getUser();
    if (error || data.user?.id !== viewer.id)
      return { error: 'Reconnectez-vous à votre compte avant de le supprimer.' };
    const admin = serviceDatabase();
    const ready = await admin.rpc('account_deletion_ready');
    if (ready.error || ready.data !== true)
      return {
        error: 'La suppression du compte est momentanément indisponible. Réessayez plus tard.',
      };
    const { data: current } = await session.auth.getSession();
    if (!current.session?.access_token)
      return { error: 'Votre session a expiré. Reconnectez-vous avant de réessayer.' };
    const revoked = await admin.auth.admin.signOut(current.session.access_token, 'global');
    if (revoked.error) return { error: 'Impossible de fermer vos sessions. Réessayez.' };
    const removed = await admin.auth.admin.deleteUser(viewer.id);
    if (removed.error)
      return { error: 'La suppression a échoué. Reconnectez-vous puis réessayez.' };
  } catch {
    return { error: 'La suppression n’a pas abouti. Reconnectez-vous puis réessayez.' };
  }
  const store = await cookies();
  const env = publicEnv();
  for (const cookie of store.getAll()) {
    if (
      isSessionCookie(cookie.name) ||
      isLegacyAuthCookie(cookie.name, env.NEXT_PUBLIC_SUPABASE_URL)
    )
      store.set(cookie.name, '', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NEXT_PUBLIC_APP_URL.startsWith('https://'),
        maxAge: 0,
      });
  }
  after(cleanProfileBanners);
  redirect('/login?notice=account-deleted');
}
