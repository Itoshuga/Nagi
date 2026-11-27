import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dayRouteKey,
  prepareDayRoute,
  type RouteVisit,
} from '../apps/web/src/features/trips/map-route-model';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ serviceDatabase: () => ({ rpc: mocks.rpc }) }));
const plan = prepareDayRoute(
  [0, 1].map((i) => ({
    id: String(i),
    parent: { source: 'nagi' },
    entry: { longitude: 139.7 + i * 0.001, latitude: 35.6 },
  })) as RouteVisit[],
  new Map(),
);
const payload = {
  code: 'Ok',
  routes: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [139.7, 35.6],
          [139.7004, 35.6002],
          [139.701, 35.6],
        ],
      },
      legs: [{ distance: 123, duration: 99, annotation: { distance: [50, 73] } }],
    },
  ],
};
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('MAPBOX_ENABLED', 'true');
  vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'private-direction-token');
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'pk.public-test');
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.fetch.mockImplementation(async () => Response.json(payload));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('Directions transport cost and lifetime', () => {
  it('deduplicates concurrent authorized requests, never retains a completed result', async () => {
    const { directionsForDay } =
      await import('../apps/web/src/features/integrations/mapbox/directions');
    const key = dayRouteKey('day', 'walking', plan),
      signal = new AbortController().signal;
    const call = () => directionsForDay('actor', 'guild:trip', key, 'day', 'walking', plan, signal);
    const [a, b] = await Promise.all([call(), call()]);
    expect(a).toEqual(b);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const url = new URL(mocks.fetch.mock.calls[0]![0]);
    expect(url.pathname).toContain('/mapbox/walking/139.7,35.6;139.701,35.6');
    expect(url.searchParams.get('overview')).toBe('full');
    expect(url.searchParams.get('steps')).toBe('false');
    expect(JSON.stringify(a)).not.toContain('private-direction-token');
    await call();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it('reserves quota before provider I/O and stops on denial', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'mapbox_quota' } });
    const { directionsForDay } =
      await import('../apps/web/src/features/integrations/mapbox/directions');
    const result = await directionsForDay(
      'actor',
      'trip',
      'k',
      'day',
      'driving',
      plan,
      new AbortController().signal,
    );
    expect(result.segments[0]!.status).toBe('quota');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('honors provider throttling without retry loops', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(null, { status: 429, headers: { 'Retry-After': '120' } }),
    );
    const { directionsForDay } =
      await import('../apps/web/src/features/integrations/mapbox/directions');
    for (const key of ['first', 'second'])
      expect(
        (
          await directionsForDay(
            'actor',
            'trip',
            key,
            'day',
            'cycling',
            plan,
            new AbortController().signal,
          )
        ).segments[0]!.status,
      ).toBe('quota');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('one abandoned subscriber does not cancel another subscriber', async () => {
    let release: () => void = () => {};
    mocks.fetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(Response.json(payload));
        }),
    );
    const { directionsForDay } =
      await import('../apps/web/src/features/integrations/mapbox/directions');
    const cancel = new AbortController();
    const a = directionsForDay('actor', 'trip', 'k', 'day', 'walking', plan, cancel.signal);
    const b = directionsForDay(
      'actor',
      'trip',
      'k',
      'day',
      'walking',
      plan,
      new AbortController().signal,
    );
    const rejected = expect(a).rejects.toMatchObject({ reason: 'timeout' });
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    cancel.abort();
    release();
    await rejected;
    expect((await b).status).toBe('complete');
  });
});
