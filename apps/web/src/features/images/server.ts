import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findCatalogEntry, type Database, type Json } from '@nagi/database';
import { serviceDatabase } from '@/lib/supabase/server';
import { TripRequestError } from '@/features/trips/sync-server';
import { readImageProof } from './proof';
import { ImageHttp, ImageProviderError } from './http';
import { commonsFiles, resolveImages } from './providers';
import { imageRequestConcurrency, imageResolverEnabled, serperImagesConfig } from './config';
import { ensureImageGallery, indexImageGallery, approvedDiscoveryPhotos } from './discovery';
import { imageDiagnostic } from './diagnostics';
import { readDevelopmentPreview } from './preview';
import { conflictsPlaceCategory } from './matching';
import {
  emptyResolution,
  imageMatcherRevision,
  imageContextSchema,
  isOpenImage,
  type ImageContext,
  type ImageReference,
  type ImageResolution,
  type OpenImage,
  type PersistentImage,
} from './model';

export type ImageScope = {
  db: SupabaseClient<Database>;
  actor: string;
  trip?: string;
  admin?: boolean;
};
export type ImageTarget = {
  context: ImageContext | null;
  entry?: string;
  visit?: string;
  uploaded?: string | null;
  resourceKind?: NonNullable<ImageReference['kind']>;
  resourceId?: string;
  galleryKey?: string;
};
type Scope = ImageScope;
type Target = ImageTarget;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const nameAliases = (name: string) => {
  const native = name.match(/[（(]([^）)]+)[）)]/)?.[1];
  return [name.replace(/[（(][^）)]*[）)]/g, ' ').trim(), ...(native ? [native] : [])].filter(
    (value) => value && value !== name,
  );
};
export const imageCacheKey = (reference: ImageReference, search?: string) =>
  hash(
    reference.source +
      ':' +
      (reference.kind && reference.kind !== 'entry' ? reference.kind + ':' : '') +
      reference.id +
      (search ? ':manual:' + search.toLowerCase() : ''),
  );
function failure(error: unknown) {
  if (error) throw new Error('Image database unavailable', { cause: error });
}
export async function imageTarget(scope: Scope, ref: ImageReference): Promise<Target> {
  if (ref.kind && ref.kind !== 'entry') {
    if (ref.source !== 'nagi' || ref.visit)
      throw new TripRequestError(422, 'context', 'Référence de photographie invalide.');
    const table = {
      country: 'countries',
      city: 'cities',
      neighborhood: 'neighborhoods',
      category: 'categories',
    }[ref.kind] as 'countries' | 'cities' | 'neighborhoods' | 'categories';
    const result = await scope.db.from(table).select('*').eq('id', ref.id).maybeSingle();
    failure(result.error);
    const row = result.data;
    if (!row) throw new TripRequestError(404, 'forbidden', 'Fiche inaccessible.');
    let country: string | undefined, city: string | undefined;
    if ('country_id' in row) {
      const parent = await scope.db
        .from('countries')
        .select('name')
        .eq('id', row.country_id)
        .maybeSingle();
      failure(parent.error);
      country = parent.data?.name;
    }
    if ('city_id' in row) {
      const parent = await scope.db
        .from('cities')
        .select('name,country:countries(name)')
        .eq('id', row.city_id)
        .maybeSingle();
      failure(parent.error);
      city = parent.data?.name;
      country = parent.data?.country?.name;
    }
    return {
      resourceKind: ref.kind,
      resourceId: row.id,
      uploaded: 'cover_image_url' in row ? row.cover_image_url : undefined,
      context: imageContextSchema.parse({
        name: row.name,
        aliases: nameAliases(row.name),
        country: ref.kind === 'country' ? row.name : country,
        city,
        category: ref.kind,
        latitude: 'latitude' in row ? (row.latitude ?? undefined) : undefined,
        longitude: 'longitude' in row ? (row.longitude ?? undefined) : undefined,
      }),
    };
  }
  if (ref.visit) {
    if (!scope.trip)
      throw new TripRequestError(403, 'forbidden', 'Ce choix appartient à un voyage.');
    const { data: allowed, error } = await scope.db.rpc('can_read_image_visit', {
      p_trip: scope.trip,
      p_visit: ref.visit,
    });
    failure(error);
    if (!allowed) throw new TripRequestError(403, 'forbidden', 'Étape inaccessible.');
    const db = serviceDatabase();
    const main = await db
      .from('trip_items')
      .select('*')
      .eq('trip_id', scope.trip)
      .eq('id', ref.visit)
      .maybeSingle();
    failure(main.error);
    let row = main.data;
    if (!row) {
      const stop = await db
        .from('trip_item_stops')
        .select('*,parent:trip_items!inner(trip_id)')
        .eq('id', ref.visit)
        .eq('parent.trip_id', scope.trip)
        .maybeSingle();
      failure(stop.error);
      row = stop.data as unknown as typeof row;
    }
    if (
      !row ||
      (row.source ?? 'nagi') !== ref.source ||
      (ref.source === 'mapbox'
        ? row.external_place_id
        : ref.source === 'nagi'
          ? row.entry_id
          : row.id) !== ref.id
    )
      throw new TripRequestError(409, 'conflict', 'Le lieu de cette étape a changé.');
    if (ref.source === 'custom')
      return {
        visit: ref.visit,
        context: imageContextSchema.parse({
          name: row.custom_title,
          latitude: row.custom_latitude ?? undefined,
          longitude: row.custom_longitude ?? undefined,
        }),
      };
  }
  if (ref.source === 'nagi') {
    const entry = await findCatalogEntry(scope.db, ref.id);
    if (!entry) throw new TripRequestError(404, 'forbidden', 'Fiche inaccessible.');
    return {
      visit: ref.visit,
      entry: entry.id,
      uploaded: entry.cover_image_url,
      context: imageContextSchema.parse({
        name: entry.title,
        aliases: nameAliases(entry.title),
        country: entry.country?.name,
        city: entry.city?.name,
        neighborhood: entry.neighborhood?.name,
        category: entry.category?.name,
        latitude: entry.latitude ?? undefined,
        longitude: entry.longitude ?? undefined,
      }),
    };
  }
  if (ref.source === 'mapbox' && scope.trip) {
    const context = readImageProof(ref.proof, scope.actor, scope.trip, ref.id);
    // Saved occurrences can read the cache before Mapbox presentation arrives.
    if (!context && !ref.visit)
      throw new TripRequestError(422, 'context', 'Recherchez ce lieu pour confirmer son contexte.');
    return { context, visit: ref.visit, galleryKey: imageCacheKey(ref) };
  }
  throw new TripRequestError(403, 'forbidden', 'Lieu inaccessible.');
}
export async function imageRows(ids: string[], includeStale = false): Promise<PersistentImage[]> {
  if (!ids.length) return [];
  let query = serviceDatabase()
    .from('external_images')
    .select('metadata')
    .in('id', [...new Set(ids)])
    .eq('available', true);
  if (!includeStale)
    query = query.or(
      'provider.eq.serper,verified_at.gt.' + new Date(Date.now() - 30 * 86400000).toISOString(),
    );
  const { data, error } = await query;
  failure(error);
  return (data ?? []).map((v) => v.metadata as unknown as PersistentImage);
}
async function cached(
  key: string,
  coordinates = false,
  context?: ImageContext | null,
): Promise<ImageResolution<OpenImage> | null> {
  const { data, error } = await serviceDatabase()
    .from('image_resolution_cache')
    .select('*')
    .eq('cache_key', key)
    .maybeSingle();
  failure(error);
  if (!data || Date.parse(data.expires_at) <= Date.now()) return null;
  // Re-evaluate older misses/ambiguous matches once with the broader matcher.
  // Keep valid positive results and every explicit member selection intact.
  if (data.confidence !== 'high' && !data.reasons.includes(imageMatcherRevision)) {
    if (!data.lease_until || Date.parse(data.lease_until) <= Date.now()) {
      const reset = await serviceDatabase()
        .from('image_resolution_cache')
        .update({ expires_at: new Date(0).toISOString() })
        .eq('cache_key', key)
        .eq('expires_at', data.expires_at);
      failure(reset.error);
    }
    return null;
  }
  if (coordinates && !data.coordinate_evidence && data.confidence !== 'high') return null;
  const photos = (await imageRows(data.candidates)).filter(isOpenImage);
  const selected = photos.find((photo) => photo.id === data.selected);
  if (
    selected &&
    conflictsPlaceCategory(context?.category, selected.title + ' ' + selected.sourceId)
  ) {
    if (!data.lease_until || Date.parse(data.lease_until) <= Date.now()) {
      const reset = await serviceDatabase()
        .from('image_resolution_cache')
        .update({ expires_at: new Date(0).toISOString() })
        .eq('cache_key', key)
        .eq('expires_at', data.expires_at);
      failure(reset.error);
    }
    return null;
  }
  return {
    selected: photos.find((p) => p.id === data.selected) ?? null,
    candidates: photos,
    confidence: data.confidence as ImageResolution['confidence'],
    reasons: data.reasons,
    entity: data.entity ?? undefined,
    status: data.reasons.includes('provider-unavailable') ? 'unavailable' : 'ready',
  };
}
async function assignment(scope: Scope, target: Target) {
  let query = scope.db.from('place_image_assignments').select('*');
  if (target.visit && scope.trip)
    query = query.eq('trip_id', scope.trip).eq('visit_id', target.visit);
  else if (target.entry) query = query.eq('entry_id', target.entry);
  else if (target.resourceId && target.resourceKind) {
    const column = {
      entry: 'entry_id',
      country: 'country_id',
      city: 'city_id',
      neighborhood: 'neighborhood_id',
      category: 'category_id',
    }[target.resourceKind];
    query = query.eq(column, target.resourceId);
  } else if (target.galleryKey)
    query = serviceDatabase()
      .from('place_image_assignments')
      .select('*')
      .eq('gallery_key', target.galleryKey);
  else return null;
  const { data, error } = await query.maybeSingle();
  failure(error);
  return data;
}
export async function imageSelectionId(scope: Scope, target: Target): Promise<string | undefined> {
  const selected = await assignment(scope, target);
  if (selected?.mode === 'manual') return selected.image_id ?? undefined;
  if (selected?.mode === 'fallback') return;
  if (target.visit && (target.entry || target.galleryKey))
    return imageSelectionId({ ...scope, trip: undefined }, { ...target, visit: undefined });
}
async function reverify(photo: OpenImage, force = false): Promise<OpenImage | null> {
  if (!force && Date.parse(photo.verifiedAt) > Date.now() - 14 * 86400000) return photo;
  try {
    const current = (await commonsFiles(new ImageHttp(), [photo.sourceId], photo.provider))[0];
    if (
      !current ||
      current.license !== photo.license ||
      current.licenseVersion !== photo.licenseVersion
    ) {
      const result = await serviceDatabase()
        .from('external_images')
        .update({ available: false })
        .eq('id', photo.id);
      failure(result.error);
      return null;
    }
    await savePhotos([current]);
    return current;
  } catch {
    return null;
  } // An unverifiable old manual image is not presented as verified.
}
async function decorated(
  scope: Scope,
  target: Target,
  base: ImageResolution,
  preloaded?: Awaited<ReturnType<typeof assignment>>,
): Promise<ImageResolution> {
  const chosen = preloaded === undefined ? await assignment(scope, target) : preloaded;
  if (chosen?.mode === 'fallback')
    return {
      ...base,
      selected: null,
      coverHidden: true,
      mode: 'fallback',
      revision: chosen.revision,
    };
  if (chosen?.mode === 'manual') {
    const stored = chosen.image_id ? (await imageRows([chosen.image_id], true))[0] : null;
    const photo = stored
      ? isOpenImage(stored)
        ? await verifyWithLease(scope, stored)
        : stored
      : null;
    return {
      ...base,
      selected: photo,
      mode: 'manual',
      coverHidden: !photo,
      revision: chosen.revision,
      reasons: photo ? ['member-selection', 'license-verified'] : ['selected-image-unavailable'],
    };
  }
  if (target.visit && (target.entry || target.galleryKey)) {
    const global = await decorated(
      { ...scope, trip: undefined },
      { ...target, visit: undefined },
      base,
    );
    return { ...global, mode: 'automatic', revision: chosen?.revision ?? 0 };
  }
  // An uploaded cover keeps priority over any automatic resolver result.
  return {
    ...base,
    selected: target.uploaded ? null : base.selected,
    mode: 'automatic',
    revision: chosen?.revision ?? 0,
  };
}
async function savePhotos(photos: OpenImage[]) {
  // Defense in depth: restricted provider assets never enter the open-image tables.
  photos = photos.filter(isOpenImage);
  if (!photos.length) return;
  const result = await serviceDatabase()
    .from('external_images')
    .upsert(
      photos.map((photo) => ({
        id: photo.id,
        provider: photo.provider,
        source_id: photo.sourceId,
        metadata: photo as unknown as Json,
        verified_at: photo.verifiedAt,
        available: true,
      })),
      { onConflict: 'id' },
    );
  failure(result.error);
}
const pending = new Map<string, Promise<ImageResolution<OpenImage>>>();
export async function readImages(
  scope: Scope,
  ref: ImageReference,
  resolve = false,
  search?: string,
  browse = false,
) {
  const target = await imageTarget(scope, ref);
  let preview = await readDevelopmentPreview(scope, ref);
  const previewResult = () => ({
    ...emptyResolution,
    selected: preview?.mode === 'fallback' ? null : (preview?.photos[0] ?? null),
    candidates: preview?.photos ?? [],
    mode:
      preview?.mode === 'manual'
        ? ('manual' as const)
        : preview?.mode === 'fallback'
          ? ('fallback' as const)
          : ('automatic' as const),
    coverHidden: preview?.mode === 'fallback',
    reasons: ['development-preview'],
    previewEnabled: true,
    previewRevision: preview?.revision ?? 0,
    previewMode: preview?.mode,
    maxConcurrentRequests: imageRequestConcurrency(),
  });
  if (
    preview &&
    (preview.mode === 'fallback' || (preview.mode === 'manual' && preview.photos.length))
  )
    return previewResult();
  if (browse) search ??= target.context?.name;
  const key = imageCacheKey(ref, search);
  const coordinates =
    target.context?.latitude !== undefined && target.context?.longitude !== undefined;
  let result = await cached(key, coordinates, target.context);
  const chosen = await assignment(scope, target);
  const needsAutomatic = !chosen || chosen.mode === 'automatic';
  const existing = await decorated(scope, target, result ?? emptyResolution, chosen);
  const decorate = async (base: ImageResolution) => ({
    ...(await decorated(scope, target, base, chosen)),
    maxConcurrentRequests: imageRequestConcurrency(),
    ...(preview
      ? { previewEnabled: true, previewRevision: preview.revision, previewMode: preview.mode }
      : {}),
  });
  const explicitCover =
    !needsAutomatic ||
    target.uploaded ||
    existing.coverHidden ||
    existing.reasons.includes('member-selection');
  if (preview && preview.mode !== 'published' && !explicitCover && preview.photos.length)
    return previewResult();
  if (!search && (!needsAutomatic || existing.selected || existing.coverHidden || target.uploaded))
    return {
      ...existing,
      status: 'ready' as const,
      maxConcurrentRequests: imageRequestConcurrency(),
      ...(preview
        ? { previewEnabled: true, previewRevision: preview.revision, previewMode: preview.mode }
        : {}),
    };
  if (!imageResolverEnabled())
    return decorate({ ...(result ?? emptyResolution), reasons: ['resolver-disabled'] });
  if (serperImagesConfig().enabled) {
    try {
      const discoveryState = async () => {
        const known = await serviceDatabase()
          .from('image_galleries')
          .select('state,lease_until,searched_at,stop_reason,next_retry_at')
          .eq('cache_key', imageCacheKey(ref))
          .maybeSingle();
        failure(known.error);
        return known.data;
      };
      const isWaiting = (known: Awaited<ReturnType<typeof discoveryState>>) =>
        !!known &&
        ((known.state === 'indexing' &&
          !!known.lease_until &&
          Date.parse(known.lease_until) > Date.now()) ||
          (known.stop_reason === 'busy' && !known.searched_at));
      const waiting = () =>
        decorate({
          ...emptyResolution,
          status: 'pending',
          retryAfter: 1,
          reasons: ['serper:waiting'],
        });
      const approved = await approvedDiscoveryPhotos(ref);
      if (approved.length)
        return decorate({
          ...emptyResolution,
          selected: approved[0]!,
          candidates: approved,
          confidence: 'high',
          reasons: ['serper:reviewed-selection'],
        });
      if (!resolve && (ref.priority === 'selected' || ref.visit) && target.context) {
        const known = await discoveryState();
        if (isWaiting(known)) return waiting();
        if (
          !known ||
          known.state === 'idle' ||
          (!known.searched_at &&
            !!known.next_retry_at &&
            Date.parse(known.next_retry_at) <= Date.now() &&
            ['budget', 'global_daily_budget', 'user_daily_budget', 'user_minute_budget'].includes(
              known.stop_reason ?? '',
            ))
        )
          return decorate({
            ...emptyResolution,
            status: 'pending',
            reasons: ['serper:discovery-pending'],
          });
      }
      if (resolve && target.context && (ref.priority === 'selected' || ref.visit)) {
        await indexImageGallery(scope, ref, target, { automatic: true });
        if (preview && preview.mode !== 'published' && !explicitCover) {
          preview = await readDevelopmentPreview(scope, ref);
          if (preview?.photos.length) return previewResult();
        }
        const found = await approvedDiscoveryPhotos(ref);
        if (found.length)
          return decorate({
            ...emptyResolution,
            selected: found[0]!,
            candidates: found,
            confidence: 'high',
            reasons: ['serper:verified-photo'],
          });
        if (isWaiting(await discoveryState())) return waiting();
      }
    } catch {
      imageDiagnostic('serper', 'unavailable');
    }
  }
  // Cache reads and uploads do not cause external calls. Manual browsing is explicit.
  if (
    !result &&
    resolve &&
    target.context &&
    (search || (needsAutomatic && !target.uploaded && !existing.coverHidden && !existing.selected))
  ) {
    const taskKey = key + (coordinates ? ':coordinates' : ':context');
    let task = pending.get(taskKey);
    if (!task) {
      task = resolveAndCache(scope, key, target.context, search).finally(() =>
        pending.delete(taskKey),
      );
      pending.set(taskKey, task);
    }
    result = await task;
  }
  const base = result ?? {
    ...emptyResolution,
    status:
      !resolve && !target.uploaded && needsAutomatic && !existing.coverHidden && !existing.selected
        ? ('pending' as const)
        : ('ready' as const),
    reasons: !target.context ? ['context-pending'] : [],
  };
  const seen = new Set<string>();
  return decorate({
    ...base,
    candidates: [...base.candidates]
      .filter((photo) => {
        if (seen.has(photo.imageUrl)) return false;
        seen.add(photo.imageUrl);
        return true;
      })
      .slice(0, 6),
    reasons: base.reasons,
    galleryAvailable: true,
  });
}
async function resolveAndCache(
  scope: Scope,
  key: string,
  context: ImageContext,
  search?: string,
): Promise<ImageResolution<OpenImage>> {
  const db = serviceDatabase();
  const coordinates = context.latitude !== undefined && context.longitude !== undefined;
  const reserved = await db.rpc('reserve_image_resolution', {
    p_actor: scope.actor,
    p_key: key,
    p_coordinates: coordinates,
  });
  failure(reserved.error);
  if (!reserved.data)
    return (
      (await cached(key, coordinates)) ?? { ...emptyResolution, status: 'pending', retryAfter: 8 }
    );
  const lease = reserved.data;
  try {
    const started = performance.now();
    const result = await resolveImages(context, {
      search,
      http: new ImageHttp(AbortSignal.timeout(70000)),
      openverse: async () => {
        const quota = await db.rpc('reserve_image_resolution', {
          p_actor: scope.actor,
          p_key: key,
          p_openverse: true,
        });
        failure(quota.error);
        return !!quota.data;
      },
    });
    imageDiagnostic(
      result.selected?.provider ?? 'open-images',
      result.confidence,
      performance.now() - started,
      result.candidates.length,
    );
    result.reasons = [...result.reasons, imageMatcherRevision];
    await savePhotos(result.candidates);
    const ttl = result.confidence === 'high' ? 14 : result.candidates.length ? 7 : 1;
    const update = await db
      .from('image_resolution_cache')
      .update({
        selected: result.selected?.id ?? null,
        candidates: result.candidates.map((v) => v.id),
        confidence: result.confidence,
        coordinate_evidence: coordinates,
        reasons: result.reasons,
        entity: result.entity ?? null,
        expires_at: new Date(Date.now() + ttl * 86400000).toISOString(),
        lease_id: null,
        lease_until: null,
      })
      .eq('cache_key', key)
      .eq('lease_id', lease);
    failure(update.error);
    return result;
  } catch (error) {
    const retryAfter = error instanceof ImageProviderError ? error.retryAfter : 300;
    const update = await db
      .from('image_resolution_cache')
      .update({
        reasons: ['provider-unavailable', imageMatcherRevision],
        coordinate_evidence: coordinates,
        expires_at: new Date(Date.now() + Math.max(300, retryAfter) * 1000).toISOString(),
        lease_id: null,
        lease_until: null,
      })
      .eq('cache_key', key)
      .eq('lease_id', lease);
    failure(update.error);
    // Log only a reason code, never a Mapbox context, query, credential or URL.
    console.warn(
      'image_resolver_unavailable',
      error instanceof ImageProviderError ? error.code : 'temporary',
    );
    return {
      ...emptyResolution,
      status: 'unavailable',
      reasons: ['provider-unavailable'],
      retryAfter,
    };
  }
}
export async function selectImage(
  scope: Scope,
  ref: ImageReference,
  mode: 'automatic' | 'manual' | 'fallback',
  image: string | null,
  revision: number,
) {
  const target = await imageTarget(scope, ref);
  if (!target.visit && !scope.admin)
    throw new TripRequestError(
      403,
      'forbidden',
      'La photographie du catalogue est réservée aux administrateurs.',
    );
  if (!target.visit && !target.entry) {
    const gallery = await ensureImageGallery(ref);
    const result = await scope.db.rpc('set_catalog_image', {
      p_key: gallery.cache_key,
      p_mode: mode,
      p_image: image,
      p_revision: revision,
    });
    failure(result.error);
    return readImages(scope, ref);
  }
  const { error } = await scope.db.rpc('set_place_image', {
    p_entry: target.visit ? null : (target.entry ?? null),
    p_trip: target.visit ? (scope.trip ?? null) : null,
    p_visit: target.visit ?? null,
    p_mode: mode,
    p_image: image,
    p_revision: revision,
  });
  failure(error);
  return readImages(scope, ref);
}
export async function reportBrokenImage(scope: Scope, ref: ImageReference, id: string) {
  const result = await readImages(scope, ref);
  const photo = [result.selected, ...result.candidates].find((v) => v?.id === id);
  if (!photo) return;
  if (photo.provider === 'serper') {
    const db = serviceDatabase();
    const current = await db
      .from('image_candidates')
      .select('id,reports')
      .eq('gallery_key', imageCacheKey(ref))
      .eq('id', id)
      .maybeSingle();
    failure(current.error);
    if (current.data) {
      const changed = await db
        .from('image_candidates')
        .update(
          scope.admin
            ? { availability_status: 'unavailable' }
            : { reports: current.data.reports + 1 },
        )
        .eq('id', id);
      failure(changed.error);
      if (scope.admin) {
        const unavailable = await db
          .from('external_images')
          .update({ available: false })
          .eq('id', id)
          .eq('provider', 'serper');
        failure(unavailable.error);
      }
    }
    return;
  }
  if (!isOpenImage(photo)) return;
  await verifyWithLease(scope, photo, true);
}
const verifications = new Map<string, Promise<OpenImage | null>>();
async function verifyWithLease(
  scope: Scope,
  photo: OpenImage,
  force = false,
): Promise<OpenImage | null> {
  if (!force && Date.parse(photo.verifiedAt) > Date.now() - 14 * 86400000) return photo;
  let task = verifications.get(photo.id);
  if (task) return task;
  task = verifyLeased(scope, photo).finally(() => verifications.delete(photo.id));
  verifications.set(photo.id, task);
  return task;
}
async function verifyLeased(scope: Scope, photo: OpenImage) {
  // A client error is only a hint. Recheck official metadata under a shared
  // lease, then retire the image only if the server confirms the problem.
  const db = serviceDatabase(),
    key = hash('verification:' + photo.id);
  const lease = await db.rpc('reserve_image_resolution', { p_actor: scope.actor, p_key: key });
  failure(lease.error);
  if (!lease.data) {
    const latest = (await imageRows([photo.id], true))[0];
    return latest &&
      isOpenImage(latest) &&
      Date.parse(latest.verifiedAt) > Date.now() - 14 * 86400000
      ? latest
      : null;
  }
  const current = await reverify(photo, true);
  const update = await db
    .from('image_resolution_cache')
    .update({
      expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
      lease_id: null,
      lease_until: null,
    })
    .eq('cache_key', key)
    .eq('lease_id', lease.data);
  failure(update.error);
  return current;
}
