import 'server-only';
import { issueImageProof } from '@/features/images/proof';
import { imageDiagnostic } from '@/features/images/diagnostics';
import { imageJsonResponse, imageProviderSlot, retrySeconds } from '@/features/images/http';
import { randomUUID } from 'node:crypto';
import {
  mapboxSearchResultLimit,
  type CatalogPlace,
  type MapboxSearchRequest,
  type TripPlaceReference,
} from '@nagi/shared';
import { serviceDatabase } from '@/lib/supabase/server';
import { mapboxConfig } from './config';
import { mapboxSearchPlaces, mapboxPlaceDetails, mapboxNeedsRefinement } from './model';
import { issueMapboxProof, readMapboxProof } from './proof';

export class MapboxError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = 'La recherche Mapbox est temporairement indisponible.',
  ) {
    super(message);
  }
}
export async function reserveMapbox(
  actor: string,
  kind: 'suggest' | 'forward' | 'retrieve' | 'details',
) {
  const config = mapboxConfig();
  if (!config.enabled || !config.configured)
    throw new MapboxError(
      503,
      'configuration',
      'Mapbox n’est pas encore disponible. Le catalogue Nagi et les étapes personnalisées restent accessibles.',
    );
  const { error } = await serviceDatabase().rpc('reserve_mapbox_places', {
    p_actor: actor,
    p_kind: kind,
    p_user_daily: config.userDaily,
    p_global_daily: config.globalDaily,
    p_user_minute: config.userMinute,
    p_details_monthly: config.detailsMonthly,
  });
  if (error)
    throw new MapboxError(
      error.message === 'mapbox_quota' ? 429 : 503,
      error.message === 'mapbox_quota' ? 'quota' : 'disabled',
      error.message === 'mapbox_quota'
        ? 'La limite de recherche Mapbox est atteinte. Réessayez dans un instant.'
        : 'La recherche Mapbox est momentanément désactivée.',
    );
}
const language = (query: string) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query) ? 'ja' : 'en';
let detailsBlockedUntil = 0;
async function request(
  actor: string,
  kind: 'suggest' | 'forward' | 'retrieve' | 'details',
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
) {
  if (kind === 'details' && detailsBlockedUntil > Date.now()) throw new MapboxError(429, 'quota');
  await reserveMapbox(actor, kind);
  let response: Response;
  try {
    const url = new URL('https://api.mapbox.com' + path);
    for (const [key, value] of Object.entries({ ...params, access_token: mapboxConfig().token! }))
      url.searchParams.set(key, value);
    response = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(7000)])
        : AbortSignal.timeout(7000),
    });
  } catch {
    throw new MapboxError(503, 'network');
  }
  if (!response.ok) {
    if (kind === 'details' && [401, 403, 429].includes(response.status))
      detailsBlockedUntil =
        Date.now() + Math.max(3600, retrySeconds(response.headers.get('Retry-After'))) * 1000;
    await response.body?.cancel();
    await serviceDatabase().rpc('mapbox_error', { p_code: `${kind}_http_${response.status}` });
    throw new MapboxError(
      response.status === 404 ? 404 : response.status === 429 ? 429 : 503,
      kind === 'details' && response.status === 422
        ? 'unsupported_id'
        : response.status === 404
          ? 'unavailable'
          : response.status === 401 || response.status === 403
            ? 'provider_access'
            : 'provider',
      response.status === 404
        ? 'Ce lieu n’est plus disponible. Vos notes et votre planification sont conservées.'
        : response.status === 429
          ? 'Mapbox a atteint sa limite de requêtes. Vous pouvez réessayer plus tard.'
          : 'Les informations Mapbox sont momentanément indisponibles.',
    );
  }
  try {
    return kind === 'details' ? await imageJsonResponse(response) : await response.json();
  } catch {
    throw new MapboxError(503, 'response');
  }
}
export async function searchMapbox(
  actor: string,
  trip: string,
  input: MapboxSearchRequest,
  signal?: AbortSignal,
) {
  if (input.query.length < mapboxConfig().minCharacters)
    throw new MapboxError(400, 'short_query', 'Saisissez davantage de caractères.');
  const start = performance.now();
  const data = await request(
    actor,
    input.kind,
    '/search/searchbox/v1/' + input.kind,
    {
      q: input.query,
      language: language(input.query),
      limit: String(mapboxSearchResultLimit),
      types: 'poi,address,place,locality,neighborhood,region,country',
      ...(input.kind === 'suggest' ? { session_token: input.session } : {}),
      ...(input.category ? { poi_category: input.category } : {}),
      ...(input.context.proximity ? { proximity: input.context.proximity.join(',') } : {}),
    },
    signal,
  );
  const places = mapboxSearchPlaces(data, input.kind, input.query)
    .slice(0, mapboxSearchResultLimit)
    .map((place) => ({
      ...place,
      imageProof: issueImageProof(actor, trip, place),
      proof: issueMapboxProof({
        actor,
        trip,
        id: place.id,
        query: input.query,
        kind: input.kind === 'suggest' ? 'suggestion' : 'resolved',
        ...(input.kind !== 'suggest' && place.coordinates
          ? { coordinates: place.coordinates, featureType: place.featureType }
          : {}),
        ...(input.kind === 'suggest' ? { session: input.session } : {}),
        ...(input.context.proximity ? { proximity: input.context.proximity } : {}),
      }),
    }));
  return {
    places,
    refine: input.kind === 'suggest' && mapboxNeedsRefinement(input.query, places),
    timing: { providerMs: Math.round(performance.now() - start) },
  };
}
type Reference = Pick<
  Extract<TripPlaceReference, { source: 'mapbox' }>,
  'placeId' | 'query' | 'proof'
> & { context?: MapboxSearchRequest['context'] };
const pending = new Map<string, Promise<CatalogPlace>>();
export function resolveMapbox(
  actor: string,
  trip: string,
  reference: Reference,
  signal?: AbortSignal,
): Promise<CatalogPlace> {
  const key = JSON.stringify([actor, trip, reference.placeId, reference.query, reference.proof]);
  let task = pending.get(key);
  if (!task) {
    task = resolve(actor, trip, reference, signal).finally(() => pending.delete(key));
    pending.set(key, task);
  }
  return task;
}
async function resolve(
  actor: string,
  trip: string,
  reference: Reference,
  signal?: AbortSignal,
): Promise<CatalogPlace> {
  const proof = readMapboxProof(
    reference.proof,
    actor,
    trip,
    reference.placeId,
    reference.query,
    true,
  );
  const proximity = reference.context?.proximity ?? proof?.proximity;
  let session =
    proof?.kind === 'suggestion' && proof.expires > Date.now() ? proof.session : undefined;
  // A saved reference is a previously validated text search. Re-run that query
  // once and accept only its exact ID. This also supports Japanese POIs that
  // forward can find while suggest cannot. Never use an approximate match.
  if (!session) {
    const raw = await request(
      actor,
      'forward',
      '/search/searchbox/v1/forward',
      {
        q: reference.query,
        language: language(reference.query),
        limit: '10',
        types: 'poi,address,place,locality,neighborhood,region,country',
        ...(proximity ? { proximity: proximity.join(',') } : {}),
      },
      signal,
    );
    const known = mapboxSearchPlaces(raw, 'forward', reference.query).find(
      (p) => p.id === reference.placeId,
    );
    if (known?.coordinates)
      return {
        ...known,
        imageProof: issueImageProof(actor, trip, known),
        proof: issueMapboxProof({
          actor,
          trip,
          id: known.id,
          query: reference.query,
          kind: 'resolved',
          coordinates: known.coordinates,
          featureType: known.featureType,
          ...(proximity ? { proximity } : {}),
        }),
      };
    // Some interactive suggestion IDs are absent from forward. Only then use a
    // new suggest/retrieve pair, with an exact-ID check before retrieve.
    session = randomUUID();
    const data = await request(
      actor,
      'suggest',
      '/search/searchbox/v1/suggest',
      {
        q: reference.query,
        language: language(reference.query),
        limit: '10',
        session_token: session,
        types: 'poi,address,place,locality,neighborhood,region,country',
        ...(proximity ? { proximity: proximity.join(',') } : {}),
      },
      signal,
    );
    const candidates = mapboxSearchPlaces(data, 'suggest', reference.query);
    if (!candidates.some((place) => place.id === reference.placeId))
      throw new MapboxError(
        422,
        'reassociate',
        'Ce lieu doit être recherché à nouveau. Vos notes, horaires et arrêts sont conservés.',
      );
  }
  const raw = await request(
    actor,
    'retrieve',
    '/search/searchbox/v1/retrieve/' + encodeURIComponent(reference.placeId),
    { session_token: session, language: language(reference.query) },
    signal,
  );
  const place = mapboxSearchPlaces(raw, 'forward', reference.query).find(
    (place) => place.id === reference.placeId,
  );
  if (!place?.coordinates)
    throw new MapboxError(
      422,
      'unavailable',
      'La localisation de ce lieu ne peut pas être confirmée. Choisissez un autre résultat.',
    );
  return {
    ...place,
    imageProof: issueImageProof(actor, trip, place),
    proof: issueMapboxProof({
      actor,
      trip,
      id: place.id,
      query: reference.query,
      kind: 'resolved',
      coordinates: place.coordinates,
      featureType: place.featureType,
      ...(proximity ? { proximity } : {}),
    }),
  };
}
export async function verifyMapboxReference(actor: string, trip: string, reference: Reference) {
  const config = mapboxConfig();
  if (!config.enabled || !config.configured) throw new MapboxError(503, 'configuration');
  const proof = readMapboxProof(reference.proof, actor, trip, reference.placeId, reference.query);
  if (proof?.kind !== 'resolved') await resolveMapbox(actor, trip, reference);
  const { error } = await serviceDatabase().rpc('mapbox_place_reference', {
    p_actor: actor,
    p_id: reference.placeId,
    p_query: reference.query,
  });
  if (error) throw new MapboxError(503, 'database');
}
const pendingDetails = new Map<string, Promise<Record<string, unknown>>>();
export function retrieveMapboxDetailsData(actor: string, id: string, signal?: AbortSignal) {
  const key = JSON.stringify([actor, id]);
  let task = pendingDetails.get(key);
  if (task) return task;
  task = (async () => {
    const release = await imageProviderSlot(signal);
    const start = performance.now();
    try {
      const data = await request(
        actor,
        'details',
        '/places/v1/details/retrieve/' + encodeURIComponent(id),
        {},
        signal,
      );
      imageDiagnostic(
        'mapbox-details',
        'returned',
        performance.now() - start,
        0,
        data.mapbox_id ? 1 : 0,
      );
      return data;
    } finally {
      release();
    }
  })().finally(() => pendingDetails.delete(key));
  pendingDetails.set(key, task);
  return task;
}
export async function retrieveMapboxDetails(actor: string, id: string, signal?: AbortSignal) {
  const data = await retrieveMapboxDetailsData(actor, id, signal);
  // Photograph rights and selection belong exclusively to Image Resolver.
  const place = mapboxPlaceDetails(data, false);
  if (!place || place.id !== id) throw new MapboxError(503, 'response');
  return place;
}
