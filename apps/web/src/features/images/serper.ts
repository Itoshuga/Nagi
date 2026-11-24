import 'server-only';
import { createHash } from 'node:crypto';
import { serperImagesConfig } from './config';
import { httpsUrl, normalizeName } from './metadata';
import { imageJsonResponse, ImageProviderError, imageProviderSlot, retrySeconds } from './http';
import { imageDiagnostic } from './diagnostics';
import { matchPlaceName } from './matching';
import type { DiscoveryMetadata, ImageContext, ImageReference } from './model';

export const imageDigest = (value: string) => createHash('sha256').update(value).digest('hex');
export function canonicalImageUrl(raw: unknown) {
  const safe = httpsUrl(raw);
  if (!safe) return;
  const url = new URL(safe);
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid|dclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  // Preserve transformations, signatures and token parameters: they can identify different assets.
  return url.href;
}
export function imageCandidateId(key: string, urlKey: string) {
  const hex = imageDigest('serper:' + key + ':' + urlKey);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function serperQueries(context: ImageContext, kind: ImageReference['kind'] = 'entry') {
  const native = context.name.match(/[（(]([^）)]+)[）)]/)?.[1];
  const names = [
    context.name.replace(/[（(][^）)]*[）)]/g, ' ').trim(),
    ...context.aliases,
    ...(native ? [native] : []),
  ];
  const seen = new Set<string>();
  const japan = /japan|japon|日本/i.test(context.country ?? '');
  return names
    .filter(Boolean)
    .map((name) => {
      const q = [
        name,
        context.neighborhood,
        context.city,
        context.country,
        kind === 'country' ? 'landscape photography' : undefined,
      ]
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index)
        .join(' ')
        .slice(0, 500);
      return {
        q,
        gl: japan ? 'jp' : /france/i.test(context.country ?? '') ? 'fr' : 'us',
        hl: /[\u3040-\u30ff\u3400-\u9fff]/u.test(name) ? 'ja' : 'en',
      };
    })
    .filter((query) => {
      const key = normalizeName(query.q);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}
const positive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
const label = (value: unknown, max = 1000) =>
  typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').slice(0, max) : undefined;
export function serperCandidates(
  raw: unknown,
  key: string,
  context: ImageContext,
  kind: ImageReference['kind'] = 'entry',
) {
  const values =
    raw && typeof raw === 'object' && 'images' in raw && Array.isArray(raw.images)
      ? raw.images
      : [];
  const result = new Map<
    string,
    { id: string; urlKey: string; metadata: DiscoveryMetadata; rank: number; sources: string[] }
  >();
  for (const value of values.slice(0, serperImagesConfig().pageSize)) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>,
      url = canonicalImageUrl(row.imageUrl);
    if (!url) continue;
    const imageUrl = httpsUrl(row.imageUrl)!;
    const metadata = Object.fromEntries(
      Object.entries({
        title: label(row.title),
        imageUrl,
        imageWidth: positive(row.imageWidth),
        imageHeight: positive(row.imageHeight),
        thumbnailUrl: httpsUrl(row.thumbnailUrl),
        thumbnailWidth: positive(row.thumbnailWidth),
        thumbnailHeight: positive(row.thumbnailHeight),
        source: label(row.source, 300),
        domain: label(row.domain, 300),
        link: httpsUrl(row.link),
        googleUrl: httpsUrl(row.googleUrl),
        position: positive(row.position),
      }).filter(([, v]) => v !== undefined),
    ) as DiscoveryMetadata;
    const urlKey = imageDigest(url),
      old = result.get(urlKey);
    const privateKey = serperImagesConfig().key;
    if (
      privateKey &&
      Object.values(metadata).some(
        (value) => typeof value === 'string' && value.includes(privateKey),
      )
    )
      continue;
    if (old) {
      if (metadata.link && !old.sources.includes(metadata.link)) old.sources.push(metadata.link);
      continue;
    }
    const mainName = context.name.replace(/[（(][^）)]*[）)]/g, ' ').trim();
    const identity = { ...context, name: mainName };
    const name = Math.max(
      matchPlaceName(identity, metadata.title ?? '').rank,
      mainName.length >= 4 && normalizeName(metadata.title ?? '').includes(normalizeName(mainName))
        ? 2
        : 0,
    );
    const landscape =
      kind !== 'entry' && (metadata.imageWidth ?? 0) > (metadata.imageHeight ?? 0) ? 15 : 0;
    result.set(urlKey, {
      id: imageCandidateId(key, urlKey),
      urlKey,
      metadata,
      rank: name * 100 + landscape + Math.max(0, 100 - (metadata.position ?? 100)),
      sources: metadata.link ? [metadata.link] : [],
    });
  }
  return [...result.values()];
}
export async function serperImagePage(
  query: ReturnType<typeof serperQueries>[number],
  page: number,
  signal?: AbortSignal,
) {
  const config = serperImagesConfig();
  if (!config.enabled) throw new ImageProviderError('configuration', 300);
  if (page !== 1) throw new ImageProviderError('configuration', 86400);
  const release = await imageProviderSlot(signal),
    start = performance.now();
  try {
    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': config.key!,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ ...query, num: config.pageSize, page }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(12000), ...(signal ? [signal] : [])]),
    }).catch(() => {
      throw new ImageProviderError('network');
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ImageProviderError(
        response.status === 429 || response.status === 402
          ? 'rate_limit'
          : response.status === 401 || response.status === 403
            ? 'configuration'
            : 'network',
        response.status === 402
          ? 86400
          : response.status === 401 || response.status === 403
            ? 3600
            : Math.max(60, retrySeconds(response.headers.get('Retry-After'))),
      );
    }
    const raw = await imageJsonResponse(response);
    if (!Array.isArray(raw.images)) throw new ImageProviderError('invalid_response');
    imageDiagnostic('serper', 'ok', performance.now() - start, raw.images.length);
    return raw;
  } catch (error) {
    imageDiagnostic(
      'serper',
      error instanceof ImageProviderError ? error.code : 'network',
      performance.now() - start,
    );
    throw error;
  } finally {
    release();
  }
}
