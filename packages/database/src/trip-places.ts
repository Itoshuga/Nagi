import type { EntryCardRow } from './catalog';
import type { TripPlaceReference } from '@nagi/shared';

export type PlaceSourceFields = {
  source?: 'nagi' | 'google' | 'custom';
  entry_id: string | null;
  google_place_id?: string | null;
  custom_title?: string | null;
  custom_location?: string | null;
  custom_latitude?: number | null;
  custom_longitude?: number | null;
};
export function placeSourceFields(place: TripPlaceReference) {
  return {
    source: place.source,
    entry_id: place.source === 'nagi' ? place.entry : null,
    google_place_id: place.source === 'google' ? place.placeId : null,
    custom_title: place.source === 'custom' ? place.title : null,
    custom_location: place.source === 'custom' ? place.location : null,
    custom_latitude: place.source === 'custom' ? place.latitude : null,
    custom_longitude: place.source === 'custom' ? place.longitude : null,
  };
}
export function preservedPlaceSource(row: PlaceSourceFields) {
  return {
    source: row.source ?? 'nagi',
    google_place_id: row.google_place_id ?? null,
    custom_title: row.custom_title ?? null,
    custom_location: row.custom_location ?? null,
    custom_latitude: row.custom_latitude ?? null,
    custom_longitude: row.custom_longitude ?? null,
  };
}
/** Presentation for user-authored content only. Google content stays in UI Kit. */
export function tripSourceEntry(
  row: PlaceSourceFields & { id: string; updated_at: string },
): EntryCardRow | null {
  if (!row.source || row.source === 'nagi') return null;
  return {
    id: row.id,
    title:
      row.source === 'custom' ? (row.custom_title ?? 'Étape personnalisée') : 'Lieu Google Maps',
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
