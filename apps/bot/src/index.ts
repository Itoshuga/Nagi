import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { configureOwners, createServiceDatabase, requestSync } from '@nagi/database';
import { commandScope } from '@nagi/shared';
import { getBotEnv } from './config/env';
import { loadCommands } from './handlers/load-commands';
import { createDiscordRegistryApi } from './handlers/sync-commands';
import { handleInteraction } from './handlers/interaction';
import { startSyncWorker } from './services/sync-worker';
import { startGuildRegistry } from './services/guild-registry';
import { errorDetails, log } from './utils/logger';
import type { NagiCommand } from './types/command';

async function main() {
  const env = getBotEnv();
  const scope = commandScope(env);
  const db = createServiceDatabase(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const directory = fileURLToPath(new URL('./commands/', import.meta.url));
  let registry: ReadonlyMap<string, NagiCommand> = (await loadCommands(directory)).enabled;
  await configureOwners(db, env.NAGI_OWNER_DISCORD_IDS);
  await requestSync(db, env.DISCORD_APPLICATION_ID, scope, 'bot-startup');
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const shutdownSignal = new AbortController();
  let worker: ReturnType<typeof startSyncWorker> | undefined = undefined;
  let guildRegistry: ReturnType<typeof startGuildRegistry> | undefined;
  let stopping = false;
  async function shutdown(exitCode: number) {
    if (stopping) return;
    stopping = true;
    shutdownSignal.abort();
    client.destroy();
    if (guildRegistry) await guildRegistry.stop();
    if (worker) await worker.stop();
    process.exitCode = exitCode;
    log('bot.stopped', { scope, exitCode });
  }
  process.once('SIGINT', () => {
    void shutdown(0);
  });
  process.once('SIGTERM', () => {
    void shutdown(0);
  });
  const instance = randomUUID();
  let token: string | null = null;
  while (!token && !shutdownSignal.signal.aborted) {
    const { data, error } = await db.rpc('acquire_bot_lease', {
      p_application_id: env.DISCORD_APPLICATION_ID,
      p_scope: scope,
      p_instance: instance,
    });
    if (error) throw new Error('Impossible d’obtenir le verrou Supabase.', { cause: error });
    token = data;
    if (!token) {
      log('lease.waiting', { scope });
      await delay(10000, undefined, { signal: shutdownSignal.signal }).catch(() => undefined);
    }
  }
  if (!token || shutdownSignal.signal.aborted) {
    if (token) {
      await db.rpc('release_bot_lease', {
        p_application_id: env.DISCORD_APPLICATION_ID,
        p_scope: scope,
        p_token: token,
      });
    }
    return;
  }
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const interactionScope = interaction.commandGuildId
      ? `guild:${interaction.commandGuildId}`
      : 'global';
    if (interactionScope !== scope) return;
    void handleInteraction(
      interaction,
      registry,
      { client, db, applicationId: env.DISCORD_APPLICATION_ID, scope },
      env.NAGI_OWNER_DISCORD_IDS,
    ).catch((error) => log('interaction.ack.failed', errorDetails(error)));
  });
  client.once(Events.ClientReady, (ready) => {
    if (ready.application.id !== env.DISCORD_APPLICATION_ID) {
      log('application.mismatch');
      void shutdown(1);
      return;
    }
    log('bot.ready', { applicationId: env.DISCORD_APPLICATION_ID, scope, commands: registry.size });
    guildRegistry = startGuildRegistry(
      client,
      db,
      env.DISCORD_APPLICATION_ID,
      env.DISCORD_BOT_TOKEN,
    );
  });
  client.on(Events.Error, (error) => log('discord.error', errorDetails(error)));
  client.on(Events.ShardDisconnect, () => log('discord.disconnected'));
  client.on(Events.ShardReconnecting, () => log('discord.reconnecting'));
  worker = startSyncWorker({
    db,
    client,
    applicationId: env.DISCORD_APPLICATION_ID,
    scope,
    token,
    directory,
    api: createDiscordRegistryApi(env.DISCORD_APPLICATION_ID, env.DISCORD_BOT_TOKEN),
    onRegistry: (next) => {
      registry = next.enabled;
    },
    onLeaseLost: () => {
      void shutdown(1);
    },
  });
  try {
    await client.login(env.DISCORD_BOT_TOKEN);
  } catch (error) {
    log('discord.login.failed', errorDetails(error));
    await shutdown(1);
  }
}
main().catch((error) => {
  // Validation messages contain field names only, no supplied configuration values.
  if (error instanceof Error && error.message.startsWith('Configuration Nagi'))
    console.error(error.message);
  else log('startup.failed', errorDetails(error));
  process.exitCode = 1;
});
