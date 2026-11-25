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
  priority: z.enum(['visible', 'selected']).optional(),
  kind: z.enum(['entry', 'country', 'city', 'neighborhood', 'category']).optional(),
});
export type ImageReference = z.infer<typeof imageReferenceSchema>;
export type OpenImage = {
  usageRights?: 'open';
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
export type ProviderImage = {
  id: string;
  provider: 'mapbox' | 'foursquare';
  sourceId: string;
  sourceUrl: string;
  imageUrl: string;
  thumbnailUrl: string;
  smallThumbnailUrl?: string;
  previewUrl: string;
  title: string;
  width?: number;
  height?: number;
  creator?: string;
  attribution: string;
  usageRights: 'provider-restricted';
  persistence: 'session';
  expiresAt: string;
  cropAllowed: boolean;
};
export const imageRightsSchema = z.enum([
  'unknown',
  'auto_approved',
  'open_license',
  'permission_granted',
  'restricted',
  'rejected',
]);
export type ImageRights = z.infer<typeof imageRightsSchema>;
export const imageRightsLabels: Record<ImageRights, string> = {
  unknown: 'À vérifier',
  auto_approved: 'Validée automatiquement',
  open_license: 'Licence ouverte',
  permission_granted: 'Autorisation vérifiée',
  restricted: 'Usage restreint',
  rejected: 'Écartée',
};
export type SerperImage = {
  id: string;
  provider: 'serper';
  sourceId: string;
  sourceUrl: string;
  imageUrl: string;
  thumbnailUrl: string;
  smallThumbnailUrl?: string;
  previewUrl: string;
  title: string;
  creator?: string;
  license?: string;
  licenseUrl?: string;
  width?: number;
  height?: number;
  attribution: string;
  verifiedAt: string;
  usageRights: 'open' | 'permission-granted' | 'project-approved';
  rightsStatus: 'open_license' | 'permission_granted' | 'auto_approved';
};
export type PersistentImage = OpenImage | SerperImage;
export type PreviewImage = Omit<SerperImage, 'usageRights' | 'rightsStatus' | 'verifiedAt'> & {
  usageRights: 'development-preview';
  rightsStatus: ImageRights;
};
export const isPreviewImage = (image: PlaceImageCandidate): image is PreviewImage =>
  image.usageRights === 'development-preview';
export type PlaceImageCandidate = PersistentImage | ProviderImage | PreviewImage;
export const isOpenImage = (image: PlaceImageCandidate): image is OpenImage =>
  image.provider !== 'serper' && image.usageRights !== 'provider-restricted';
export const isTemporaryImage = (image: PlaceImageCandidate): image is ProviderImage =>
  image.usageRights === 'provider-restricted';
export const imageProviderLabels = {
  mapbox: 'Mapbox Places',
  wikimedia: 'Wikimedia Commons',
  wikipedia: 'Wikipedia · Wikimedia Commons',
  openverse: 'Openverse · Wikimedia Commons',
  foursquare: 'Foursquare',
  serper: 'Serper · source originale',
};
export type DiscoveryMetadata = {
  title?: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  thumbnailUrl?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  source?: string;
  domain?: string;
  link?: string;
  googleUrl?: string;
  position?: number;
};
export type DiscoveryCandidate = {
  id: string;
  metadata: DiscoveryMetadata;
  rightsStatus: ImageRights;
  availability: 'unknown' | 'available' | 'unavailable';
  excluded: boolean;
  creator?: string;
  license?: string;
  licenseUrl?: string;
  evidence?: string;
  photo?: PersistentImage;
  preview?: PreviewImage;
  sources: string[];
};
export type ImageGallery = {
  items: DiscoveryCandidate[];
  total: number;
  offset: number;
  hasMore: boolean;
  state: 'idle' | 'indexing' | 'more' | 'complete' | 'limited' | 'unavailable';
  stopReason?: string;
  pages: number;
  credits: number;
  canReview: boolean;
  previewEnabled?: boolean;
  nextRetryAt?: string;
  searchSize?: number;
  searchEnabled?: boolean;
  searchIssue?: string;
  fallbacks: PersistentImage[];
};
export const imageMatcherRevision = 'matcher-v3';
export type ImageResolution<T extends PlaceImageCandidate = PlaceImageCandidate> = {
  selected: T | null;
  candidates: T[];
  confidence: 'high' | 'ambiguous' | 'none';
  reasons: string[];
  entity?: string;
  status: 'ready' | 'unavailable' | 'pending';
  mode?: 'automatic' | 'manual' | 'fallback';
  revision?: number;
  coverHidden?: boolean;
  retryAfter?: number;
  maxConcurrentRequests?: number;
  galleryAvailable?: boolean;
  previewEnabled?: boolean;
  previewRevision?: number;
  previewMode?: 'manual' | 'automatic' | 'fallback' | 'published';
};
export const emptyResolution: ImageResolution<never> = {
  selected: null,
  candidates: [],
  confidence: 'none',
  reasons: [],
  status: 'ready',
};
export function imageSearchIssue(reason?: string) {
  switch (reason) {
    case 'budget':
      return 'Le plafond interne de recherches est atteint. Les photos déjà enregistrées restent disponibles.';
    case 'global_daily_budget':
      return 'Le plafond quotidien de recherches de Nagi est atteint. Les photos en cache restent disponibles.';
    case 'user_daily_budget':
      return 'Votre plafond quotidien de recherches est atteint. Les photos en cache restent disponibles.';
    case 'user_minute_budget':
      return 'Plusieurs lieux viennent d’être recherchés. Réessayez dans une minute.';
    case 'refresh_cooldown':
      return 'Ce lieu a déjà été recherché. Aucune nouvelle recherche ne sera lancée.';
    case 'busy':
      return 'Une autre recherche de photos est en cours. Votre recherche attend une place.';
    case 'rate_limit':
      return 'Serper limite actuellement les recherches. Les photos en cache restent disponibles.';
    case 'configuration':
      return 'Serper est désactivé ou sa clé est refusée. Vérifiez la configuration du serveur.';
    case 'network':
    case 'canceled':
      return 'La recherche unique n’a pas abouti. Le pictogramme du lieu reste disponible.';
    case 'invalid_response':
      return 'La recherche unique a renvoyé une réponse inexploitable. Le pictogramme du lieu reste disponible.';
    default:
      return undefined;
  }
}
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
  z.object({
    operation: z.literal('preview'),
    reference: imageReferenceSchema,
    mode: z.enum(['automatic', 'manual', 'fallback', 'published']),
    image: z.uuid().nullable(),
    revision: z.number().int().nonnegative(),
  }),
  z.object({ operation: z.literal('broken'), reference: imageReferenceSchema, image: z.uuid() }),
  z.object({
    operation: z.literal('gallery'),
    reference: imageReferenceSchema,
    offset: z.number().int().min(0).max(10000).default(0),
    filter: z.string().trim().max(100).default(''),
  }),
  z.object({
    operation: z.literal('index'),
    reference: imageReferenceSchema,
    continue: z.literal(false).default(false),
    refresh: z.literal(false).default(false),
  }),
  z.object({
    operation: z.literal('review'),
    reference: imageReferenceSchema,
    image: z.uuid(),
    rights: imageRightsSchema.exclude(['auto_approved']),
    creator: z.string().trim().max(500).default(''),
    license: z.string().trim().max(150).default(''),
    licenseUrl: z.string().max(4096).default(''),
    evidence: z.string().trim().max(2000).default(''),
    excluded: z.boolean().default(false),
  }),
  z.object({ operation: z.literal('report'), reference: imageReferenceSchema, image: z.uuid() }),
]);
