import { TripSyncService } from '@nagi/database';
import { externalPlacesRequestSchema as schema, uuidSchema } from '@nagi/shared';
import { mapboxConfig } from '@/features/integrations/mapbox/config';
import {
  MapboxError,
  searchMapbox,
  resolveMapbox,
  retrieveMapboxDetails,
} from '@/features/integrations/mapbox/server';
import { readMapboxProof } from '@/features/integrations/mapbox/proof';
import { tripRequestFailure, tripRequestSession } from '@/features/trips/sync-server';
import { serviceDatabase } from '@/lib/supabase/server';
import { readJsonBody, RequestBodyError } from '@/lib/request-body';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
async function context(params: Promise<{ guildId: string; tripId: string }>) {
  const { guildId, tripId } = await params;
  if (!uuidSchema.safeParse(tripId).success) throw new MapboxError(404, 'trip');
  const session = await tripRequestSession(guildId);
  const access = await new TripSyncService(session.db).read(guildId, tripId, 2147483647);
  return { ...session, guildId, tripId, access };
}
function failure(error: unknown) {
  if (error instanceof MapboxError)
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
    const config = mapboxConfig();
    const state =
      config.enabled && config.configured
        ? await serviceDatabase().rpc('mapbox_available', {})
        : null;
    return Response.json(
      {
        available: config.enabled && config.configured && !!state?.data,
        minCharacters: config.minCharacters,
        photos: config.photos,
        provider: 'Mapbox',
        mapAvailable: config.enabled && config.mapConfigured,
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
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return new Response(null, { status: 403, headers });
  try {
    const parsed = schema.safeParse(await readJsonBody(request, 262144));
    if (!parsed.success) return new Response(null, { status: 400, headers });
    const ctx = await context(params),
      data = parsed.data;
    if (data.operation === 'search') {
      const result = await searchMapbox(ctx.userId, ctx.tripId, data, request.signal);
      return Response.json(result, {
        headers: { ...headers, 'Server-Timing': `mapbox;dur=${result.timing.providerMs}` },
      });
    }
    // A signed search result belongs to this member and trip. Otherwise only
    // references already present in this authorized trip can be resolved.
    if (!readMapboxProof(data.proof, ctx.userId, ctx.tripId, data.placeId, data.query)) {
      const roots = await ctx.db
        .from('trip_items')
        .select(
          'external_place_id,external_query,stops:trip_item_stops(external_place_id,external_query)',
        )
        .eq('trip_id', ctx.tripId);
      if (roots.error) throw roots.error;
      const permitted = roots.data.some((i) =>
        [i, ...i.stops].some(
          (p) => p.external_place_id === data.placeId && p.external_query === data.query,
        ),
      );
      if (!permitted) return new Response(null, { status: 403, headers });
    }
    if (data.operation === 'resolve')
      return Response.json(
        { place: await resolveMapbox(ctx.userId, ctx.tripId, data, request.signal) },
        { headers },
      );
    return Response.json(
      { place: await retrieveMapboxDetails(ctx.userId, data.placeId, request.signal) },
      { headers },
    );
  } catch (error) {
    return error instanceof RequestBodyError
      ? new Response(null, { status: error.status, headers })
      : failure(error);
  }
}
