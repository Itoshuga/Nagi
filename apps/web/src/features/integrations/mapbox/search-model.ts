import type { TripPlan } from '@nagi/database';
import { countrySearchBounds } from '@/features/trips/country-search-bounds';
export const mapboxSearchDelay = 300;
export const mapboxRefinementDelay = 600;
export const mapboxPlaceTypes = [
  ['restaurant', 'Restaurant'],
  ['cafe', 'Café'],
  ['hotel', 'Hôtel'],
  ['museum', 'Musée'],
  ['park', 'Parc'],
  ['tourist_attraction', 'Attraction'],
  ['shopping_mall', 'Centre commercial'],
  ['railway_station', 'Gare'],
  ['airport', 'Aéroport'],
] as const;
export type MapboxSearchFilters = { type: string; destination: boolean };
export const defaultMapboxFilters: MapboxSearchFilters = { type: '', destination: true };
export function mapboxSearchContext(
  plan: TripPlan,
  day: string | null,
  enabled: boolean,
): { proximity?: [number, number] } {
  if (!enabled) return {};
  const point = plan.items
    .filter((i) => (day === null || i.trip_day_id === day) && i.source !== 'mapbox')
    .map((i) => i.entry)
    .find((e) => e?.latitude != null && e.longitude != null);
  if (point?.latitude != null && point.longitude != null)
    return { proximity: [point.longitude, point.latitude] };
  const iso = plan.destination?.iso_code?.toUpperCase(),
    box = iso ? countrySearchBounds[iso] : undefined;
  // A preference, never a country/bbox filter. No browser geolocation or user IP.
  return box ? { proximity: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] } : {};
}
