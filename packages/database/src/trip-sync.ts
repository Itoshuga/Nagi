import { tripSyncBatchSchema, type TripMutationRequest, type TripSyncBatch } from '@nagi/shared';
import type { NagiDatabase } from './client';
import type { Json } from './database.types';
import { catalogEntriesById } from './catalog';
import { tripCatalogLinks } from './trip-catalog';
import type { EntryCardRow } from './catalog';
import type { TripPlan } from './collaboration';

export type TripSyncPayload = TripSyncBatch & {
  entries: EntryCardRow[];
  connections: TripPlan['connections'];
  people?: TripPlan['people'];
};
export class TripSyncService {
  constructor(private readonly db: NagiDatabase) {}
  async read(guild: string, trip: string, after: number) {
    const result = await this.db.rpc('read_trip_changes', {
      p_guild: guild,
      p_trip: trip,
      p_after: after,
    });
    if (result.error)
      throw new Error('Impossible de synchroniser le voyage.', { cause: result.error });
    return tripSyncBatchSchema.parse(result.data);
  }
  async mutate(guild: string, trip: string, request: TripMutationRequest) {
    const result = await this.db.rpc('mutate_trip_plan', {
      p_guild: guild,
      p_trip: trip,
      p_request: request as unknown as Json,
    });
    if (result.error)
      throw new Error('Impossible d’enregistrer la modification.', { cause: result.error });
    return tripSyncBatchSchema.parse(result.data);
  }
}
export async function enrichTripChanges(
  batch: TripSyncBatch,
  catalog: NagiDatabase,
  db?: NagiDatabase,
): Promise<TripSyncPayload> {
  const ids = [...new Set(batch.events.flatMap((event) => event.entry_ids))];
  if (
    !ids.length &&
    !batch.events.some(
      (event) => event.changes.items.upsert.length || event.changes.stops.upsert.length,
    )
  )
    return { ...batch, entries: [], connections: [] };
  const [entries, connections, contributors] = await Promise.all([
    catalogEntriesById(catalog, ids),
    tripCatalogLinks(catalog, ids),
    db?.rpc('trip_contributor_cards', { p_trip: batch.events[0]!.trip_id }),
  ]);
  if (contributors?.error) throw new Error('Impossible de charger les auteurs du voyage.');
  return {
    ...batch,
    entries: [...entries.values()],
    connections,
    ...(contributors && { people: contributors.data as TripPlan['people'] }),
  };
}
