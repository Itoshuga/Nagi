import { z } from 'zod';
import { uuidSchema } from './collaboration';

export const googlePlaceIdSchema = z
  .string()
  .trim()
  .min(1)
  // Application request-size bound, not an assumed Google ID format limit.
  .max(8192)
  .regex(/^[A-Za-z0-9_-]+$/);
export const tripPlaceReferenceSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('nagi'), entry: uuidSchema }).strict(),
  z.object({ source: z.literal('google'), placeId: googlePlaceIdSchema }).strict(),
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
const coordinate = z
  .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
  .strict();
export const googleSearchRequestSchema = z
  .object({
    operation: z.literal('search'),
    kind: z.enum(['autocomplete', 'text_search']),
    query: z.string().trim().min(1).max(200),
    session: z.uuid(),
    type: z
      .enum([
        '',
        'restaurant',
        'cafe',
        'lodging',
        'museum',
        'park',
        'tourist_attraction',
        'shopping_mall',
        'train_station',
        'airport',
      ])
      .default(''),
    context: z
      .object({
        region: z
          .string()
          .regex(/^[a-z]{2}$/)
          .optional(),
        bias: z
          .union([
            z
              .object({
                circle: z
                  .object({ center: coordinate, radius: z.number().min(100).max(50000) })
                  .strict(),
              })
              .strict(),
            z
              .object({ rectangle: z.object({ low: coordinate, high: coordinate }).strict() })
              .strict(),
          ])
          .optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export type GoogleSearchRequest = z.output<typeof googleSearchRequestSchema>;
export const externalPlacesRequestSchema = z.discriminatedUnion('operation', [
  googleSearchRequestSchema,
  z
    .object({ operation: z.literal('selection'), placeId: googlePlaceIdSchema, session: z.uuid() })
    .strict(),
  z.object({ operation: z.literal('ui'), kind: z.enum(['ui_search', 'ui_details']) }).strict(),
  z.object({ operation: z.literal('verify'), placeId: googlePlaceIdSchema }).strict(),
  z
    .object({
      operation: z.literal('coordinates'),
      ids: z.array(googlePlaceIdSchema).min(1).max(30),
    })
    .strict(),
]);

export const placeSourceDefaults = {
  source: 'nagi' as const,
  google_place_id: null,
  custom_title: null,
  custom_location: null,
  custom_latitude: null,
  custom_longitude: null,
};
