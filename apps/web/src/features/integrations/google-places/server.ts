import 'server-only';
import { googlePlaceIdSchema, type GoogleSearchRequest } from '@nagi/shared';
import { googleSearchIds } from './search-model';
import { serviceDatabase } from '@/lib/supabase/server';
import { googlePlacesConfig } from './config';

export class GooglePlacesError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = 'La recherche Google Maps est temporairement indisponible.',
  ) {
    super(message);
  }
}
export async function reserveGooglePlaces(
  actor: string,
  kind: 'ui_search' | 'ui_details' | 'verify' | 'coordinates' | 'autocomplete' | 'text_search',
) {
  const config = googlePlacesConfig();
  if (!config.enabled || !config.configured) throw new GooglePlacesError(503, 'configuration');
  const { error } = await serviceDatabase().rpc('reserve_google_places', {
    p_actor: actor,
    p_kind: kind,
    p_user_daily: config.userDaily,
    p_global_daily: config.globalDaily,
    p_user_minute: config.userMinute,
  });
  if (error)
    throw new GooglePlacesError(
      error.message === 'google_quota' ? 429 : 503,
      error.message === 'google_quota' ? 'quota' : 'disabled',
    );
}
type Reference = {
  place_id: string;
  verified_at: string;
  available: boolean;
  replacement_id: string | null;
};
async function reference(id: string, available?: boolean, replacement?: string) {
  const { data, error } = await serviceDatabase().rpc('google_place_reference', {
    p_id: id,
    ...(available !== undefined && { p_available: available }),
    ...(replacement && { p_replacement: replacement }),
  });
  if (error) throw new GooglePlacesError(503, 'database');
  return data as Reference | null;
}
async function details(actor: string, id: string, coordinates: boolean, session?: string) {
  await reserveGooglePlaces(actor, coordinates ? 'coordinates' : 'verify');
  let response: Response;
  try {
    response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}${session ? `?sessionToken=${encodeURIComponent(session)}` : ''}`,
      {
        headers: {
          'X-Goog-Api-Key': googlePlacesConfig().key!,
          'X-Goog-FieldMask': coordinates ? 'id,location,movedPlaceId' : 'id,movedPlaceId',
        },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
      },
    );
  } catch {
    throw new GooglePlacesError(503, 'network');
  }
  if (!response.ok) {
    // Never retain the response body, URL, headers, query or provider messages.
    await serviceDatabase().rpc('google_places_error', {
      p_code: `places_http_${response.status}`,
    });
    if (response.status === 404) {
      await reference(id, false);
      throw new GooglePlacesError(
        404,
        'unavailable',
        'Ce lieu Google Maps ne peut plus être résolu. Vos données de voyage sont conservées.',
      );
    }
    throw new GooglePlacesError(response.status === 429 ? 429 : 503, 'provider');
  }
  const result = (await response.json()) as {
    id?: string;
    movedPlaceId?: string;
    location?: { latitude: number; longitude: number };
  };
  if (!googlePlaceIdSchema.safeParse(result.id).success)
    throw new GooglePlacesError(503, 'response');
  await reference(id, true, result.movedPlaceId);
  return result;
}
const verifying = new Map<string, Promise<Reference | null>>();
export async function verifyGooglePlace(actor: string, id: string, session?: string) {
  googlePlaceIdSchema.parse(id);
  const key = `${actor}:${id}:${session ?? ''}`;
  let request = verifying.get(key);
  if (!request) {
    request = verifyReference(actor, id, session).finally(() => verifying.delete(key));
    verifying.set(key, request);
  }
  return request;
}
async function verifyReference(actor: string, id: string, session?: string) {
  googlePlaceIdSchema.parse(id);
  const config = googlePlacesConfig();
  if (!config.enabled || !config.configured) throw new GooglePlacesError(503, 'configuration');
  const existing = await reference(id);
  // A new insertion always requires recent verification. Old saved IDs remain
  // valid planning references; first resolution also refreshes IDs >12 months.
  if (!session && existing?.available && Date.now() - Date.parse(existing.verified_at) < 86400000)
    return existing;
  await details(actor, id, false, session);
  return reference(id);
}

export async function searchGooglePlaces(
  actor: string,
  input: GoogleSearchRequest,
  signal?: AbortSignal,
) {
  const start = performance.now();
  if (input.query.length < googlePlacesConfig().minCharacters)
    throw new GooglePlacesError(400, 'short_query', 'Saisissez davantage de caractères.');
  await reserveGooglePlaces(actor, input.kind);
  const before = performance.now(),
    autocomplete = input.kind === 'autocomplete';
  let response: Response;
  try {
    response = await fetch(
      `https://places.googleapis.com/v1/${autocomplete ? 'places:autocomplete' : 'places:searchText'}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googlePlacesConfig().key!,
          'X-Goog-FieldMask': autocomplete ? 'suggestions.placePrediction.placeId' : 'places.id',
        },
        body: JSON.stringify({
          ...(autocomplete
            ? { input: input.query, sessionToken: input.session }
            : { textQuery: input.query, pageSize: 8 }),
          languageCode: 'fr',
          ...(input.context.region && {
            regionCode:
              !autocomplete && input.context.region === 'uk' ? 'gb' : input.context.region,
          }),
          ...(input.context.bias && { locationBias: input.context.bias }),
          ...(input.type &&
            (autocomplete ? { includedPrimaryTypes: [input.type] } : { includedType: input.type })),
        }),
        cache: 'no-store',
        redirect: 'error',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(6000)])
          : AbortSignal.timeout(6000),
      },
    );
  } catch {
    throw new GooglePlacesError(503, 'network');
  }
  if (!response.ok) {
    await serviceDatabase().rpc('google_places_error', {
      p_code: `${input.kind}_http_${response.status}`,
    });
    throw new GooglePlacesError(response.status === 429 ? 429 : 503, 'provider');
  }
  const ids = googleSearchIds(await response.json(), input.kind);
  return {
    ids,
    timing: {
      providerMs: Math.round(performance.now() - before),
      serverMs: Math.round(performance.now() - start),
    },
  };
}
export async function googlePlaceCoordinates(actor: string, id: string) {
  googlePlaceIdSchema.parse(id);
  let result = await details(actor, id, true);
  const visited = new Set([id]);
  for (let hop = 0; result.movedPlaceId; hop++) {
    const next = googlePlaceIdSchema.parse(result.movedPlaceId);
    if (hop >= 3 || visited.has(next)) throw new GooglePlacesError(503, 'moved_place');
    visited.add(next);
    result = await details(actor, next, true);
  }
  const point = result.location;
  if (
    !point ||
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180
  )
    return null;
  // Coordinates are returned live. No Google content enters the trip journal,
  // Supabase Storage, an HTTP cache, or the durable catalog.
  return { latitude: point.latitude, longitude: point.longitude, expiresAt: Date.now() + 600000 };
}
