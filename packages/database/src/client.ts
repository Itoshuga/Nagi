import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type NagiDatabase = SupabaseClient<Database>;
/** Bounded requests are essential: a stalled heartbeat must fail before its lease expires. */
export const timedFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(10000);
  const signal = init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout;
  return fetch(input, { ...init, signal });
};
/** Backend only. Callers must never import a service key into a client component. */
export function createServiceDatabase(url: string, key: string): NagiDatabase {
  return createClient<Database>(url, key, {
    global: { fetch: timedFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
