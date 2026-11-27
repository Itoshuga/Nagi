import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripPlan } from '../packages/database/src/collaboration';
import { tripMapVisits, visibleTripItems } from '../apps/web/src/features/trips/planner-model';
import { dayRouteKey, prepareDayRoute } from '../apps/web/src/features/trips/map-route-model';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  access: vi.fn(),
  plan: vi.fn(),
  directions: vi.fn(),
}));
vi.mock('@/features/trips/sync-server', () => ({
  tripRequestSession: mocks.session,
  tripRequestFailure: (e: { status?: number }) => ({
    status: e.status ?? 503,
    body: { error: 'Accès refusé' },
  }),
}));
vi.mock('../packages/database/src/index', () => ({
  TripService: class {
    plan = mocks.plan;
  },
  TripSyncService: class {
    read = mocks.access;
  },
}));
vi.mock('@/lib/supabase/server', () => ({ publicCatalogDatabase: () => ({}) }));
vi.mock('@/features/integrations/mapbox/directions', () => ({
  directionsForDay: mocks.directions,
}));
const { POST } =
  await import('../apps/web/src/app/(app)/app/[guildId]/trips/[tripId]/directions/route');
const { issueMapboxProof } = await import('../apps/web/src/features/integrations/mapbox/proof');
const actor = '11111111-1111-4111-8111-111111111111',
  trip = '22222222-2222-4222-8222-222222222222',
  day = '33333333-3333-4333-8333-333333333333',
  item = '44444444-4444-4444-8444-444444444444',
  guild = '123456789012345678';
const params = { params: Promise.resolve({ guildId: guild, tripId: trip }) };
const url = `https://nagi.test/app/${guild}/trips/${trip}/directions`;
let plan: TripPlan;
function input() {
  const route = prepareDayRoute(tripMapVisits(visibleTripItems(plan, day)), new Map());
  return { day, key: dayRouteKey(day, 'cycling', route), places: [] };
}
const request = (body: unknown, origin = 'https://nagi.test') =>
  new Request(url, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  process.env.NAGI_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  plan = {
    id: trip,
    days: [{ id: day }],
    items: [
      {
        id: item,
        source: 'nagi',
        trip_day_id: day,
        sort_order: 0,
        start_time: null,
        stops: [],
        entry: { title: 'Temple', longitude: 139.7, latitude: 35.6 },
      },
    ],
  } as unknown as TripPlan;
  mocks.plan.mockImplementation(async () => plan);
  mocks.access.mockResolvedValue({});
  mocks.session.mockResolvedValue({ db: {}, userId: actor });
  mocks.directions.mockResolvedValue({
    key: 'safe',
    geometry: { type: 'FeatureCollection', features: [] },
  });
});
describe('Authenticated daily Directions endpoint', () => {
  it('uses the authorized server plan and private no-store responses', async () => {
    const response = await POST(request(input()), params);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.access).toHaveBeenCalledWith(guild, trip, 2147483647);
    expect(mocks.plan).toHaveBeenCalledWith(guild, trip, {});
    expect(mocks.directions).toHaveBeenCalledWith(
      actor,
      `${guild}:${trip}`,
      input().key,
      day,
      'cycling',
      expect.objectContaining({ points: [{ coordinates: [139.7, 35.6], ids: [item] }] }),
      expect.any(AbortSignal),
    );
  });
  it.each([401, 403])(
    'rejects an unauthorized session (%i) before the provider',
    async (status) => {
      mocks.session.mockRejectedValue({ status });
      expect((await POST(request(input()), params)).status).toBe(status);
      expect(mocks.directions).not.toHaveBeenCalled();
    },
  );
  it('rejects inaccessible trips even with a valid session', async () => {
    mocks.access.mockRejectedValue({ status: 403 });
    expect((await POST(request(input()), params)).status).toBe(403);
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.directions).not.toHaveBeenCalled();
  });
  it('rejects cross-origin requests, arbitrary coordinates and unsupported profiles', async () => {
    expect((await POST(request(input(), 'https://attacker.test'), params)).status).toBe(403);
    for (const body of [
      {
        ...input(),
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      ...['transit', 'walking', 'driving', 'cycling'].map((profile) => ({ ...input(), profile })),
      { ...input(), day: 'all' },
    ])
      expect((await POST(request(body), params)).status).toBe(400);
    expect(mocks.directions).not.toHaveBeenCalled();
  });
  it('rejects stale order/coordinates before any paid request', async () => {
    const body = input();
    plan.items[0]!.entry!.longitude = 139.8;
    const response = await POST(request(body), params);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'stale_route' });
    expect(mocks.directions).not.toHaveBeenCalled();
  });
  it('rejects inclusion and exclusion overrides for all occurrences', async () => {
    expect(
      (await POST(request({ ...input(), roles: { include: [], exclude: [item] } }), params)).status,
    ).toBe(400);
    expect(mocks.directions).not.toHaveBeenCalled();
  });
  it('accepts signed resolved coordinates only for this actor, trip and saved reference', async () => {
    Object.assign(plan.items[0]!, {
      source: 'mapbox',
      external_place_id: 'mapbox-temple',
      external_query: 'Temple',
      entry: null,
    });
    const coordinates = { longitude: 139.7, latitude: 35.6 };
    const route = prepareDayRoute(
      tripMapVisits(visibleTripItems(plan, day)),
      new Map([['mapbox-temple', { coordinates, featureType: 'poi' }]]),
    );
    const proof = issueMapboxProof({
      actor,
      trip,
      id: 'mapbox-temple',
      query: 'Temple',
      kind: 'resolved',
      coordinates,
      featureType: 'poi',
    });
    const body = {
      ...input(),
      key: dayRouteKey(day, 'cycling', route),
      places: [{ id: 'mapbox-temple', query: 'Temple', proof }],
    };
    expect((await POST(request(body), params)).status).toBe(200);
    mocks.directions.mockClear();
    body.places[0]!.proof = issueMapboxProof({
      actor: day,
      trip,
      id: 'mapbox-temple',
      query: 'Temple',
      kind: 'resolved',
      coordinates,
    });
    expect((await POST(request(body), params)).status).toBe(409);
    expect(mocks.directions).not.toHaveBeenCalled();
    body.places[0]!.id = 'another-place';
    expect((await POST(request(body), params)).status).toBe(403);
  });
  it('bounds request bytes and reports safe failures without provider URLs or secrets', async () => {
    expect((await POST(request({ padding: 'x'.repeat(512001) }), params)).status).toBe(413);
    mocks.plan.mockRejectedValue(new Error('https://api.mapbox.com?access_token=SECRET'));
    const response = await POST(request(input()), params);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('SECRET');
  });
});
