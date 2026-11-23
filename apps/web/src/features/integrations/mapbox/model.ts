import { externalPlaceIdSchema, externalHttpUrl, type CatalogPlace } from '@nagi/shared';
import type { EntryCardRow } from '@nagi/database';

export const mapboxAttribution = '© Mapbox et ses fournisseurs';
export const mapboxAttributionUrl = 'https://www.mapbox.com/about/maps/';
const featureLabels: Record<string, string> = {
  address: 'Adresse',
  place: 'Ville',
  locality: 'Localité',
  neighborhood: 'Quartier',
  region: 'Région',
  country: 'Pays',
};
const categoryLabels: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  hotel: 'Hôtel',
  museum: 'Musée',
  park: 'Parc',
  tourist_attraction: 'Attraction',
  shopping_mall: 'Centre commercial',
  railway_station: 'Gare',
  airport: 'Aéroport',
};
const text = (value: unknown, length = 1000) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, length) : undefined;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
export function publicMapboxUrl(value: unknown) {
  const parsed = externalHttpUrl(value);
  if (!parsed) return;
  const url = new URL(parsed);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[|0\.)/i.test(url.hostname)
  )
    return;
  return url.href;
}
function point(value: unknown) {
  const data = object(value),
    longitude = data.longitude,
    latitude = data.latitude;
  return typeof longitude === 'number' &&
    typeof latitude === 'number' &&
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90
    ? { longitude, latitude }
    : undefined;
}
const normalizedPlaceName = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\p{M}\p{P}\p{Z}]/gu, '');

export function mapboxNeedsRefinement(query: string, places: CatalogPlace[]) {
  const typed = normalizedPlaceName(query);
  return typed.length >= 4 && !places.some((place) => normalizedPlaceName(place.title) === typed);
}

export function mapboxSearchPlaces(
  value: unknown,
  kind: 'suggest' | 'forward',
  query: string,
): CatalogPlace[] {
  const data = object(value),
    rows = kind === 'suggest' ? data.suggestions : data.features;
  if (!Array.isArray(rows)) return [];
  const result: CatalogPlace[] = [];
  for (const row of rows.slice(0, 10)) {
    const feature = object(row),
      p = kind === 'suggest' ? feature : object(feature.properties);
    const id = externalPlaceIdSchema.safeParse(p.mapbox_id),
      title = text(p.name, 300),
      featureType = text(p.feature_type, 40);
    if (!id.success || !title || !featureType || ['category', 'brand'].includes(featureType))
      continue;
    const context = object(p.context),
      name = (key: string) => text(object(context[key]).name, 200);
    const labels = [
      name('neighborhood') ?? name('locality'),
      name('place') ?? name('city'),
      name('country'),
    ].filter(Boolean);
    const categories = strings(p.poi_category_ids),
      names = strings(p.poi_category);
    const geometry = object(feature.geometry),
      array = geometry.coordinates;
    const coordinates =
      point(p.coordinates) ??
      (Array.isArray(array) ? point({ longitude: array[0], latitude: array[1] }) : undefined);
    if (kind === 'forward' && !coordinates) continue;
    result.push({
      source: 'mapbox',
      id: id.data,
      title,
      featureType,
      query,
      categoryId: categories[0],
      category: categoryLabels[categories[0] ?? ''] ?? names[0] ?? featureLabels[featureType],
      subtitle: labels.join(' · ') || text(p.place_formatted, 500),
      locationLabel: labels.join(' · ') || text(p.place_formatted, 500),
      address: text(p.full_address),
      coordinates,
    });
  }
  const typed = normalizedPlaceName(query);
  // Prefer an exact title over a broad district match; retain the provider's
  // relative order otherwise. No transliteration or approximate substitution.
  return [...new Map(result.map((p) => [p.id, p])).values()].sort(
    (a, b) =>
      Number(normalizedPlaceName(b.title) === typed) -
      Number(normalizedPlaceName(a.title) === typed),
  );
}
export function mapboxPlaceDetails(value: unknown, allowPhotos: boolean): CatalogPlace | null {
  const p = object(value),
    id = externalPlaceIdSchema.safeParse(p.mapbox_id),
    title = text(p.name, 300);
  if (!id.success || !title) return null;
  const address = object(p.address),
    category = text(p.primary_category, 100) ?? strings(p.categories)[0];
  const photos = Array.isArray(p.photos) ? p.photos : [],
    photo = allowPhotos ? photos.map(object).find((p) => publicMapboxUrl(p.url)) : undefined;
  return {
    source: 'mapbox',
    id: id.data,
    title,
    featureType: 'poi',
    coordinates: point(p.coordinates),
    categoryId: category,
    category: categoryLabels[category ?? ''] ?? category,
    locationLabel: [text(address.neighborhood), text(address.city), text(address.country)]
      .filter(Boolean)
      .join(' · '),
    address: text(p.full_address),
    website: publicMapboxUrl(p.website),
    phone: text(p.phone, 100),
    openingHours: text(p.opening_hours),
    permanentlyClosed: typeof p.permanently_closed === 'boolean' ? p.permanently_closed : undefined,
    status: text(p.status, 40),
    imageUrl: photo ? publicMapboxUrl(photo.url) : undefined,
    imageSource: photo
      ? (publicMapboxUrl(p.website) ?? new URL(publicMapboxUrl(photo.url)!).origin)
      : undefined,
  };
}
/** Temporary presentation adapter only; never pass this object to a catalog INSERT. */
export function catalogPlaceEntry(place: CatalogPlace): EntryCardRow {
  return {
    id: place.id,
    title: place.title,
    slug: place.id,
    summary: place.locationLabel ?? '',
    cover_image_url: place.imageUrl ?? null,
    published: false,
    updated_at: '',
    latitude: place.coordinates?.latitude ?? null,
    longitude: place.coordinates?.longitude ?? null,
    country: null,
    city: null,
    neighborhood: null,
    category: null,
  } as unknown as EntryCardRow;
}
export function nagiCatalogPlace(entry: EntryCardRow): CatalogPlace {
  return {
    source: 'nagi',
    id: entry.id,
    title: entry.title,
    category: entry.category?.name,
    locationLabel: [entry.neighborhood?.name, entry.city?.name, entry.country?.name]
      .filter(Boolean)
      .join(' · '),
    imageUrl: entry.cover_image_url ?? undefined,
    coordinates:
      entry.latitude != null && entry.longitude != null
        ? { latitude: entry.latitude, longitude: entry.longitude }
        : undefined,
  };
}
