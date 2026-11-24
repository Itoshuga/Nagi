import 'server-only';
import { serviceDatabase } from '@/lib/supabase/server';
import { TripRequestError } from '@/features/trips/sync-server';
import { imageDevelopmentPreview } from './config';
import { httpsUrl } from './metadata';
import { imageCacheKey, imageTarget, imageRows, readImages, type ImageScope } from './server';
import { ensureImageGallery } from './discovery';
import type { Database, Json } from '@nagi/database';
import type { ImageReference, ImageResolution, PreviewImage, PersistentImage } from './model';

type Candidate = Database['public']['Tables']['image_candidates']['Row'];
export const canPreviewImages = (scope: ImageScope) =>
  imageDevelopmentPreview() && scope.admin === true;
export function candidatePreview(row: Candidate): PreviewImage | undefined {
  if (row.availability_status === 'unavailable') return;
  const metadata = row.metadata as Record<string, unknown>;
  const imageUrl = httpsUrl(metadata.imageUrl),
    thumbnailUrl = httpsUrl(metadata.thumbnailUrl);
  if (!imageUrl && !thumbnailUrl) return;
  return {
    id: row.id,
    provider: 'serper',
    sourceId: 'serper:' + row.url_key,
    sourceUrl: httpsUrl(metadata.link) ?? imageUrl ?? thumbnailUrl!,
    imageUrl: imageUrl ?? thumbnailUrl!,
    previewUrl: imageUrl ?? thumbnailUrl!,
    thumbnailUrl: thumbnailUrl ?? imageUrl!,
    title: row.title || 'Photographie',
    creator: row.creator ?? undefined,
    license: row.license ?? undefined,
    licenseUrl: httpsUrl(row.license_url),
    width: typeof metadata.imageWidth === 'number' ? metadata.imageWidth : undefined,
    height: typeof metadata.imageHeight === 'number' ? metadata.imageHeight : undefined,
    attribution: [row.title, row.creator, metadata.source].filter(Boolean).join(' · '),
    usageRights: 'development-preview',
    rightsStatus: row.rights_status as PreviewImage['rightsStatus'],
  };
}
type Choice = {
  mode: NonNullable<ImageResolution['previewMode']>;
  image?: string;
  revision: number;
};
export function developmentPreviewChoice(scope: ImageScope, ref: ImageReference, stored: Json) {
  if (!canPreviewImages(scope)) return;
  const choices = (stored ?? {}) as Record<string, Choice>;
  const own = choices[scope.actor + ':' + (ref.visit ?? 'global')],
    global = choices[scope.actor + ':global'];
  return {
    choice: ref.visit && (!own || own.mode === 'automatic') ? (global ?? own) : own,
    revision: own?.revision ?? 0,
  };
}
export async function readDevelopmentPreview(scope: ImageScope, ref: ImageReference) {
  if (!canPreviewImages(scope)) return;
  const db = serviceDatabase(),
    key = imageCacheKey(ref);
  const gallery = await db
    .from('image_galleries')
    .select('development_previews')
    .eq('cache_key', key)
    .maybeSingle();
  if (gallery.error) throw new Error('Image preview unavailable', { cause: gallery.error });
  const selected = developmentPreviewChoice(scope, ref, gallery.data?.development_previews ?? {});
  const choice = selected?.choice;
  const state = {
    enabled: true as const,
    revision: selected?.revision ?? 0,
    mode: choice?.mode ?? ('automatic' as const),
    photos: [] as (PreviewImage | PersistentImage)[],
  };
  if (!gallery.data || state.mode === 'published' || state.mode === 'fallback') return state;
  const query = db
    .from('image_candidates')
    .select('*')
    .eq('gallery_key', key)
    .neq('availability_status', 'unavailable')
    .eq('is_excluded', false);
  const rows = await query.order('relevance', { ascending: false }).order('id').limit(6);
  if (rows.error) throw new Error('Image preview unavailable', { cause: rows.error });
  state.photos = (rows.data ?? [])
    .map(candidatePreview)
    .filter((photo): photo is PreviewImage => !!photo);
  if (state.mode === 'manual' && choice?.image) {
    const manual = await db
      .from('image_candidates')
      .select('*')
      .eq('gallery_key', key)
      .eq('id', choice.image)
      .maybeSingle();
    if (manual.error) throw new Error('Image preview unavailable', { cause: manual.error });
    const selected = manual.data
      ? candidatePreview(manual.data)
      : (await imageRows([choice.image], true))[0];
    if (selected)
      state.photos = [selected, ...state.photos.filter((photo) => photo.id !== selected.id)];
  }
  return state;
}
export async function selectDevelopmentPreview(
  scope: ImageScope,
  ref: ImageReference,
  mode: NonNullable<ImageResolution['previewMode']>,
  image: string | null,
  revision: number,
) {
  if (!canPreviewImages(scope))
    throw new TripRequestError(
      403,
      'forbidden',
      'La prévisualisation est réservée aux administrateurs en développement.',
    );
  await imageTarget(scope, ref);
  const gallery = await ensureImageGallery(ref);
  const result = await serviceDatabase().rpc('set_image_preview', {
    p_actor: scope.actor,
    p_key: gallery.cache_key,
    p_mode: mode,
    p_image: image,
    p_revision: revision,
    p_visit: ref.visit ?? null,
  });
  if (result.error) {
    if (result.error.code === '40001')
      throw new TripRequestError(409, 'conflict', 'Cet aperçu a été modifié dans un autre onglet.');
    throw new TripRequestError(
      422,
      'context',
      'Cette photographie ne peut pas être prévisualisée.',
    );
  }
  return readImages(scope, ref);
}
