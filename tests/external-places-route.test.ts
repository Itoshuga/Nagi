import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  read: vi.fn(),
  reserve: vi.fn(),
  verify: vi.fn(),
  coordinates: vi.fn(),
  search: vi.fn(),
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
vi.mock('@/features/integrations/google-places/config', () => ({
  googlePlacesConfig: () => ({
    enabled: true,
    configured: true,
    key: 'NEVER_EXPOSE_THIS',
    minCharacters: 3,
  }),
}));
vi.mock('@/features/integrations/google-places/server', () => ({
  reserveGooglePlaces: mocks.reserve,
  verifyGooglePlace: mocks.verify,
  googlePlaceCoordinates: mocks.coordinates,
  searchGooglePlaces: mocks.search,
  GooglePlacesError: class extends Error {
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
  id = 'google-place-example';
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
  mocks.eq.mockResolvedValue({ data: [{ google_place_id: id, stops: [] }], error: null });
  mocks.coordinates.mockResolvedValue({
    latitude: 35,
    longitude: 139,
    expiresAt: Date.now() + 600000,
  });
});
describe('Trip-scoped external places endpoint', () => {
  it('authorizes a bounded search before provider access and returns no-store IDs', async () => {
    mocks.search.mockResolvedValue({ ids: [id], timing: { providerMs: 10, serverMs: 20 } });
    const body = {
      operation: 'search',
      kind: 'autocomplete',
      query: '浅草寺',
      session: trip,
      type: '',
      context: { region: 'jp' },
    };
    const response = await POST(request(body), params);
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalled();
    expect(mocks.search).toHaveBeenCalledWith('actor', body, expect.any(AbortSignal));
    expect(await response.json()).toMatchObject({ ids: [id] });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('does not complete a Google search session for a read-only member', async () => {
    mocks.read.mockResolvedValue({ can_edit: false });
    expect(
      (await POST(request({ operation: 'selection', placeId: id, session: trip }), params)).status,
    ).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('checks session, Discord and trip before reporting availability, without exposing secrets', async () => {
    const response = await GET(new Request(url), params);
    expect(mocks.session).toHaveBeenCalledWith(guild);
    expect(mocks.read).toHaveBeenCalledWith(guild, trip, 2147483647);
    expect(await response.json()).toMatchObject({ available: true, billingRegion: 'EEA' });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('refuses cross-origin requests before touching authorization or Google', async () => {
    expect(
      (await POST(request({ operation: 'ui', kind: 'ui_search' }, 'https://evil.test'), params))
        .status,
    ).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it('never calls the provider after a revoked session', async () => {
    mocks.session.mockRejectedValue(new Error('revoked'));
    expect((await POST(request({ operation: 'ui', kind: 'ui_search' }), params)).status).toBe(403);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it('does not offer a generic proxy or allow arbitrary names or coordinates payloads', async () => {
    for (const body of [
      { operation: 'proxy', url: 'https://evil.test' },
      { operation: 'ui', kind: 'ui_search', query: 'DO_NOT_PERSIST' },
      { operation: 'coordinates', ids: Array(31).fill(id) },
    ])
      expect((await POST(request(body), params)).status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.coordinates).not.toHaveBeenCalled();
  });
  it('refuses IDs outside the authorized trip before any Google request', async () => {
    expect(
      (await POST(request({ operation: 'coordinates', ids: ['foreign-google-place'] }), params))
        .status,
    ).toBe(403);
    expect(mocks.eq).toHaveBeenCalledWith('trip_id', trip);
    expect(mocks.coordinates).not.toHaveBeenCalled();
  });
  it('deduplicates known occurrence references and returns private live coordinates', async () => {
    const response = await POST(request({ operation: 'coordinates', ids: [id, id] }), params);
    expect(response.status).toBe(200);
    expect(mocks.coordinates).toHaveBeenCalledExactlyOnceWith('actor', id);
    expect(await response.json()).toMatchObject({
      points: { [id]: { latitude: 35, longitude: 139 } },
    });
  });
  it('does not allow viewers to verify insertion references', async () => {
    mocks.read.mockResolvedValue({ can_edit: false });
    expect((await POST(request({ operation: 'verify', placeId: id }), params)).status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
