import type { TripSyncPayload } from '@nagi/database';
import { tripSyncBatchSchema } from '@nagi/shared';
import { TripMutationError } from './mutation-queue';

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
    const result = await response.json().catch(() => ({}));
    throw new TripMutationError(
      response.status === 401 || response.status === 403 || response.status === 404
        ? 'forbidden'
        : response.status === 409
          ? 'conflict'
          : response.status >= 500 || response.status === 429
            ? 'temporary'
            : 'invalid',
      result.error ?? 'La modification n’a pas pu être enregistrée.',
    );
  }
  return response.json();
}
