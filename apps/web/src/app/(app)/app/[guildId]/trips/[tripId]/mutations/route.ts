import { revalidatePath } from 'next/cache';
import { TripSyncService, enrichTripChanges } from '@nagi/database';
import { tripMutationSchema, uuidSchema } from '@nagi/shared';
import { publicCatalogDatabase } from '@/lib/supabase/server';
import { tripRequestFailure, tripRequestSession } from '@/features/trips/sync-server';
import { MapboxError, verifyMapboxReference } from '@/features/integrations/mapbox/server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(
  request: Request,
  { params }: { params: Promise<{ guildId: string; tripId: string }> },
) {
  const start = performance.now();
  const { guildId, tripId } = await params;
  if (!uuidSchema.safeParse(tripId).success) return new Response(null, { status: 404, headers });
  // Cookie-authenticated JSON mutations require an exact same-origin request.
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return new Response(null, { status: 403, headers });
  if (Number(request.headers.get('content-length') ?? 0) > 262144)
    return new Response(null, { status: 413, headers });
  let parsed: ReturnType<typeof tripMutationSchema.safeParse>;
  try {
    const text = await request.text();
    if (text.length > 262144) return new Response(null, { status: 413, headers });
    parsed = tripMutationSchema.safeParse(JSON.parse(text));
  } catch {
    return new Response(null, { status: 400, headers });
  }
  if (!parsed.success)
    return Response.json(
      { ok: false, reason: 'invalid', error: 'Modification invalide.' },
      { status: 400, headers },
    );
  try {
    const session = await tripRequestSession(guildId),
      before = performance.now();
    const change = parsed.data.change;
    if (
      (change.operation === 'add_place' || change.operation === 'replace_place') &&
      change.data.place.source === 'mapbox'
    ) {
      const access = await new TripSyncService(session.db).read(guildId, tripId, 2147483647);
      if (!access.can_edit)
        return Response.json(
          { ok: false, reason: 'forbidden', error: 'Ce voyage n’est pas modifiable.' },
          { status: 403, headers },
        );
      await verifyMapboxReference(session.userId, tripId, change.data.place);
    }
    const batch = await new TripSyncService(session.db).mutate(guildId, tripId, parsed.data),
      persisted = performance.now();
    const data = await enrichTripChanges(batch, publicCatalogDatabase(), session.db);
    if (
      [
        'add_item',
        'add_place',
        'replace_place',
        'delete_item',
        'add_day',
        'delete_day',
        'generate_days',
        'nest_item',
        'detach_stop',
        'relocate_stop',
      ].includes(parsed.data.change.operation)
    ) {
      revalidatePath(`/app/${guildId}/trips`);
      revalidatePath(`/app/${guildId}`);
    }
    return Response.json(
      { ok: true, ...data },
      {
        headers: {
          ...headers,
          'Server-Timing': `${session.timing}, persist;dur=${(persisted - before).toFixed(1)}, enrich;dur=${(performance.now() - persisted).toFixed(1)}, total;dur=${(performance.now() - start).toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof MapboxError)
      return Response.json(
        {
          ok: false,
          reason: error.status === 404 || error.status === 422 ? 'invalid' : 'temporary',
          error: error.message,
        },
        { status: error.status === 404 ? 422 : error.status, headers },
      );
    const failure = tripRequestFailure(error);
    return Response.json(failure.body, { status: failure.status, headers });
  }
}
