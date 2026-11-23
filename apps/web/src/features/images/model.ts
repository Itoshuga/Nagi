import { z } from 'zod';

export const imageContextSchema = z.object({
  name: z.string().trim().min(1).max(300),
  aliases: z.array(z.string().max(300)).max(6).default([]),
  country: z.string().max(200).optional(),
  city: z.string().max(200).optional(),
  neighborhood: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  language: z.enum(['fr', 'en', 'ja']).default('fr'),
  wikidataId: z
    .string()
    .regex(/^Q[1-9]\d*$/)
    .optional(),
});
export type ImageContext = z.infer<typeof imageContextSchema>;
export const imageReferenceSchema = z.object({
  source: z.enum(['nagi', 'mapbox', 'custom']),
  id: z
    .string()
    .min(1)
    .max(8192)
    .regex(/^[^\p{Cc}]+$/u),
  visit: z.uuid().optional(),
  proof: z.string().max(12000).optional(),
  located: z.boolean().optional(),
});
export type ImageReference = z.infer<typeof imageReferenceSchema>;
export type OpenImage = {
  id: string;
  provider: 'wikimedia' | 'wikipedia' | 'openverse';
  sourceId: string;
  sourceUrl: string;
  imageUrl: string;
  thumbnailUrl: string;
  smallThumbnailUrl?: string;
  previewUrl: string;
  title: string;
  description?: string;
  /** Coordinates declared by the open photo source, never a Mapbox snapshot. */
  sourceCoordinates?: { latitude: number; longitude: number };
  sourceLocations?: { latitude: number; longitude: number }[];
  creator: string;
  creatorUrl?: string;
  license: 'CC0' | 'Public domain' | 'CC BY' | 'CC BY-SA';
  licenseVersion?: string;
  licenseUrl: string;
  attribution: string;
  width: number;
  height: number;
  sha1?: string;
  verifiedAt: string;
};
export const imageMatcherRevision = 'matcher-v2';
export type ImageResolution = {
  selected: OpenImage | null;
  candidates: OpenImage[];
  confidence: 'high' | 'ambiguous' | 'none';
  reasons: string[];
  entity?: string;
  status: 'ready' | 'unavailable' | 'pending';
  mode?: 'automatic' | 'manual' | 'fallback';
  revision?: number;
  coverHidden?: boolean;
  retryAfter?: number;
};
export const emptyResolution: ImageResolution = {
  selected: null,
  candidates: [],
  confidence: 'none',
  reasons: [],
  status: 'ready',
};
export const imageRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('read'), reference: imageReferenceSchema }),
  z.object({
    operation: z.literal('resolve'),
    reference: imageReferenceSchema,
    search: z.string().trim().min(2).max(160).optional(),
    browse: z.boolean().optional(),
  }),
  z.object({
    operation: z.literal('select'),
    reference: imageReferenceSchema,
    mode: z.enum(['automatic', 'manual', 'fallback']),
    image: z.uuid().nullable(),
    revision: z.number().int().nonnegative(),
  }),
  z.object({ operation: z.literal('broken'), reference: imageReferenceSchema, image: z.uuid() }),
]);
