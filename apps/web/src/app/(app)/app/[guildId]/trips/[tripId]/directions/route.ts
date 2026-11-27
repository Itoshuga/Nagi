import { z } from 'zod';
import { TripService, TripSyncService } from '@nagi/database';
import { externalPlaceIdSchema, mapboxQuerySchema, uuidSchema } from '@nagi/shared';
import { publicCatalogDatabase } from '@/lib/supabase/server';
import { readJsonBody, RequestBodyError } from '@/lib/request-body';
import { tripRequestFailure, tripRequestSession } from '@/features/trips/sync-server';
import { visibleTripItems, tripMapVisits } from '@/features/trips/planner-model';
import {
  dayRouteKey,
  prepareDayRoute,
  dayRouteProfile,
  type RoutePlace,
} from '@/features/trips/map-route-model';
import { DirectionsFailure } from '@/features/trips/map-route-compute';
import { directionsForDay } from '@/features/integrations/mapbox/directions';
import { readMapboxProof } from '@/features/integrations/mapbox/proof';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const schema = z
  .object({
    day: uuidSchema,
    key: z.string().min(1).max(180000),
    places: z
      .array(
        z
          .object({
            id: externalPlaceIdSchema,
            query: mapboxQuerySchema,
            proof: z.string().max(24576),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
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
    const parsed = schema.safeParse(await readJsonBody(request, 512000));
    const { guildId, tripId } = await params;
    if (!parsed.success || !uuidSchema.safeParse(tripId).success)
      return new Response(null, { status: 400, headers });
    const input = parsed.data;
    const session = await tripRequestSession(guildId);
    await new TripSyncService(session.db).read(guildId, tripId, 2147483647);
    const plan = await new TripService(session.db).plan(guildId, tripId, publicCatalogDatabase());
    if (!plan || !plan.days.some((d) => d.id === input.day))
      return new Response(null, { status: 404, headers });
    const visits = tripMapVisits(visibleTripItems(plan, input.day));
    const places = new Map<string, RoutePlace>();
    for (const place of input.places) {
      if (
        !visits.some((v) => {
          const row = v.stop ?? v.parent;
          return (
            row.source === 'mapbox' &&
            row.external_place_id === place.id &&
            row.external_query === place.query
          );
        })
      )
        return new Response(null, { status: 403, headers });
      const proof = readMapboxProof(place.proof, session.userId, tripId, place.id, place.query);
      if (!proof?.coordinates || proof.kind !== 'resolved')
        return Response.json(
          {
            error: 'Les positions Mapbox doivent être actualisées avant le calcul.',
            code: 'refresh_places',
          },
          { status: 409, headers },
        );
      places.set(place.id, { coordinates: proof.coordinates, featureType: proof.featureType });
    }
    const route = prepareDayRoute(visits, places);
    if (dayRouteKey(input.day, dayRouteProfile, route) !== input.key)
      return Response.json(
        {
          error: 'Le parcours a changé. Attendez la synchronisation des étapes.',
          code: 'stale_route',
        },
        { status: 409, headers },
      );
    const result = await directionsForDay(
      session.userId,
      `${guildId}:${tripId}`,
      input.key,
      input.day,
      dayRouteProfile,
      route,
      request.signal,
    );
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof RequestBodyError)
      return new Response(null, { status: error.status, headers });
    if (
      error instanceof DirectionsFailure ||
      (error instanceof Error && error.name === 'TimeoutError')
    )
      return Response.json(
        {
          error:
            error instanceof DirectionsFailure && error.reason === 'quota'
              ? 'La limite de calcul des trajets est atteinte. Réessayez plus tard.'
              : 'Le trajet est momentanément indisponible. Les lieux restent accessibles.',
        },
        {
          status: error instanceof DirectionsFailure && error.reason === 'quota' ? 429 : 503,
          headers,
        },
      );
    const result = tripRequestFailure(error);
    return Response.json(
      result.status === 503
        ? { error: 'Le trajet est momentanément indisponible. Les lieux restent accessibles.' }
        : result.body,
      { status: result.status, headers },
    );
  }
}
