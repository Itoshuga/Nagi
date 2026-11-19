import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NagiDatabase } from '../packages/database/src/client';

vi.mock('../packages/database/src/catalog', () => ({ catalogEntriesById: async () => new Map() }));
vi.mock('../packages/database/src/trip-catalog', () => ({ tripCatalogLinks: async () => [] }));
const { TripService } = await import('../packages/database/src/collaboration');
const read = vi.fn();
const select = vi.fn();
const snapshot = {
  id: 'trip',
  version: 1,
  days: [],
  organizers: [],
  items: [
    { id: 'activity', entry_id: 'entry', notes: 'Notes conservées', sort_order: 1024, stops: [] },
  ],
};
const db = {
  from: () => ({
    select: (columns: string) => {
      select(columns);
      const query = { eq: () => query, maybeSingle: read };
      return query;
    },
  }),
  rpc: async () => ({ data: [], error: null }),
} as unknown as NagiDatabase;

beforeEach(() => {
  vi.clearAllMocks();
  read.mockReset();
});

describe('Activity stops schema rollout', () => {
  it('loads nested stops normally when the new relationship is available', async () => {
    read.mockResolvedValue({ data: snapshot, error: null });
    const plan = await new TripService(db).plan('guild', 'trip', db);
    expect(plan?.stopsAvailable).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('keeps the original itinerary and notes available before migration without offering stop editing', async () => {
    const item = Object.fromEntries(
      Object.entries(snapshot.items[0]!).filter(([key]) => key !== 'stops'),
    );
    read.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST200', message: 'No relationship with trip_item_stops' },
    });
    read.mockResolvedValueOnce({ data: { ...snapshot, items: [item] }, error: null });
    const plan = await new TripService(db).plan('guild', 'trip', db);
    expect(plan?.stopsAvailable).toBe(false);
    expect(plan?.items[0]).toMatchObject({ id: 'activity', notes: 'Notes conservées', stops: [] });
    expect(select.mock.calls[1]?.[0]).not.toContain('trip_item_stops');
  });
  it('never masks a permissions failure with the legacy query', async () => {
    read.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'Permission denied on trip_item_stops' },
    });
    await expect(new TripService(db).plan('guild', 'trip', db)).rejects.toThrow('Impossible');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
