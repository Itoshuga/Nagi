import type { EntryCardRow } from './catalog';
import type { TripPlaceReference } from '@nagi/shared';
export type PlaceSourceFields = {
  source?: 'nagi' | 'mapbox' | 'custom';
  entry_id: string | null;
  external_place_id?: string | null;
  external_query?: string | null;
  needs_place_relink?: boolean;
  custom_title?: string | null;
  custom_location?: string | null;
  custom_latitude?: number | null;
  custom_longitude?: number | null;
};
export function placeSourceFields(place: TripPlaceReference) {
  return {
    source: place.source,
    entry_id: place.source === 'nagi' ? place.entry : null,
    external_place_id: place.source === 'mapbox' ? place.placeId : null,
    external_query: place.source === 'mapbox' ? place.query : null,
    needs_place_relink: false,
    custom_title: place.source === 'custom' ? place.title : null,
    custom_location: place.source === 'custom' ? place.location : null,
    custom_latitude: place.source === 'custom' ? place.latitude : null,
    custom_longitude: place.source === 'custom' ? place.longitude : null,
  };
}
export function preservedPlaceSource(row: PlaceSourceFields) {
  return {
    source: row.source ?? 'nagi',
    external_place_id: row.external_place_id ?? null,
    external_query: row.external_query ?? null,
    needs_place_relink: row.needs_place_relink ?? false,
    custom_title: row.custom_title ?? null,
    custom_location: row.custom_location ?? null,
    custom_latitude: row.custom_latitude ?? null,
    custom_longitude: row.custom_longitude ?? null,
  };
}
/** Only user-authored content enters this durable plan model. Provider display
 * data is resolved in the browser session and never enters rows or journals. */
export function tripSourceEntry(
  row: PlaceSourceFields & { id: string; updated_at: string },
): EntryCardRow | null {
  if (!row.source || row.source === 'nagi') return null;
  return {
    id: row.id,
    title:
      row.source === 'custom' ? (row.custom_title ?? 'Étape personnalisée') : 'Chargement du lieu…',
    slug: row.id,
    summary: row.source === 'custom' ? (row.custom_location ?? '') : '',
    cover_image_url: null,
    published: false,
    updated_at: row.updated_at,
    latitude: row.source === 'custom' ? (row.custom_latitude ?? null) : null,
    longitude: row.source === 'custom' ? (row.custom_longitude ?? null) : null,
    country: null,
    city: null,
    neighborhood: null,
    category: null,
  } as unknown as EntryCardRow;
}
