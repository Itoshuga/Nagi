import type { TripSyncPayload } from '@nagi/database';
import { tripSyncBatchSchema } from '@nagi/shared';
import { TripMutationError } from './mutation-queue';

/** A stalled connection must release its queue slot so the same mutation can retry. */
export async function tripRequest(url: string, init: RequestInit) {
  return tripResponse(
    await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.any([AbortSignal.timeout(30000), ...(init.signal ? [init.signal] : [])]),
    }),
  );
}

export function decodeTripBatch(value: unknown): TripSyncPayload {
  const parsed = tripSyncBatchSchema.parse(value);
  const extra = value as TripSyncPayload;
  if (!Array.isArray(extra.entries) || !Array.isArray(extra.connections))
    throw new Error('Synchronisation invalide.');
  return {
    ...parsed,
    entries: extra.entries,
    connections: extra.connections,
    ...(Array.isArray(extra.people) && { people: extra.people }),
  };
}
export async function tripResponse(response: Response) {
  if (response.redirected)
    throw new TripMutationError('forbidden', 'Reconnectez-vous pour retrouver ce voyage.');
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const result =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    throw new TripMutationError(
      result.reason === 'invalid'
        ? 'invalid'
        : response.status === 401 || response.status === 403 || response.status === 404
          ? 'forbidden'
          : response.status === 409
            ? 'conflict'
            : response.status >= 500 || response.status === 429
              ? 'temporary'
              : 'invalid',
      typeof result.error === 'string'
        ? result.error
        : 'La modification n’a pas pu être enregistrée.',
    );
  }
  return response.json();
}
