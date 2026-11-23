import { z } from 'zod';
import { uuidSchema } from './collaboration';

// Provider identifiers are opaque; encode them as one URL path segment at the adapter boundary.
export const externalPlaceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(8192)
  .refine(
    (value) =>
      Array.from(value).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
    'Identifiant de lieu invalide.',
  );
export const mapboxQuerySchema = z.string().trim().min(1).max(256);
export const tripPlaceReferenceSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('nagi'), entry: uuidSchema }).strict(),
  z
    .object({
      source: z.literal('mapbox'),
      placeId: externalPlaceIdSchema,
      // Original user input, never a copied provider label. It permits a coherent
      // new suggest/retrieve session when a saved reference is opened again.
      query: mapboxQuerySchema,
      proof: z.string().max(24576).optional(),
    })
    .strict(),
  z
    .object({
      source: z.literal('custom'),
      title: z.string().trim().min(1).max(160),
      location: z.string().trim().max(500).default(''),
      latitude: z.number().min(-90).max(90).nullable().default(null),
      longitude: z.number().min(-180).max(180).nullable().default(null),
    })
    .strict()
    .refine(
      (value) => (value.latitude === null) === (value.longitude === null),
      'Renseignez les deux coordonnées.',
    ),
]);
export type TripPlaceReference = z.output<typeof tripPlaceReferenceSchema>;
export type TripItemSource = TripPlaceReference['source'];
export const mapboxSearchResultLimit = 6;
export const mapboxCategoryIds = [
  'restaurant',
  'cafe',
  'hotel',
  'museum',
  'park',
  'tourist_attraction',
  'shopping_mall',
  'railway_station',
  'airport',
] as const;
export const mapboxSearchRequestSchema = z
  .object({
    operation: z.literal('search'),
    kind: z.enum(['suggest', 'forward']),
    query: mapboxQuerySchema,
    session: z.uuid(),
    category: z.enum(['', ...mapboxCategoryIds]).default(''),
    context: z
      .object({
        proximity: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export type MapboxSearchRequest = z.output<typeof mapboxSearchRequestSchema>;
export const externalPlacesRequestSchema = z.discriminatedUnion('operation', [
  mapboxSearchRequestSchema,
  z
    .object({
      operation: z.literal('resolve'),
      placeId: externalPlaceIdSchema,
      query: mapboxQuerySchema,
      proof: z.string().max(24576).optional(),
      context: z
        .object({
          proximity: z
            .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
            .optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('details'),
      placeId: externalPlaceIdSchema,
      query: mapboxQuerySchema,
      proof: z.string().max(24576).optional(),
    })
    .strict(),
]);
export type CatalogPlace = {
  source: TripItemSource;
  id: string;
  title: string;
  category?: string;
  categoryId?: string;
  subtitle?: string;
  locationLabel?: string;
  featureType?: string;
  coordinates?: { longitude: number; latitude: number };
  imageUrl?: string;
  imageSource?: string;
  address?: string;
  website?: string;
  phone?: string;
  openingHours?: string;
  permanentlyClosed?: boolean;
  status?: string;
  query?: string;
  proof?: string;
};
export const placeSourceDefaults = {
  source: 'nagi' as const,
  external_place_id: null,
  external_query: null,
  needs_place_relink: false,
  custom_title: null,
  custom_location: null,
  custom_latitude: null,
  custom_longitude: null,
};
