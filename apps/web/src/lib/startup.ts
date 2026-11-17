import 'server-only';
import { configureOwners, requestSync } from '@nagi/database';
import { commandScope } from '@nagi/shared';
import { serverEnv } from './env';
import { serviceDatabase } from './supabase/server';
let startup: Promise<void> | undefined;
export function ensureBackendStartup(): Promise<void> {
  if (!startup) {
    startup = (async () => {
      const env = serverEnv();
      const db = serviceDatabase();
      await configureOwners(db, env.NAGI_OWNER_DISCORD_IDS);
      await requestSync(db, env.DISCORD_APPLICATION_ID, commandScope(env), 'web-startup');
    })().catch((error) => {
      startup = undefined;
      throw error;
    });
  }
  return startup;
}
