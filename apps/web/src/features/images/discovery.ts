import 'server-only';
import type { Json } from '@nagi/database';
import { serviceDatabase } from '@/lib/supabase/server';
import { TripRequestError } from '@/features/trips/sync-server';
import {
  imageCacheKey,
  imageRows,
  imageTarget,
  imageSelectionId,
  type ImageScope,
  type ImageTarget,
} from './server';
import { serperImagesConfig } from './config';
import { imageDigest, serperQueries, serperCandidates, serperImagePage } from './serper';
import { ImageProviderError } from './http';
import { canPreviewImages, candidatePreview, developmentPreviewChoice } from './preview';
import { httpsUrl, openLicense } from './metadata';
import {
  isOpenImage,
  imageSearchIssue,
  type DiscoveryMetadata,
  type ImageReference,
  type ImageGallery,
  type DiscoveryCandidate,
  type ImageRights,
} from './model';

function checked(error: unknown) {
  if (error) throw new Error('Image discovery database unavailable', { cause: error });
}
export async function ensureImageGallery(ref: ImageReference) {
  const db = serviceDatabase(),
    key = imageCacheKey(ref);
  const current = await db.from('image_galleries').select('*').eq('cache_key', key).maybeSingle();
  checked(current.error);
  if (current.data) return current.data;
  const created = await db.from('image_galleries').upsert(
    {
      cache_key: key,
      place_source: ref.source,
      place_kind: ref.kind ?? 'entry',
      place_id: ref.id,
      page_limit: serperImagesConfig().maxPages,
    },
    { onConflict: 'cache_key', ignoreDuplicates: true },
  );
  checked(created.error);
  const result = await db.from('image_galleries').select('*').eq('cache_key', key).single();
  checked(result.error);
  if (!result.data) throw new Error('Image gallery missing');
  return result.data;
}
async function galleryEditor(scope: ImageScope, ref: ImageReference) {
  const target = await imageTarget(scope, ref);
  if (scope.admin) return target;
  if (!scope.trip)
    throw new TripRequestError(403, 'forbidden', 'La galerie est réservée aux administrateurs.');
  const permission = await scope.db.rpc('can_edit_guild_trip', { p_trip_id: scope.trip });
  checked(permission.error);
  if (!permission.data)
    throw new TripRequestError(
      403,
      'forbidden',
      'Vous ne pouvez pas modifier les photographies de ce voyage.',
    );
  return target;
}
export async function approvedDiscoveryPhotos(ref: ImageReference) {
  const result = await serviceDatabase()
    .from('image_candidates')
    .select('id,photo_id')
    .eq('gallery_key', imageCacheKey(ref))
    .in('rights_status', ['auto_approved', 'open_license', 'permission_granted'])
    .neq('availability_status', 'unavailable')
    .eq('is_excluded', false)
    .gte('relevance', 200)
    .order('relevance', { ascending: false })
    .order('id')
    .limit(6);
  checked(result.error);
  return imageRows((result.data ?? []).map((row) => row.photo_id ?? row.id));
}
type IndexOptions = {
  automatic?: boolean;
  continue?: boolean;
  refresh?: boolean;
  signal?: AbortSignal;
};
const pending = new Map<string, Promise<void>>();
export async function indexImageGallery(
  scope: ImageScope,
  ref: ImageReference,
  target: ImageTarget,
  options: IndexOptions = {},
) {
  const config = serperImagesConfig();
  if (!config.enabled || !target.context || options.signal?.aborted) return;
  const gallery = await ensureImageGallery(ref);
  // Every attempt is permanent, including empty and interrupted searches.
  if (gallery.searched_at || gallery.pages > 0) return;
  const key = gallery.cache_key;
  let task = pending.get(key);
  if (task) return task;
  task = (async () => {
    const queries = serperQueries(target.context!, ref.kind);
    const parameters = {
      p_actor: scope.actor,
      p_key: key,
      p_query_hash: imageDigest(JSON.stringify(queries)),
      p_pages: config.maxPages,
      p_total_pages: config.maxTotalPages,
      p_concurrent: config.concurrency,
      p_global_day: config.globalDaily,
      p_user_day: config.userDaily,
      p_user_minute: config.userMinute,
      p_continue: false,
      p_refresh: false,
    };
    let reserved = await serviceDatabase().rpc('reserve_image_discovery', parameters);
    // Waiting for the global slot only repeats the free SQL reservation. A
    // successful reservation still makes exactly one ten-image provider call.
    for (
      let attempt = 0;
      !reserved.error &&
      (reserved.data as { reason?: string } | null)?.reason === 'busy' &&
      attempt < 24;
      attempt++
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      if (options.signal?.aborted) return;
      reserved = await serviceDatabase().rpc('reserve_image_discovery', parameters);
    }
    checked(reserved.error);
    const lease = reserved.data as {
      lease?: string;
      page?: number;
      variant?: number;
      state?: string;
      reason?: string;
      retryAt?: string;
    } | null;
    if (!lease?.lease) {
      if (lease?.reason) {
        const update = await serviceDatabase()
          .from('image_galleries')
          .update({
            state: lease.state === 'complete' ? 'complete' : 'limited',
            stop_reason: lease.reason,
            next_retry_at: lease.retryAt ?? null,
          })
          .eq('cache_key', key)
          .is('lease_id', null);
        checked(update.error);
      }
      return;
    }
    try {
      const query = queries[0];
      if (!query) throw new ImageProviderError('invalid_response');
      // Once reserved, finish and cache this one response even if its viewer
      // closes the modal. Aborting an already-billed request would lose photos.
      const raw = await serperImagePage(query, 1);
      const items = serperCandidates(raw, key, target.context!, ref.kind);
      const credits =
        typeof raw.credits === 'number' && Number.isFinite(raw.credits) && raw.credits >= 0
          ? raw.credits
          : 0;
      const finished = await serviceDatabase().rpc('finish_image_discovery', {
        p_key: key,
        p_lease: lease.lease,
        p_items: items as unknown as Json,
        p_credits: credits,
        p_variant_count: 1,
      });
      checked(finished.error);
    } catch (error) {
      const code = error instanceof ImageProviderError ? error.code : 'network';
      const finished = await serviceDatabase().rpc('finish_image_discovery', {
        p_key: key,
        p_lease: lease.lease,
        p_error: code,
        p_retry: error instanceof ImageProviderError ? error.retryAfter : 60,
      });
      checked(finished.error);
    }
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
export async function readImageGallery(
  scope: ImageScope,
  ref: ImageReference,
  _offset = 0,
  filter = '',
): Promise<ImageGallery> {
  const target = await galleryEditor(scope, ref);
  const gallery = await ensureImageGallery(ref);
  const config = serperImagesConfig();
  const attempted = !!gallery.searched_at || gallery.pages > 0;
  const retryAt = gallery.next_retry_at ?? undefined;
  const expiredNotice =
    !!retryAt &&
    Date.parse(retryAt) <= Date.now() &&
    [
      'budget',
      'global_daily_budget',
      'user_daily_budget',
      'user_minute_budget',
      'rate_limit',
    ].includes(gallery.stop_reason ?? '');
  const interrupted =
    gallery.state === 'indexing' &&
    (!gallery.lease_until || Date.parse(gallery.lease_until) <= Date.now());
  const reason = interrupted
    ? 'network'
    : expiredNotice
      ? undefined
      : (gallery.stop_reason ?? undefined);
  const choice = developmentPreviewChoice(scope, ref, gallery.development_previews)?.choice;
  const [first, stored, selected] = await Promise.all([
    serviceDatabase()
      .from('image_candidates')
      .select('*')
      .eq('gallery_key', gallery.cache_key)
      .order('relevance', { ascending: false })
      .order('id')
      .limit(10),
    serviceDatabase()
      .from('image_resolution_cache')
      .select('candidates')
      .eq('cache_key', imageCacheKey(ref))
      .maybeSingle(),
    choice?.mode === 'manual'
      ? Promise.resolve(choice.image)
      : choice?.mode === 'fallback'
        ? Promise.resolve(undefined)
        : imageSelectionId(scope, target),
  ]);
  checked(first.error);
  checked(stored.error);
  let pool = first.data ?? [];
  if (selected && !pool.some((row) => row.id === selected || row.photo_id === selected)) {
    const pinned = await serviceDatabase()
      .from('image_candidates')
      .select('*')
      .eq('gallery_key', gallery.cache_key)
      .or('id.eq.' + selected + ',photo_id.eq.' + selected)
      .order('relevance', { ascending: false })
      .limit(1);
    checked(pinned.error);
    if (pinned.data?.[0]) pool = [pinned.data[0], ...pool].slice(0, 10);
  }
  const included = new Set(pool.flatMap((row) => [row.id, row.photo_id]));
  const [cachedFallbacks, current] = await Promise.all([
    imageRows(stored.data?.candidates ?? []),
    selected && !included.has(selected) ? imageRows([selected], true) : Promise.resolve([]),
  ]);
  if (current.length && pool.length === 10) pool = pool.slice(0, 9);
  const ids = new Set(pool.flatMap((row) => [row.id, row.photo_id]));
  const fallbackPool = [
    ...new Map(
      [...current, ...cachedFallbacks.filter(isOpenImage)]
        .filter((photo) => !ids.has(photo.id))
        .map((photo) => [photo.id, photo]),
    ).values(),
  ].slice(0, 10 - pool.length);
  const matches = (title: string) =>
    title.toLocaleLowerCase('fr').includes(filter.toLocaleLowerCase('fr'));
  const rows = pool.filter((row) => matches(row.title)),
    fallbacks = fallbackPool.filter((photo) => matches(photo.title));
  const photos = await imageRows(
    rows
      .filter(
        (row) =>
          ['auto_approved', 'open_license', 'permission_granted'].includes(row.rights_status) &&
          !row.is_excluded,
      )
      .map((row) => row.photo_id ?? row.id),
  );
  const hasPhotos = pool.length + fallbackPool.length > 0;
  const items: DiscoveryCandidate[] = rows.map((row) => ({
    id: row.id,
    metadata: row.metadata as unknown as DiscoveryMetadata,
    rightsStatus: row.rights_status as ImageRights,
    availability: row.availability_status as DiscoveryCandidate['availability'],
    excluded: row.is_excluded,
    creator: row.creator ?? undefined,
    license: row.license ?? undefined,
    licenseUrl: row.license_url ?? undefined,
    evidence: scope.admin ? (row.rights_evidence ?? undefined) : undefined,
    photo: photos.find((photo) => photo.id === (row.photo_id ?? row.id)),
    ...(canPreviewImages(scope) ? { preview: candidatePreview(row) } : {}),
    sources: Array.isArray(row.additional_sources)
      ? row.additional_sources.filter((value): value is string => typeof value === 'string')
      : [],
  }));
  return {
    items,
    total: items.length + fallbacks.length,
    offset: 0,
    hasMore: false,
    state: hasPhotos
      ? 'complete'
      : interrupted
        ? 'unavailable'
        : expiredNotice && !gallery.searched_at && gallery.pages === 0
          ? 'idle'
          : (gallery.state as ImageGallery['state']),
    stopReason: reason,
    pages: gallery.pages,
    credits: gallery.credits,
    canReview: !!scope.admin,
    ...(canPreviewImages(scope) ? { previewEnabled: true } : {}),
    nextRetryAt: expiredNotice ? undefined : retryAt,
    searchSize: config.pageSize,
    searchEnabled: config.enabled && !!target.context && !attempted && !hasPhotos,
    searchIssue: hasPhotos
      ? undefined
      : !target.context
        ? 'Le lieu n’est pas encore localisé. Ouvrez ses détails pour terminer son chargement.'
        : !config.enabled
          ? imageSearchIssue('configuration')
          : imageSearchIssue(reason),
    fallbacks,
  };
}
export async function indexGalleryRequest(
  scope: ImageScope,
  ref: ImageReference,
  options: IndexOptions,
) {
  const target = await galleryEditor(scope, ref);
  if (!target.context)
    throw new TripRequestError(
      422,
      'context',
      'Le lieu n’est pas encore localisé. Ouvrez ses détails pour terminer son chargement.',
    );
  await indexImageGallery(scope, ref, target, options);
  return readImageGallery(scope, ref);
}
export async function reviewImageCandidate(
  scope: ImageScope,
  ref: ImageReference,
  input: {
    image: string;
    rights: ImageRights;
    creator: string;
    license: string;
    licenseUrl: string;
    evidence: string;
    excluded: boolean;
  },
) {
  if (!scope.admin)
    throw new TripRequestError(
      403,
      'forbidden',
      'La vérification des droits est réservée aux administrateurs.',
    );
  await galleryEditor(scope, ref);
  const candidate = await serviceDatabase()
    .from('image_candidates')
    .select('id')
    .eq('id', input.image)
    .eq('gallery_key', imageCacheKey(ref))
    .maybeSingle();
  checked(candidate.error);
  if (!candidate.data) throw new TripRequestError(404, 'forbidden', 'Photographie inaccessible.');
  if (input.licenseUrl && !httpsUrl(input.licenseUrl))
    throw new TripRequestError(
      422,
      'context',
      'Le lien de licence doit être une URL HTTPS publique.',
    );
  if (
    input.rights === 'open_license' &&
    !openLicense(input.license, input.licenseUrl, input.creator)
  )
    throw new TripRequestError(
      422,
      'context',
      'Indiquez une licence ouverte compatible, son lien et l’auteur lorsque la licence l’exige.',
    );
  const result = await scope.db.rpc('review_image_candidate', {
    p_id: input.image,
    p_status: input.rights,
    p_creator: input.creator,
    p_license: input.license,
    p_license_url: input.licenseUrl,
    p_evidence: input.evidence,
    p_excluded: input.excluded,
  });
  checked(result.error);
  return readImageGallery(scope, ref);
}
export async function reportImageCandidate(scope: ImageScope, ref: ImageReference, id: string) {
  await galleryEditor(scope, ref);
  const candidate = await serviceDatabase()
    .from('image_candidates')
    .select('reports')
    .eq('id', id)
    .eq('gallery_key', imageCacheKey(ref))
    .maybeSingle();
  checked(candidate.error);
  if (candidate.data) {
    const result = await serviceDatabase()
      .from('image_candidates')
      .update({ reports: candidate.data.reports + 1 })
      .eq('id', id);
    checked(result.error);
  }
  return { ok: true };
}
