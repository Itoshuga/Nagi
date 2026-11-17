import 'server-only';
import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import {
  DiscordApi,
  DiscordGuildService,
  DiscordTokenService,
  GuildMembershipService,
  TokenCipher,
  DiscordConnectionError,
} from '@nagi/discord';
import { GuildPreferencesService, TripService, CatalogAccessService } from '@nagi/database';
import { snowflakeSchema } from '@nagi/shared';
import { hasGuildAdministration } from '@nagi/permissions';
import { requireViewer } from '@/features/auth/session';
import { discordEnv } from '@/lib/env';
import { serviceDatabase, sessionDatabase } from '@/lib/supabase/server';

export const discordServices = cache(() => {
  const env = discordEnv();
  const api = new DiscordApi();
  const db = serviceDatabase();
  const guilds = new DiscordGuildService(api, env.DISCORD_APPLICATION_ID);
  const tokens = new DiscordTokenService(
    db,
    api,
    new TokenCipher(env.NAGI_TOKEN_ENCRYPTION_KEY),
    env.DISCORD_APPLICATION_ID,
    env.DISCORD_CLIENT_SECRET,
  );
  const memberships = new GuildMembershipService(
    db,
    guilds,
    tokens,
    env.DISCORD_APPLICATION_ID,
    env.DISCORD_BOT_TOKEN,
  );
  return { tokens, memberships };
});
export const spaceServices = cache(async () => {
  const db = await sessionDatabase();
  return {
    db,
    preferences: new GuildPreferencesService(db),
    trips: new TripService(db),
    catalog: new CatalogAccessService(db),
  };
});
export const discoverSpaces = cache(async (fresh = false) => {
  const viewer = await requireViewer();
  const guilds = await discordServices().memberships.discover(viewer.id, fresh);
  const services = await spaceServices();
  const preferences = await services.preferences.get(viewer.id);
  return { viewer, guilds, preferences };
});
export const requireGuild = cache(
  async (guildId: string, operation: 'read' | 'create' | 'manage' = 'read', fresh = false) => {
    if (!snowflakeSchema.safeParse(guildId).success) notFound();
    let spaces: Awaited<ReturnType<typeof discoverSpaces>>;
    try {
      spaces = await discoverSpaces(fresh);
    } catch (error) {
      if (error instanceof DiscordConnectionError && error.reason === 'reconnect')
        redirect(`/login?error=discord&next=${encodeURIComponent(`/app/${guildId}`)}`);
      throw error;
    }
    const guild = spaces.guilds.find((guild) => guild.id === guildId);
    if (!guild) redirect('/select-server?notice=access');
    const isAdmin = hasGuildAdministration(guild.permissions, guild.owner);
    if (
      (operation === 'manage' && !isAdmin) ||
      (operation === 'create' && !isAdmin && !guild.members_can_create_trips)
    )
      redirect(`/app/${guildId}?notice=forbidden`);
    return { ...spaces, guild, isAdmin };
  },
);
export function botInstallUrl() {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: discordEnv().DISCORD_APPLICATION_ID,
    scope: 'bot applications.commands',
    permissions: '0',
    integration_type: '0',
  }).toString();
  return url.toString();
}
