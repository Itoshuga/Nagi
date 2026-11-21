import type { TripPlan } from '@nagi/database';
import { googlePlaceIdSchema } from '@nagi/shared';
import { countrySearchBounds } from '@/features/trips/country-search-bounds';

export const googleSearchDelay = 250;
export const googlePlaceTypes = [
  ['restaurant', 'Restaurant'],
  ['cafe', 'Café'],
  ['lodging', 'Hôtel'],
  ['museum', 'Musée'],
  ['park', 'Parc'],
  ['tourist_attraction', 'Attraction'],
  ['shopping_mall', 'Centre commercial'],
  ['train_station', 'Gare'],
  ['airport', 'Aéroport'],
] as const;
export type GoogleSearchFilters = { type: string; destination: boolean };
export const defaultGoogleFilters: GoogleSearchFilters = { type: '', destination: true };
export function googleSearchContext(plan: TripPlan, day: string | null, enabled: boolean) {
  if (!enabled) return {};
  const point = plan.items
    .filter((i) => i.trip_day_id === day && i.source !== 'google')
    .map((i) => i.entry)
    .find((e) => e?.latitude != null && e.longitude != null);
  const iso = plan.destination?.iso_code?.toUpperCase(),
    box = iso ? countrySearchBounds[iso] : undefined;
  return {
    ...(iso && { region: iso === 'GB' ? 'uk' : iso.toLowerCase() }),
    ...(point?.latitude != null && point.longitude != null
      ? {
          bias: {
            circle: {
              center: { latitude: point.latitude, longitude: point.longitude },
              radius: 30000,
            },
          },
        }
      : box
        ? {
            bias: {
              rectangle: {
                low: { latitude: box[1], longitude: box[0] },
                high: { latitude: box[3], longitude: box[2] },
              },
            },
          }
        : {}),
  };
}
/** Only authorized IDs leave the REST adapter. Display content stays in UI Kit. */
export function googleSearchIds(value: unknown, kind: 'autocomplete' | 'text_search') {
  if (!value || typeof value !== 'object') return [];
  const data = value as {
    suggestions?: { placePrediction?: { placeId?: unknown } }[];
    places?: { id?: unknown }[];
  };
  const ids =
    kind === 'autocomplete'
      ? (Array.isArray(data.suggestions) ? data.suggestions : []).map(
          (s) => s?.placePrediction?.placeId,
        )
      : (Array.isArray(data.places) ? data.places : []).map((p) => p?.id);
  return [
    ...new Set(ids.filter((id): id is string => googlePlaceIdSchema.safeParse(id).success)),
  ].slice(0, kind === 'autocomplete' ? 5 : 8);
}
