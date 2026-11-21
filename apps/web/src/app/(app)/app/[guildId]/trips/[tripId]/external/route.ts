import { TripSyncService } from '@nagi/database';
import { externalPlacesRequestSchema as schema, uuidSchema } from '@nagi/shared';
import { googlePlacesConfig } from '@/features/integrations/google-places/config';
import {
  GooglePlacesError,
  googlePlaceCoordinates,
  reserveGooglePlaces,
  verifyGooglePlace,
  searchGooglePlaces,
} from '@/features/integrations/google-places/server';
import { tripRequestFailure, tripRequestSession } from '@/features/trips/sync-server';
import { serviceDatabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
async function context(params: Promise<{ guildId: string; tripId: string }>) {
  const { guildId, tripId } = await params;
  if (!uuidSchema.safeParse(tripId).success) throw new GooglePlacesError(404, 'trip');
  const session = await tripRequestSession(guildId);
  const access = await new TripSyncService(session.db).read(guildId, tripId, 2147483647);
  return { ...session, guildId, tripId, access };
}
function failure(error: unknown) {
  if (error instanceof GooglePlacesError)
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers },
    );
  const result = tripRequestFailure(error);
  return Response.json(result.body, { status: result.status, headers });
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ guildId: string; tripId: string }> },
) {
  try {
    await context(params);
    const config = googlePlacesConfig();
    const state =
      config.enabled && config.configured
        ? await serviceDatabase().rpc('google_places_available', {})
        : null;
    return Response.json(
      {
        available: config.enabled && config.configured && !!state?.data,
        minCharacters: config.minCharacters,
        services: ['Places UI Kit', 'Places API (New)'],
        billingRegion: 'EEA',
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ guildId: string; tripId: string }> },
) {
  const started = performance.now();
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return new Response(null, { status: 403, headers });
  if (Number(request.headers.get('content-length') ?? 0) > 262144)
    return new Response(null, { status: 413, headers });
  try {
    const text = await request.text();
    if (text.length > 262144) return new Response(null, { status: 413, headers });
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) return new Response(null, { status: 400, headers });
    const ctx = await context(params),
      data = parsed.data;
    if (data.operation === 'search') {
      const result = await searchGooglePlaces(ctx.userId, data, request.signal);
      return Response.json(result, {
        headers: {
          ...headers,
          'Server-Timing': `google;dur=${result.timing.providerMs}, adapter;dur=${result.timing.serverMs}, handler;dur=${Math.round(performance.now() - started)}`,
        },
      });
    }
    if (data.operation === 'selection') {
      if (!ctx.access.can_edit) return new Response(null, { status: 403, headers });
      await verifyGooglePlace(ctx.userId, data.placeId, data.session);
      return Response.json({ ok: true }, { headers });
    }
    if (data.operation === 'ui') {
      await reserveGooglePlaces(ctx.userId, data.kind);
      return Response.json({ ok: true }, { headers });
    }
    if (data.operation === 'verify') {
      if (!ctx.access.can_edit) return new Response(null, { status: 403, headers });
      return Response.json(await verifyGooglePlace(ctx.userId, data.placeId), { headers });
    }
    // Only coordinates belonging to this authorized trip may be resolved.
    const roots = await ctx.db
      .from('trip_items')
      .select('google_place_id,stops:trip_item_stops(google_place_id)')
      .eq('trip_id', ctx.tripId);
    if (roots.error) throw roots.error;
    const permitted = new Set(
      roots.data.flatMap((i) => [i.google_place_id, ...i.stops.map((s) => s.google_place_id)]),
    );
    const ids = [...new Set(data.ids)];
    if (ids.some((id) => !permitted.has(id))) return new Response(null, { status: 403, headers });
    const points: Record<string, Awaited<ReturnType<typeof googlePlaceCoordinates>>> = {};
    for (const id of ids) {
      try {
        points[id] = await googlePlaceCoordinates(ctx.userId, id);
      } catch (error) {
        if (error instanceof GooglePlacesError && error.status === 404) points[id] = null;
        else throw error;
      }
    }
    return Response.json({ points }, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return new Response(null, { status: 400, headers });
    return failure(error);
  }
}
