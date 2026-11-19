'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { snowflakeSchema } from '@nagi/shared';
import { DiscordConnectionError } from '@nagi/discord';
import { requireGuild, discoverSpaces, spaceServices } from './server';

export type FormState = { error: string };
export async function selectGuild(_previous: FormState, form: FormData): Promise<FormState> {
  const guildId = snowflakeSchema.safeParse(form.get('guildId'));
  if (!guildId.success) return { error: 'Choisissez un espace valide.' };
  const { viewer } = await requireGuild(guildId.data, 'read', true);
  try {
    await (await spaceServices()).preferences.select(viewer.id, guildId.data);
  } catch {
    return { error: 'Impossible de mémoriser cet espace. Réessayez.' };
  }
  revalidatePath('/app', 'layout');
  redirect(`/app/${guildId.data}`);
}
export async function setDefaultGuild(form: FormData) {
  const guildId = snowflakeSchema.parse(form.get('guildId'));
  const { viewer } = await requireGuild(guildId, 'read', true);
  await (await spaceServices()).preferences.select(viewer.id, guildId, true);
  revalidatePath('/app', 'layout');
  redirect(`/app/${guildId}/settings?saved=default`);
}
export async function refreshSpaces(): Promise<void> {
  try {
    await discoverSpaces(true);
  } catch (error) {
    if (error instanceof DiscordConnectionError && error.reason === 'reconnect')
      redirect('/login?error=discord&next=/select-server');
    redirect('/select-server?notice=retry');
  }
  revalidatePath('/select-server');
  revalidatePath('/app', 'layout');
  redirect('/select-server');
}
export async function saveGuildSettings(
  guildId: string,
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  await requireGuild(guildId, 'manage', true);
  const { db } = await spaceServices();
  const { error } = await db
    .from('discord_guilds')
    .update({ members_can_create_trips: form.get('members_can_create_trips') === 'on' })
    .eq('id', guildId);
  if (error) return { error: 'Impossible d’enregistrer les paramètres.' };
  revalidatePath(`/app/${guildId}`, 'layout');
  redirect(`/app/${guildId}/settings?saved=settings#space-permissions`);
}
