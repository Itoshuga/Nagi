import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  guild: vi.fn(),
  get: vi.fn(),
  services: vi.fn(),
  catalog: vi.fn(),
  search: vi.fn(),
  nearby: vi.fn(),
  detail: vi.fn(),
  fields: vi.fn(),
  relations: vi.fn(),
  locations: vi.fn(),
}));
vi.mock('@/features/spaces/server', () => ({
  requireGuild: mocks.guild,
  spaceServices: mocks.services,
}));
vi.mock('@/lib/supabase/server', () => ({ publicCatalogDatabase: mocks.catalog }));
vi.mock('../packages/database/src/index', () => ({
  searchTripPlaces: mocks.search,
  tripCatalogDurations: async (_db: unknown, rows: unknown[]) => rows,
  nearbyTripPlaces: mocks.nearby,
  findCatalogEntry: mocks.detail,
  listCategoryFields: mocks.fields,
  listEntryRelations: mocks.relations,
  searchCatalogLocations: mocks.locations,
}));
const { GET } = await import('../apps/web/src/app/(app)/app/[guildId]/trips/[tripId]/places/route');
const trip = '11111111-1111-4111-8111-111111111111',
  entry = '22222222-2222-4222-8222-222222222222',
  guild = '444444444444444444',
  db = { fixture: true };
const context = { params: Promise.resolve({ guildId: guild, tripId: trip }) };
const request = (params: Record<string, string>, signal?: AbortSignal) =>
  new Request(
    `https://nagi.test/app/${guild}/trips/${trip}/places?${new URLSearchParams(params)}`,
    { signal },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guild.mockResolvedValue({});
  mocks.get.mockResolvedValue({ destination_country_id: 'jp' });
  mocks.services.mockResolvedValue({ trips: { get: mocks.get } });
  mocks.catalog.mockReturnValue(db);
  mocks.search.mockResolvedValue({ rows: [], hasMore: false });
  mocks.nearby.mockResolvedValue({ rows: [], hasMore: false });
});
describe('Guild-scoped travel catalogue endpoint', () => {
  it('checks the Discord space before reading any trip or catalogue', async () => {
    mocks.guild.mockRejectedValue(new Error('no access'));
    await expect(GET(request({ q: 'Tokyo' }), context)).rejects.toThrow('no access');
    expect(mocks.services).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
  it('checks the trip within the requested guild before accessing public catalogue data', async () => {
    mocks.get.mockResolvedValue(null);
    expect((await GET(request({ q: 'Tokyo' }), context)).status).toBe(404);
    expect(mocks.get).toHaveBeenCalledWith(guild, trip);
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
  it('does not reload trip steps for ordinary catalogue search and propagates cancellation', async () => {
    const req = request({ q: 'Café', page: '1' });
    const r = await GET(req, context);
    expect(r.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ q: 'Café', page: 1 }),
      { country: 'jp', entries: [] },
      req.signal,
    );
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('only searches a bounded valid map viewport, including the date line', async () => {
    const req = request({ mode: 'nearby', south: '-10', north: '10', west: '179', east: '-179' });
    expect((await GET(req, context)).status).toBe(200);
    expect(mocks.nearby).toHaveBeenCalledWith(
      db,
      { south: -10, north: 10, west: 179, east: -179 },
      req.signal,
    );
    expect(
      (
        await GET(
          request({ mode: 'nearby', south: '10', north: '-10', west: '1', east: '2' }),
          context,
        )
      ).status,
    ).toBe(400);
  });
  it('uses only the requested activity in this trip for contextual stop suggestions', async () => {
    const activityId = '77777777-7777-4777-8777-777777777777';
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { entry_id: entry }, error: null }),
    };
    const from = vi.fn().mockReturnValue(query);
    mocks.services.mockResolvedValue({ trips: { get: mocks.get }, db: { from } });
    const req = request({ activity: activityId });
    expect((await GET(req, context)).status).toBe(200);
    expect(from).toHaveBeenCalledExactlyOnceWith('trip_items');
    expect(query.eq.mock.calls).toEqual([
      ['trip_id', trip],
      ['id', activityId],
    ]);
    expect(query.abortSignal).toHaveBeenCalledWith(req.signal);
    expect(mocks.search).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ activity: activityId }),
      { country: 'jp', entries: [entry] },
      req.signal,
    );
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mocks.search.mockClear();
    expect((await GET(req, context)).status).toBe(404);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('rejects a malformed activity identifier before querying the trip', async () => {
    expect((await GET(request({ activity: 'foreign-or-invalid' }), context)).status).toBe(400);
    expect(mocks.services).not.toHaveBeenCalled();
  });
  it('does not disclose unavailable catalogue entries', async () => {
    mocks.detail.mockResolvedValue(null);
    expect((await GET(request({ mode: 'detail', entry }), context)).status).toBe(404);
    expect(mocks.relations).not.toHaveBeenCalled();
  });
  it('never leaks database failures through the search response', async () => {
    mocks.search.mockRejectedValue(new Error('secret database detail'));
    const r = await GET(request({ q: 'Tokyo' }), context);
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain('secret database detail');
  });
});
