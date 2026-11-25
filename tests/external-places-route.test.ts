import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  read: vi.fn(),
  search: vi.fn(),
  resolve: vi.fn(),
  details: vi.fn(),
  proof: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('@/features/trips/sync-server', () => ({
  tripRequestSession: mocks.session,
  tripRequestFailure: () => ({ status: 403, body: { error: 'Accès refusé' } }),
}));
vi.mock('../packages/database/src/index', () => ({
  TripSyncService: class {
    read = mocks.read;
  },
}));
vi.mock('@/lib/supabase/server', () => ({ serviceDatabase: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/features/integrations/mapbox/config', () => ({
  mapboxConfig: () => ({
    enabled: true,
    configured: true,
    mapConfigured: true,
    token: 'NEVER_EXPOSE_THIS',
    minCharacters: 3,
    photos: false,
  }),
}));
vi.mock('@/features/integrations/mapbox/proof', () => ({ readMapboxProof: mocks.proof }));
vi.mock('@/features/integrations/mapbox/server', () => ({
  searchMapbox: mocks.search,
  resolveMapbox: mocks.resolve,
  retrieveMapboxDetails: mocks.details,
  MapboxError: class extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super('Indisponible');
    }
  },
}));
const { GET, POST } =
  await import('../apps/web/src/app/(app)/app/[guildId]/trips/[tripId]/external/route');
const trip = '11111111-1111-4111-8111-111111111111',
  guild = '123456789012345678',
  id = 'mapbox-example',
  query = 'My search';
const params = { params: Promise.resolve({ tripId: trip, guildId: guild }) },
  url = `https://nagi.test/app/${guild}/trips/${trip}/external`;
const request = (data: unknown, origin = 'https://nagi.test') =>
  new Request(url, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ db: { from: mocks.from }, userId: 'actor' });
  mocks.read.mockResolvedValue({ can_edit: true });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }) });
  mocks.eq.mockResolvedValue({
    data: [{ external_place_id: id, external_query: query, stops: [] }],
    error: null,
  });
  mocks.resolve.mockResolvedValue({ id, title: 'Resolved' });
  mocks.details.mockResolvedValue({ id, title: 'Details' });
});
describe('Trip-scoped Mapbox endpoint', () => {
  it('bounds UTF-8 bytes before opening a session or spending provider credits', async () => {
    const response = await POST(request('日'.repeat(100000)), params);
    expect(response.status).toBe(413);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('checks trip access before bounded search, returning no-store native presentation', async () => {
    const body = {
      operation: 'search',
      kind: 'suggest',
      query,
      session: trip,
      category: '',
      context: { proximity: [139, 35] },
    };
    mocks.search.mockResolvedValue({
      places: [{ id, title: 'A place' }],
      timing: { providerMs: 10 },
    });
    const res = await POST(request(body), params);
    expect(res.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith('actor', trip, body, expect.any(AbortSignal));
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await res.json()).toMatchObject({ places: [{ id }] });
  });
  it('authorizes availability without exposing credentials', async () => {
    const res = await GET(new Request(url), params);
    expect(mocks.session).toHaveBeenCalledWith(guild);
    expect(mocks.read).toHaveBeenCalledWith(guild, trip, 2147483647);
    const body = await res.text();
    expect(body).toContain('"available":true');
    expect(body).not.toContain('NEVER_EXPOSE_THIS');
  });
  it('resolves saved references only within the authorized trip, including read-only members', async () => {
    mocks.read.mockResolvedValue({ can_edit: false });
    const res = await POST(request({ operation: 'resolve', placeId: id, query }), params);
    expect(res.status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith('trip_id', trip);
  });
  it('allows a signed search result bound to the member and trip without DB probing', async () => {
    mocks.proof.mockReturnValue({ kind: 'suggestion' });
    expect(
      (await POST(request({ operation: 'resolve', placeId: id, query, proof: 'signed' }), params))
        .status,
    ).toBe(200);
    expect(mocks.proof).toHaveBeenCalledWith('signed', 'actor', trip, id, query);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects a foreign reference or changed query before provider access', async () => {
    expect(
      (await POST(request({ operation: 'details', placeId: 'foreign', query }), params)).status,
    ).toBe(403);
    expect(
      (await POST(request({ operation: 'resolve', placeId: id, query: 'Changed' }), params)).status,
    ).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it('rejects cross-origin requests and revoked memberships before accessing Mapbox', async () => {
    expect(
      (
        await POST(
          request({ operation: 'resolve', placeId: id, query }, 'https://evil.test'),
          params,
        )
      ).status,
    ).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    mocks.session.mockRejectedValue(new Error('revoked'));
    expect((await POST(request({ operation: 'resolve', placeId: id, query }), params)).status).toBe(
      403,
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('does not expose a generic proxy or accept unbounded/provider-authored payloads', async () => {
    for (const body of [
      { operation: 'proxy', url: 'https://evil.test' },
      { operation: 'resolve', placeId: id, query, coordinates: [1, 2] },
      { operation: 'search', kind: 'suggest', query: 'x'.repeat(257), session: trip },
      { operation: 'search', kind: 'suggest', query, session: trip, context: { country: 'jp' } },
    ])
      expect((await POST(request(body), params)).status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
