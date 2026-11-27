import { describe, expect, it, vi } from 'vitest';
import { tripMapVisits, visibleTripItems } from '../apps/web/src/features/trips/planner-model';
import {
  dayRouteKey,
  prepareDayRoute,
  unwrapRoute,
  type RouteCoordinate,
  type RouteVisit,
} from '../apps/web/src/features/trips/map-route-model';
import {
  computeDayRoute,
  DirectionsFailure,
  type DirectionsRequest,
} from '../apps/web/src/features/trips/map-route-compute';
import type { TripPlan, TripPlanItem } from '../packages/database/src/collaboration';
const visit = (id: string, lon: number | null = 139.7, lat = 35.6) =>
  ({
    id,
    number: id,
    trip_day_id: 'day',
    parent: { id, source: 'nagi' },
    entry: {
      title: id,
      longitude: lon,
      latitude: lat,
      category: { slug: 'shopping', name: 'Shopping' },
    },
  }) as RouteVisit;
const plan = (n: number) =>
  prepareDayRoute(
    Array.from({ length: n }, (_, i) => visit(String(i), 139.7 + i * 0.001)),
    new Map(),
  );
export function mockDirections(points: RouteCoordinate[]) {
  // Curved synthetic provider fixture, with per-leg annotation edge counts.
  const coordinates: RouteCoordinate[] = [points[0]!];
  const legs = points.slice(1).map((p, i) => {
    coordinates.push([(points[i]![0] + p[0]) / 2, p[1] + 0.0002], p);
    return { distance: 120 + i, duration: 90 + i, annotation: { distance: [60, 60] } };
  });
  return { code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates }, legs }] };
}
const compute = (
  n: number,
  request: DirectionsRequest = vi.fn(async (points: RouteCoordinate[]) => mockDirections(points)),
) => computeDayRoute('day', 'walking', plan(n), request, new AbortController().signal);
describe('Daily route occurrences and authoritative ordering', () => {
  it('uses existing chronological ordering, then immediately ordered nested stops', () => {
    const first = {
      ...visit('late').parent,
      trip_day_id: 'day',
      start_time: '10:00',
      sort_order: 0,
      stops: [{ id: 'stop', entry: null }],
    } as TripPlanItem;
    const early = {
      ...first,
      id: 'early',
      start_time: '08:30',
      sort_order: 1,
      stops: [],
    } as TripPlanItem;
    const other = { ...early, id: 'other', trip_day_id: 'another' };
    expect(
      tripMapVisits(
        visibleTripItems({ items: [first, other, early], days: [] } as unknown as TripPlan, 'day'),
      ).map((v) => v.id),
    ).toEqual(['early', 'late', 'stop']);
  });
  it('keeps all occurrences, collapses only consecutive points within 25m, and permits return visits', () => {
    const visits = [
      visit('parent'),
      visit('inside', 139.70001),
      visit('next', 139.71),
      visit('return'),
    ];
    const result = prepareDayRoute(visits, new Map());
    expect(result.points.map((p) => p.ids)).toEqual([['parent', 'inside'], ['next'], ['return']]);
    expect(result.sameLocation).toBe(1);
    expect(visits).toHaveLength(4);
  });
  it('automatically includes geographic areas and explicit visits, skipping only invalid coordinates', () => {
    const area = visit('city');
    area.entry!.category!.slug = 'villes';
    const custom = visit('custom', 139.705);
    custom.parent.source = 'custom';
    custom.entry!.category!.slug = 'ville';
    const invalid = visit('invalid', 200),
      missing = visit('missing', null),
      next = visit('next', 139.71);
    const result = prepareDayRoute([area, invalid, missing, custom, next], new Map());
    expect(result.missing).toEqual(['invalid', 'missing']);
    expect(result.points.map((p) => p.ids)).toEqual([['city'], ['custom'], ['next']]);
  });
  it('automatically includes resolved Mapbox neighborhoods without an inclusion setting', () => {
    const area = visit('external');
    Object.assign(area.parent, { source: 'mapbox', external_place_id: 'external' });
    const result = prepareDayRoute(
      [area],
      new Map([
        [
          'external',
          { coordinates: { longitude: 139.7, latitude: 35.6 }, featureType: 'neighborhood' },
        ],
      ]),
    );
    expect(result.points).toEqual([{ coordinates: [139.7, 35.6], ids: ['external'] }]);
    expect(result.missing).toEqual([]);
  });
  it('does not invalidate a route for notes, names, colors, photos or durations', () => {
    const row = visit('a'),
      before = prepareDayRoute([row], new Map());
    Object.assign(row.parent, {
      notes: 'new',
      calendar_color: '#fff',
      estimated_duration_minutes: 120,
    });
    row.entry!.title = 'renamed';
    expect(dayRouteKey('day', 'walking', prepareDayRoute([row], new Map()))).toBe(
      dayRouteKey('day', 'walking', before),
    );
    expect(dayRouteKey('day', 'cycling', before)).not.toBe(dayRouteKey('day', 'walking', before));
  });
  it('unwraps dateline geometry continuously', () => {
    expect(
      unwrapRoute(
        [
          [179, 35],
          [-179, 35],
          [-178, 35],
        ],
        179,
      ),
    ).toEqual([
      [179, 35],
      [181, 35],
      [182, 35],
    ]);
  });
});
describe('Bounded real-geometry calculation', () => {
  it.each([0, 1])('makes no provider call for %i points', async (n) => {
    const request = vi.fn();
    expect((await compute(n, request)).status).toBe('not-needed');
    expect(request).not.toHaveBeenCalled();
  });
  it.each(['walking', 'driving', 'cycling'] as const)(
    'uses provider legs and curved geometry in %s mode',
    async (profile) => {
      const request = vi.fn(async (points: RouteCoordinate[]) => mockDirections(points));
      const result = await computeDayRoute(
        'day',
        profile,
        plan(3),
        request,
        new AbortController().signal,
      );
      expect(request.mock.calls[0]![0]).toEqual(plan(3).points.map((p) => p.coordinates));
      expect(result).toMatchObject({ status: 'complete', profile, distance: 241, duration: 181 });
      expect(result.geometry.features).toHaveLength(2);
      expect(result.geometry.features[0]!.geometry.coordinates).toHaveLength(3);
    },
  );
  it('overlaps chunks at point 25 without losing/duplicating any edge', async () => {
    const request = vi.fn(async (points: RouteCoordinate[]) => mockDirections(points));
    const result = await compute(69, request);
    expect(request.mock.calls.map((c) => c[0].length)).toEqual([25, 25, 21]);
    expect(request.mock.calls[0]![0].at(-1)).toEqual(request.mock.calls[1]![0][0]);
    expect(result.segments).toHaveLength(68);
    expect(result.segments.every((s) => s.status === 'ok')).toBe(true);
  });
  it('salvages reachable portions after NoRoute, never invents a bridge', async () => {
    const request = vi.fn(async (points: RouteCoordinate[]) =>
      points.length > 2 || points[0]![0] > 139.7015 ? { code: 'NoRoute' } : mockDirections(points),
    );
    const result = await compute(4, request);
    expect(result.status).toBe('partial');
    expect(result.segments.map((s) => s.status)).toEqual(['ok', 'ok', 'unavailable']);
    expect(result.geometry.features.flatMap((f) => f.properties.segments)).toEqual(['0:1', '1:2']);
    expect(request).toHaveBeenCalledTimes(5);
  });
  it('caps billing at eight calls even when every chunk fails', async () => {
    const request = vi.fn(async () => ({ code: 'NoRoute' }));
    const result = await compute(75, request);
    expect(request).toHaveBeenCalledTimes(8);
    expect(result.segments.some((s) => s.status === 'limit')).toBe(true);
    expect(result.geometry.features).toEqual([]);
  });
  it('stops on quota without retries and rejects invalid geometry', async () => {
    const request = vi.fn(async () => {
      throw new DirectionsFailure('quota');
    });
    const result = await compute(60, request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('unavailable');
    expect(result.distance).toBe(0);
    const malformed = await compute(
      2,
      vi.fn(async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [999, 999],
              ],
            },
            legs: [{ distance: 12, duration: 34 }],
          },
        ],
      })),
    );
    expect(malformed.geometry.features).toEqual([]);
  });
  it('does not call walking Directions for incompatible distances, retains other legs', async () => {
    const route = prepareDayRoute([visit('a'), visit('b', 135), visit('c', 135.001)], new Map());
    const request = vi.fn(async (points: RouteCoordinate[]) => mockDirections(points));
    const result = await computeDayRoute(
      'day',
      'walking',
      route,
      request,
      new AbortController().signal,
    );
    expect(result.status).toBe('partial');
    expect(result.segments[0]!.status).toBe('too-far');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('marks missing destinations partial and cancels obsolete calculations', async () => {
    const route = { ...plan(2), missing: ['unknown'] };
    expect(
      (
        await computeDayRoute(
          'day',
          'walking',
          route,
          async (points) => mockDirections(points),
          new AbortController().signal,
        )
      ).status,
    ).toBe('partial');
    await expect(
      computeDayRoute('day', 'walking', plan(2), vi.fn(), AbortSignal.abort()),
    ).rejects.toBeDefined();
  });
});
