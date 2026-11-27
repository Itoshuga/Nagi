import type { CatalogPlace } from '@nagi/shared';
import { tripMapVisits } from './planner-model';

export type RouteProfile = 'walking' | 'driving' | 'cycling';
export const dayRouteProfile = 'cycling' as const;
export type RouteCoordinate = [number, number];
export type RouteVisit = ReturnType<typeof tripMapVisits>[number];
export type RoutePlace = Pick<CatalogPlace, 'coordinates' | 'featureType'>;
export type RouteWaypoint = { coordinates: RouteCoordinate; ids: string[] };
export type DayRoutePlan = {
  points: RouteWaypoint[];
  missing: string[];
  sameLocation: number;
  signature: string;
};
export type RouteSegment = {
  id: string;
  from: string[];
  to: string[];
  status: 'ok' | 'unavailable' | 'too-far' | 'quota' | 'timeout' | 'limit';
  distance?: number;
  duration?: number;
};
export type RouteFeature = {
  type: 'Feature';
  properties: { segments: string[] };
  geometry: { type: 'LineString'; coordinates: RouteCoordinate[] };
};
export type DayRouteResult = {
  key: string;
  profile: RouteProfile;
  status: 'complete' | 'partial' | 'unavailable' | 'not-needed';
  geometry: { type: 'FeatureCollection'; features: RouteFeature[] };
  segments: RouteSegment[];
  distance: number;
  duration: number;
  missing: string[];
  sameLocation: number;
};
export function visitCoordinate(
  visit: RouteVisit,
  place?: RoutePlace,
): RouteCoordinate | undefined {
  const row = visit.stop ?? visit.parent;
  const longitude =
    row.source === 'mapbox' ? place?.coordinates?.longitude : visit.entry?.longitude;
  const latitude = row.source === 'mapbox' ? place?.coordinates?.latitude : visit.entry?.latitude;
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  )
    return;
  return [longitude, latitude];
}
export function coordinateDistance(a: RouteCoordinate, b: RouteCoordinate) {
  const rad = Math.PI / 180;
  const dlat = (b[1] - a[1]) * rad,
    dlon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function prepareDayRoute(
  visits: RouteVisit[],
  places: ReadonlyMap<string, RoutePlace>,
): DayRoutePlan {
  const points: RouteWaypoint[] = [],
    missing: string[] = [];
  const fingerprint: unknown[] = [];
  let sameLocation = 0;
  for (const visit of visits) {
    const row = visit.stop ?? visit.parent;
    const place = row.external_place_id ? places.get(row.external_place_id) : undefined;
    const coordinate = visitCoordinate(visit, place);
    fingerprint.push([visit.id, coordinate ?? null]);
    if (!coordinate) {
      missing.push(visit.id);
      continue;
    }
    const previous = points.at(-1);
    // Consecutive visits only: returning to a place later remains a real leg.
    if (previous && coordinateDistance(previous.coordinates, coordinate) <= 25) {
      previous.ids.push(visit.id);
      sameLocation++;
    } else points.push({ coordinates: coordinate, ids: [visit.id] });
  }
  return { points, missing, sameLocation, signature: JSON.stringify(fingerprint) };
}
export function dayRouteKey(day: string, profile: RouteProfile, plan: DayRoutePlan) {
  return JSON.stringify([day, profile, plan.signature]);
}
export function routeSegment(a: RouteWaypoint, b: RouteWaypoint): RouteSegment {
  return { id: `${a.ids.at(-1)}:${b.ids[0]}`, from: a.ids, to: b.ids, status: 'unavailable' };
}
export function routeDistanceLabel(meters: number) {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}
export function routeDurationLabel(seconds: number) {
  if (seconds < 60) return '< 1 min';
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')}` : ''}`;
}
export function unwrapRoute(coordinates: RouteCoordinate[], anchor: number): RouteCoordinate[] {
  let previous = anchor;
  return coordinates.map(([longitude, latitude]) => {
    const value = longitude + 360 * Math.round((previous - longitude) / 360);
    previous = value;
    return [value, latitude];
  });
}
