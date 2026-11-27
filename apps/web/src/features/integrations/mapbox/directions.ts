import 'server-only';
import { serviceDatabase } from '@/lib/supabase/server';
import { imageJsonResponse, retrySeconds } from '@/features/images/http';
import { computeDayRoute, DirectionsFailure } from '@/features/trips/map-route-compute';
import {
  type DayRoutePlan,
  type DayRouteResult,
  type RouteCoordinate,
  type RouteProfile,
} from '@/features/trips/map-route-model';
import { mapboxConfig } from './config';
let blockedUntil = 0;
async function requestDirections(
  actor: string,
  points: RouteCoordinate[],
  profile: RouteProfile,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const config = mapboxConfig();
  if (!config.enabled || !config.configured) throw new DirectionsFailure('unavailable');
  if (blockedUntil > Date.now()) throw new DirectionsFailure('quota');
  signal.throwIfAborted();
  const { error } = await serviceDatabase().rpc('reserve_mapbox_directions', {
    p_actor: actor,
    p_user_daily: config.directionsUserDaily,
    p_global_daily: config.directionsGlobalDaily,
    p_user_minute: config.directionsUserMinute,
  });
  if (error)
    throw new DirectionsFailure(error.message === 'mapbox_quota' ? 'quota' : 'unavailable');
  signal.throwIfAborted();
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${points.map((p) => p.join(',')).join(';')}`,
  );
  for (const [key, value] of Object.entries({
    geometries: 'geojson',
    overview: 'full',
    steps: 'false',
    annotations: 'distance,duration',
    alternatives: 'false',
    radiuses: points.map(() => '75').join(';'),
    access_token: config.token!,
  }))
    url.searchParams.set(key, value);
  const timeout = AbortSignal.timeout(7000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([signal, timeout]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) {
        blockedUntil =
          Date.now() +
          Math.min(300, Math.max(30, retrySeconds(response.headers.get('Retry-After')))) * 1000;
        throw new DirectionsFailure('quota');
      }
      throw new DirectionsFailure('unavailable');
    }
    // The existing bounded JSON reader also limits an unexpectedly large provider response.
    return await imageJsonResponse(response);
  } catch (error) {
    signal.throwIfAborted();
    throw error instanceof DirectionsFailure
      ? error
      : new DirectionsFailure(timeout.aborted ? 'timeout' : 'unavailable');
  }
}

type Job = {
  actor: string;
  controller: AbortController;
  promise: Promise<DayRouteResult>;
  subscribers: number;
  timer?: ReturnType<typeof setTimeout>;
};
const active = new Map<string, Job>();
// In-flight coalescing only. Product Terms 2.10.1 prohibit caching Navigation results.
// Never retain a settled response, log a geometry, or persist it to Supabase.
export async function directionsForDay(
  actor: string,
  scope: string,
  key: string,
  day: string,
  profile: RouteProfile,
  plan: DayRoutePlan,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const id = JSON.stringify([actor, scope, key]);
  let job = active.get(id);
  if (!job) {
    if ([...active.values()].filter((entry) => entry.actor === actor).length >= 2)
      throw new DirectionsFailure('quota');
    const controller = new AbortController();
    job = { actor, controller, subscribers: 0, promise: undefined! };
    const current = job;
    current.promise = computeDayRoute(
      day,
      profile,
      plan,
      (points, mode, cancel) => requestDirections(actor, points, mode, cancel),
      AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
    ).finally(() => {
      clearTimeout(current.timer);
      if (active.get(id) === current) active.delete(id);
    });
    active.set(id, job);
  }
  if (job.subscribers >= 8) throw new DirectionsFailure('quota');
  clearTimeout(job.timer);
  job.subscribers++;
  const current = job;
  try {
    return await new Promise<DayRouteResult>((resolve, reject) => {
      const abort = () => reject(new DirectionsFailure('timeout'));
      signal.addEventListener('abort', abort, { once: true });
      current.promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', abort));
      if (signal.aborted) abort();
    });
  } finally {
    current.subscribers--;
    if (!current.subscribers && active.get(id) === current)
      current.timer = setTimeout(() => {
        if (!current.subscribers) {
          active.delete(id);
          current.controller.abort();
        }
      }, 100);
  }
}
