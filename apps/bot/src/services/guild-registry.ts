import { Events, type Client, type Guild } from 'discord.js';
import { DiscordApi, DiscordGuildService, guildIcon } from '@nagi/discord';
import type { Json, NagiDatabase } from '@nagi/database';
import { errorDetails, log } from '../utils/logger';

/** Serialize inventory and gateway events so a later removal wins over an in-flight inventory. */
export function startGuildRegistry(
  client: Client,
  db: NagiDatabase,
  applicationId: string,
  token: string,
) {
  const guilds = new DiscordGuildService(new DiscordApi(), applicationId);
  let stopped = false;
  let queue = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    if (stopped) return;
    queue = queue.then(work).catch((error) => log('guilds.sync.failed', errorDetails(error)));
  };
  const reconcile = () =>
    enqueue(async () => {
      const all = await guilds.list(token, 'Bot');
      const { error } = await db.rpc('reconcile_discord_guilds', {
        p_application_id: applicationId,
        p_guilds: all as unknown as Json,
      });
      if (error) throw error;
      log('guilds.synced', { count: all.length });
    });
  const presence = (guild: Guild, present: boolean) =>
    enqueue(async () => {
      const { error } = await db.rpc('set_discord_guild_presence', {
        p_application_id: applicationId,
        p_present: present,
        p_guild: {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          icon_url: guildIcon(guild.id, guild.icon),
        },
      });
      if (error) throw error;
    });
  const joined = (guild: Guild) => presence(guild, true);
  // Discord.js emits GuildUnavailable separately for temporary outages.
  const removed = (guild: Guild) => presence(guild, false);
  const updated = (_before: Guild, guild: Guild) => presence(guild, true);
  client.on(Events.GuildCreate, joined);
  client.on(Events.GuildDelete, removed);
  client.on(Events.GuildUpdate, updated);
  const interval = setInterval(reconcile, 60000);
  interval.unref();
  reconcile();
  return {
    async stop() {
      stopped = true;
      clearInterval(interval);
      client.off(Events.GuildCreate, joined);
      client.off(Events.GuildDelete, removed);
      client.off(Events.GuildUpdate, updated);
      await queue;
    },
  };
}
