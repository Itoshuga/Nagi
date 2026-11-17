import { z } from 'zod';
import { discordGuildSchema, type DiscordGuild } from '@nagi/shared';
import { hasGuildAdministration } from '@nagi/permissions';
import type { Json, NagiDatabase } from '@nagi/database';
import { DiscordConnectionError, DiscordGuildService } from './api';
import type { DiscordTokenService } from './vault';

const snapshotSchema = z.object({
  verified_at: z.string(),
  bot_verified_at: z.string().nullable(),
  guilds: z.array(
    discordGuildSchema.extend({
      icon_url: z.string().nullable(),
      members_can_create_trips: z.boolean(),
    }),
  ),
});
export class GuildMembershipService {
  constructor(
    private readonly db: NagiDatabase,
    private readonly guilds: DiscordGuildService,
    private readonly tokens: DiscordTokenService,
    private readonly applicationId: string,
    private readonly botToken: string,
  ) {}
  async discover(userId: string, fresh = false): Promise<DiscordGuild[]> {
    if (!fresh) {
      const cached = await this.db.rpc('read_discord_guild_snapshot', {
        p_user_id: userId,
        p_application_id: this.applicationId,
      });
      if (cached.error)
        throw new Error('Impossible de charger vos espaces.', { cause: cached.error });
      if (cached.data) {
        const snapshot = snapshotSchema.parse(cached.data);
        if (
          Date.now() - Date.parse(snapshot.verified_at) < 30000 &&
          snapshot.bot_verified_at &&
          Date.now() - Date.parse(snapshot.bot_verified_at) < 90000
        )
          return snapshot.guilds;
      }
    }
    const access = await this.tokens.accessToken(userId);
    const [botGuilds, userGuilds] = await Promise.all([
      this.guilds.list(this.botToken, 'Bot'),
      (async () => {
        try {
          return await this.guilds.list(access, 'Bearer');
        } catch (error) {
          if (!(error instanceof DiscordConnectionError) || error.reason !== 'reconnect')
            throw error;
          return this.guilds.list(await this.tokens.accessToken(userId, true), 'Bearer');
        }
      })(),
    ]);
    const registry = await this.db.rpc('reconcile_discord_guilds', {
      p_application_id: this.applicationId,
      p_guilds: botGuilds as unknown as Json,
    });
    if (registry.error)
      throw new Error('Impossible de vérifier la présence de Nagi.', { cause: registry.error });
    const saved = await this.db.rpc('record_discord_memberships', {
      p_user_id: userId,
      p_application_id: this.applicationId,
      p_guilds: userGuilds as unknown as Json,
    });
    if (saved.error)
      throw new Error('Impossible de vérifier votre appartenance aux espaces.', {
        cause: saved.error,
      });
    // Settings are database-owned, not values from Discord or the browser.
    const snapshot = await this.db.rpc('read_discord_guild_snapshot', {
      p_user_id: userId,
      p_application_id: this.applicationId,
    });
    if (snapshot.error || !snapshot.data)
      throw new Error('Impossible de charger vos espaces vérifiés.');
    return snapshotSchema.parse(snapshot.data).guilds;
  }
  async authorize(
    userId: string,
    guildId: string,
    operation: 'read' | 'create' | 'manage' = 'read',
    fresh = false,
  ) {
    const guild = (await this.discover(userId, fresh)).find((guild) => guild.id === guildId);
    if (!guild) throw new DiscordConnectionError('forbidden');
    const isAdmin = hasGuildAdministration(guild.permissions, guild.owner);
    if (
      (operation === 'manage' && !isAdmin) ||
      (operation === 'create' && !isAdmin && !guild.members_can_create_trips)
    )
      throw new DiscordConnectionError('forbidden');
    return { guild, isAdmin };
  }
}
