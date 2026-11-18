import type { NagiDatabase } from '@nagi/database';

export const databaseProbeTimeoutMs = 2500;
export type DatabaseHealth = { ok: boolean; latencyMs: number; timedOut: boolean };

/** A real, bounded read through Supabase/PostgREST; no profile or content is returned. */
export async function checkDatabase(
  db: NagiDatabase,
  applicationId: string,
  scope: string,
  timeoutMs = databaseProbeTimeoutMs,
): Promise<DatabaseHealth> {
  const started = performance.now();
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const { error } = await db
      .from('bot_runtime')
      .select('application_id')
      .eq('application_id', applicationId)
      .eq('scope', scope)
      .limit(1)
      .abortSignal(signal);
    return {
      ok: !error && !signal.aborted,
      latencyMs: performance.now() - started,
      timedOut: signal.aborted,
    };
  } catch {
    return { ok: false, latencyMs: performance.now() - started, timedOut: signal.aborted };
  }
}

export function milliseconds(value: number | null | undefined, unavailable = 'Non mesurée') {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${Math.round(value)}ms`
    : unavailable;
}
