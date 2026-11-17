import { setTimeout as delay } from 'node:timers/promises';
import type { Client } from 'discord.js';
import type { Json, NagiDatabase } from '@nagi/database';
import { loadCommands, type CommandRegistry } from '../handlers/load-commands';
import { synchronizeCommands, type DiscordRegistryApi } from '../handlers/sync-commands';
import { errorDetails, log } from '../utils/logger';

interface WorkerOptions {
  db: NagiDatabase;
  client: Client;
  applicationId: string;
  scope: string;
  token: string;
  directory: string;
  api: DiscordRegistryApi;
  onRegistry(registry: CommandRegistry): void;
  onLeaseLost(): void;
}
export function startSyncWorker(options: WorkerOptions) {
  const { db, client, applicationId, scope, token } = options;
  const controller = new AbortController();
  const args = { p_application_id: applicationId, p_scope: scope, p_token: token };
  let renewing = false;
  const heartbeat = setInterval(() => {
    void renew();
  }, 20000);
  async function renew() {
    if (renewing || controller.signal.aborted) return;
    renewing = true;
    try {
      const { data, error } = await db.rpc('renew_bot_lease', {
        ...args,
        p_connected: client.isReady(),
      });
      if (error || !data) throw new Error('LeaseLost');
    } catch (error) {
      log('lease.lost', { ...errorDetails(error), scope });
      controller.abort();
      options.onLeaseLost();
    } finally {
      renewing = false;
    }
  }
  async function tick() {
    if (!client.isReady()) return;
    const { data, error } = await db.rpc('claim_bot_sync', args);
    if (error) throw new Error('QueueClaimError', { cause: error });
    const request = data?.[0];
    if (!request) return;
    log('sync.started', { request: request.id, attempt: request.attempts, applicationId, scope });
    let stage = 'load';
    try {
      const registry = await loadCommands(options.directory);
      stage = 'discord';
      const result = await synchronizeCommands(options.api, scope, registry, controller.signal);
      controller.signal.throwIfAborted();
      options.onRegistry(registry);
      const commands: Json = [...registry.all.values()]
        .map((command) => ({
          name: command.name,
          description: command.description,
          category: command.category,
          isEnabled: command.isEnabled,
          isMaintenance: command.isMaintenance,
          adminOnly: command.adminOnly,
          ownerOnly: command.ownerOnly,
        }))
        .filter((command) => command.isEnabled);
      stage = 'persist';
      const { error: finishError } = await db.rpc('finish_bot_sync', {
        p_id: request.id,
        p_token: token,
        p_success: true,
        p_error: '',
        p_commands: commands,
      });
      if (finishError) throw new Error('QueueFinishError', { cause: finishError });
      log('sync.succeeded', { request: request.id, scope, ...result });
    } catch (error) {
      if (controller.signal.aborted) return;
      log('sync.failed', {
        request: request.id,
        scope,
        ...errorDetails(error),
        stage,
        attempt: request.attempts,
      });
      const { error: finishError } = await db.rpc('finish_bot_sync', {
        p_id: request.id,
        p_token: token,
        p_success: false,
        p_error:
          'La synchronisation a échoué. Consultez les journaux du bot ; une nouvelle tentative sera effectuée si possible.',
        p_commands: [],
      });
      if (finishError) throw new Error('QueueFinishError', { cause: finishError });
    }
  }
  const done = (async () => {
    await renew();
    while (!controller.signal.aborted) {
      try {
        await tick();
      } catch (error) {
        log('worker.failed', { ...errorDetails(error), scope });
      }
      await delay(3000, undefined, { signal: controller.signal }).catch(() => undefined);
    }
  })();
  return {
    async stop() {
      controller.abort();
      clearInterval(heartbeat);
      await done;
      const { error } = await db.rpc('release_bot_lease', args);
      if (error) log('lease.release.failed', { scope });
    },
  };
}
