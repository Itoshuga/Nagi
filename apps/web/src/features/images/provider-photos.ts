import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { retrieveMapboxDetailsData } from '@/features/integrations/mapbox/server';
import { mapboxConfig } from '@/features/integrations/mapbox/config';
import { mapboxPhotoPolicy } from './config';
import { imageDiagnostic } from './diagnostics';
import { distanceKm, httpsUrl } from './metadata';
import { matchPlaceName, conflictsPlaceCategory } from './matching';
import type { ImageContext, ImageReference, ProviderImage } from './model';

export type ProviderPhotoResult = {
  selected: ProviderImage | null;
  candidates: ProviderImage[];
  reason: string;
};
export interface ProviderPhotoAdapter {
  provider: ProviderImage['provider'];
  resolve(
    actor: string,
    reference: ImageReference,
    context: ImageContext,
  ): Promise<ProviderPhotoResult>;
}
const empty = (reason: string): ProviderPhotoResult => ({ selected: null, candidates: [], reason });
const detailsSchema = z.object({
  mapbox_id: z.string(),
  name: z.string().max(300),
  website: z.string().nullish(),
  permanently_closed: z.boolean().nullish(),
  status: z.string().nullish(),
  primary_category: z.string().nullish(),
  categories: z.array(z.string()).nullish(),
  coordinates: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .optional(),
  photos: z
    .array(
      z.object({
        url: z.string().max(4096),
        width: z.number().positive().nullish(),
        height: z.number().positive().nullish(),
        source: z.string().max(200).nullish(),
      }),
    )
    .max(100)
    .nullish(),
});
export function mapboxPhotosAllowed(reference: ImageReference) {
  return (
    reference.source === 'mapbox' &&
    mapboxPhotoPolicy().enabled &&
    (!!reference.visit || reference.priority === 'selected' || mapboxPhotoPolicy().visibleResults)
  );
}
/** Normalizes an authorized response without assigning open licences or downloading images. */
export function mapboxPhotoCandidates(
  raw: unknown,
  id: string,
  context: ImageContext,
): ProviderPhotoResult {
  const policy = mapboxPhotoPolicy();
  if (!policy.enabled) return empty('mapbox:rights-not-configured');
  const parsed = detailsSchema.safeParse(raw);
  if (!parsed.success) return empty('mapbox:invalid-response');
  const data = parsed.data;
  if (
    data.mapbox_id !== id ||
    conflictsPlaceCategory(
      context.category,
      [data.name, data.primary_category, ...(data.categories ?? [])].filter(Boolean).join(' '),
    ) ||
    matchPlaceName(context, data.name).rank < 2 ||
    (data.coordinates &&
      context.latitude !== undefined &&
      context.longitude !== undefined &&
      distanceKm(context as { latitude: number; longitude: number }, data.coordinates) > 0.25)
  )
    return empty('mapbox:uncertain-match');
  if (data.permanently_closed || data.status === 'inactive') return empty('mapbox:closed');
  if (!data.photos?.length) return empty('mapbox:no-photos');
  const ranked: { photo: ProviderImage; rank: number }[] = [];
  const seen = new Set<string>();
  for (const row of data.photos) {
    const url = httpsUrl(row.url);
    if (
      !url ||
      !policy.origins.includes(new URL(url).origin) ||
      seen.has(url) ||
      (mapboxConfig().token && url.includes(mapboxConfig().token!))
    )
      continue;
    let name: string;
    try {
      name = decodeURIComponent(new URL(url).pathname).toLowerCase();
    } catch {
      continue;
    }
    if (
      /\.(?:svg|gif|pdf)$|logo|icon|menu|product|produit|flyer|banner|promo|affiche|carte-des/i.test(
        name,
      ) ||
      (row.width && row.width < 240) ||
      (row.height && row.height < 160)
    )
      continue;
    seen.add(url);
    const rank =
      /exterior|facade|front|building|batisse|entrance|interior|store|salle|temple|monument/.test(
        name,
      )
        ? 2
        : 0;
    const source = httpsUrl(data.website) ?? new URL(url).origin + '/';
    ranked.push({
      rank,
      photo: {
        id:
          'mapbox-photo:' +
          createHash('sha256')
            .update(id + ':' + url)
            .digest('hex')
            .slice(0, 32),
        provider: 'mapbox',
        sourceId: id,
        sourceUrl: source,
        imageUrl: url,
        thumbnailUrl: url,
        previewUrl: url,
        title: data.name,
        ...(row.width ? { width: row.width } : {}),
        ...(row.height ? { height: row.height } : {}),
        attribution: `Source : ${new URL(source).hostname} · Fournie via Mapbox Places`,
        usageRights: 'provider-restricted',
        persistence: 'session',
        expiresAt: new Date(Date.now() + policy.sessionSeconds * 1000).toISOString(),
        cropAllowed: policy.cropAllowed,
      },
    });
  }
  ranked.sort(
    (a, b) =>
      b.rank - a.rank ||
      (b.photo.width ?? 0) * (b.photo.height ?? 0) - (a.photo.width ?? 0) * (a.photo.height ?? 0),
  );
  const candidates = ranked.slice(0, 6).map(({ photo }) => photo);
  // A confirmed venue ID is strong evidence, but unlabelled assets remain manual proposals.
  const selected =
    ranked[0]?.rank &&
    data.coordinates &&
    context.latitude !== undefined &&
    context.longitude !== undefined
      ? candidates[0]!
      : null;
  return {
    selected,
    candidates,
    reason: selected
      ? 'mapbox:venue-photo'
      : candidates.length
        ? 'mapbox:manual-confirmation'
        : 'mapbox:unusable-photos',
  };
}
const pending = new Map<string, Promise<ProviderPhotoResult>>();
const misses = new Map<string, number>();
export const mapboxPhotoAdapter: ProviderPhotoAdapter = {
  provider: 'mapbox',
  async resolve(actor, reference, context) {
    if (!mapboxPhotosAllowed(reference)) return empty('mapbox:disabled-or-not-prioritized');
    if (context.latitude === undefined || context.longitude === undefined)
      return empty('mapbox:location-pending');
    const key = createHash('sha256')
      .update(actor + ':' + reference.id)
      .digest('hex');
    if ((misses.get(key) ?? 0) > Date.now()) return empty('mapbox:recently-attempted');
    let task = pending.get(key);
    if (task) return task;
    task = (async () => {
      const start = performance.now();
      let result: ProviderPhotoResult;
      try {
        const raw = await retrieveMapboxDetailsData(actor, reference.id);
        result = mapboxPhotoCandidates(raw, reference.id, context);
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code) : 'network';
        const known = [
          'quota',
          'provider_access',
          'unavailable',
          'network',
          'configuration',
          'disabled',
          'response',
          'unsupported_id',
        ];
        result = empty('mapbox:' + (known.includes(code) ? code : 'network'));
      }
      if (!result.selected) {
        if (misses.size >= 2048) misses.delete(misses.keys().next().value!);
        misses.set(key, Date.now() + 5 * 60 * 1000);
      }
      imageDiagnostic('mapbox', result.reason, performance.now() - start, result.candidates.length);
      return result;
    })().finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  },
};
