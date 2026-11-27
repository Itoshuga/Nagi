import {
  coordinateDistance,
  dayRouteKey,
  routeSegment,
  type DayRoutePlan,
  type DayRouteResult,
  type RouteCoordinate,
  type RouteFeature,
  type RouteProfile,
  type RouteSegment,
} from './map-route-model';

export class DirectionsFailure extends Error {
  constructor(public reason: 'unavailable' | 'quota' | 'timeout' | 'limit' | 'no-route') {
    super(reason);
  }
}
type ProviderResult = { features: RouteFeature[]; legs: { distance: number; duration: number }[] };
export type DirectionsRequest = (
  points: RouteCoordinate[],
  profile: RouteProfile,
  signal: AbortSignal,
) => Promise<unknown>;

// Only display validated provider geometry. Never synthesize a straight-line fallback.
export function parseDirections(value: unknown, segments: RouteSegment[]): ProviderResult {
  const data = value as {
    code?: string;
    routes?: {
      geometry?: { type?: string; coordinates?: unknown };
      legs?: { distance?: number; duration?: number; annotation?: { distance?: number[] } }[];
    }[];
  };
  if (data?.code === 'NoRoute' || data?.code === 'NoSegment')
    throw new DirectionsFailure('no-route');
  const route = data?.code === 'Ok' ? data.routes?.[0] : undefined;
  const coordinates = route?.geometry?.coordinates;
  const legs = route?.legs;
  if (
    route?.geometry?.type !== 'LineString' ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > 100000 ||
    !coordinates.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every(Number.isFinite) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90,
    ) ||
    !legs ||
    legs.length !== segments.length ||
    !legs.every(
      (leg) =>
        Number.isFinite(leg.distance) &&
        Number.isFinite(leg.duration) &&
        leg.distance! >= 0 &&
        leg.duration! >= 0,
    )
  )
    throw new DirectionsFailure('unavailable');
  const coords = coordinates as RouteCoordinate[];
  const counts = legs.map((leg) => leg.annotation?.distance?.length ?? 0);
  const split =
    counts.every((n) => n > 0) && counts.reduce((a, b) => a + b, 0) === coords.length - 1;
  let offset = 0;
  const features: RouteFeature[] = split
    ? segments.map((segment, i) => {
        const geometry = coords.slice(offset, offset + counts[i]! + 1);
        offset += counts[i]!;
        return {
          type: 'Feature',
          properties: { segments: [segment.id] },
          geometry: { type: 'LineString', coordinates: geometry },
        };
      })
    : [
        {
          type: 'Feature',
          properties: { segments: segments.map((s) => s.id) },
          geometry: { type: 'LineString', coordinates: coords },
        },
      ];
  return {
    features,
    legs: legs.map((leg) => ({ distance: leg.distance!, duration: leg.duration! })),
  };
}

export async function computeDayRoute(
  day: string,
  profile: RouteProfile,
  plan: DayRoutePlan,
  request: DirectionsRequest,
  signal: AbortSignal,
): Promise<DayRouteResult> {
  const segments = plan.points.slice(1).map((point, i) => routeSegment(plan.points[i]!, point));
  const features: RouteFeature[] = [];
  const ceiling = { walking: 30000, cycling: 250000, driving: 3000000 }[profile];
  const batchCeiling = { walking: 900000, cycling: 1400000, driving: 9000000 }[profile];
  const lengths = segments.map((_, i) =>
    coordinateDistance(plan.points[i]!.coordinates, plan.points[i + 1]!.coordinates),
  );
  lengths.forEach((distance, i) => {
    if (distance > ceiling) segments[i]!.status = 'too-far';
  });
  const started = Date.now();
  let calls = 0,
    halted: RouteSegment['status'] | undefined;
  const calculate = async (start: number, end: number): Promise<void> => {
    signal.throwIfAborted();
    const batch = segments.slice(start, end);
    if (Date.now() - started >= 18000) halted = 'timeout';
    if (halted || calls >= 8) {
      batch.forEach((s) => (s.status = halted ?? 'limit'));
      return;
    }
    calls++;
    try {
      const raw = await request(
        plan.points.slice(start, end + 1).map((p) => p.coordinates),
        profile,
        signal,
      );
      signal.throwIfAborted();
      const result = parseDirections(raw, batch);
      result.legs.forEach((leg, i) => Object.assign(batch[i]!, leg, { status: 'ok' }));
      features.push(...result.features);
    } catch (error) {
      signal.throwIfAborted();
      const reason = error instanceof DirectionsFailure ? error.reason : 'unavailable';
      if (reason === 'no-route' && end - start > 1) {
        const middle = Math.floor((start + end) / 2);
        await calculate(start, middle);
        await calculate(middle, end);
      } else {
        batch.forEach((s) => (s.status = reason === 'no-route' ? 'unavailable' : reason));
        if (reason === 'quota' || reason === 'timeout') halted = reason;
      }
    }
  };
  for (let start = 0; start < segments.length;) {
    if (segments[start]!.status === 'too-far') {
      start++;
      continue;
    }
    let end = start + 1,
      distance = lengths[start]!;
    while (
      end < segments.length &&
      end - start < 24 &&
      segments[end]!.status !== 'too-far' &&
      distance + lengths[end]! <= batchCeiling
    )
      distance += lengths[end++]!;
    await calculate(start, end);
    start = end;
  }
  const successful = segments.filter((s) => s.status === 'ok');
  return {
    key: dayRouteKey(day, profile, plan),
    profile,
    status: !segments.length
      ? 'not-needed'
      : successful.length === segments.length
        ? plan.missing.length
          ? 'partial'
          : 'complete'
        : successful.length
          ? 'partial'
          : 'unavailable',
    geometry: { type: 'FeatureCollection', features },
    segments,
    distance: successful.reduce((sum, s) => sum + s.distance!, 0),
    duration: successful.reduce((sum, s) => sum + s.duration!, 0),
    missing: plan.missing,
    sameLocation: plan.sameLocation,
  };
}
