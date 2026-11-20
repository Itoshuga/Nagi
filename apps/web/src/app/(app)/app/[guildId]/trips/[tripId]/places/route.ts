import { tripPlaceQuery, uuidSchema } from '@nagi/shared';
import {
  findCatalogEntry,
  listCategoryFields,
  listEntryRelations,
  nearbyTripPlaces,
  searchCatalogLocations,
  searchTripPlaces,
  tripCatalogDurations,
} from '@nagi/database';
import { requireGuild, spaceServices } from '@/features/spaces/server';
import { publicCatalogDatabase } from '@/lib/supabase/server';

const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ guildId: string; tripId: string }>;
  },
) {
  const { guildId, tripId } = await params;
  await requireGuild(guildId);
  if (!uuidSchema.safeParse(tripId).success) return new Response(null, { status: 404, headers });
  const parsed = tripPlaceQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success)
    return Response.json({ error: 'Recherche invalide.' }, { status: 400, headers });
  try {
    const { trips, db } = await spaceServices();
    const trip = await trips.get(guildId, tripId);
    if (!trip) return new Response(null, { status: 404, headers });
    const v = parsed.data,
      catalog = publicCatalogDatabase(),
      signal = request.signal;
    if (v.mode === 'detail') {
      if (!v.entry) return new Response(null, { status: 400, headers });
      const entry = await findCatalogEntry(catalog, v.entry);
      if (!entry) return new Response(null, { status: 404, headers });
      const [fields, relations] = await Promise.all([
        listCategoryFields(catalog, entry.category_id),
        listEntryRelations(catalog, entry.id),
      ]);
      return Response.json({ entry, fields, relations }, { headers });
    }
    if (v.mode === 'locations') {
      if (!v.kind) return new Response(null, { status: 400, headers });
      return Response.json(
        { rows: await searchCatalogLocations(catalog, v.kind, v.q, v.parent, signal) },
        { headers },
      );
    }
    if (v.mode === 'nearby') {
      if (
        v.south == null ||
        v.north == null ||
        v.west == null ||
        v.east == null ||
        v.south > v.north
      )
        return new Response(null, { status: 400, headers });
      return Response.json(
        await nearbyTripPlaces(
          catalog,
          {
            south: v.south,
            north: v.north,
            west: v.west,
            east: v.east,
          },
          signal,
        ),
        { headers },
      );
    }
    let activityEntry: string | undefined;
    if (v.activity) {
      const activity = await db
        .from('trip_items')
        .select('entry_id')
        .eq('trip_id', tripId)
        .eq('id', v.activity)
        .abortSignal(signal)
        .maybeSingle();
      if (activity.error) throw activity.error;
      if (!activity.data) return new Response(null, { status: 404, headers });
      activityEntry = activity.data.entry_id;
    }
    async function search(entries: string[]) {
      const result = await searchTripPlaces(
        catalog,
        v,
        { country: trip!.destination_country_id, entries },
        signal,
      );
      return Response.json(
        { ...result, rows: await tripCatalogDurations(catalog, result.rows, signal) },
        { headers },
      );
    }
    if (v.q || v.category || v.country || v.city || v.neighborhood || v.page > 0 || activityEntry)
      return await search(activityEntry ? [activityEntry] : []);
    let items = db.from('trip_items').select('entry_id').eq('trip_id', tripId);
    if (v.day) items = items.eq('trip_day_id', v.day);
    const context = await items.order('sort_order').limit(40).abortSignal(signal);
    if (context.error) throw context.error;
    return await search(context.data.map((r) => r.entry_id));
  } catch {
    return Response.json(
      { error: 'Le catalogue est momentanément indisponible.' },
      {
        status: request.signal.aborted ? 499 : 503,
        headers,
      },
    );
  }
}
