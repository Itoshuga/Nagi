import { TripService, TripSyncService, enrichTripChanges } from '@nagi/database';
import { uuidSchema } from '@nagi/shared';
import { publicCatalogDatabase } from '@/lib/supabase/server';
import { tripRequestFailure, tripRequestSession } from '@/features/trips/sync-server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(
  request: Request,
  { params }: { params: Promise<{ guildId: string; tripId: string }> },
) {
  const { guildId, tripId } = await params;
  if (!uuidSchema.safeParse(tripId).success) return new Response(null, { status: 404, headers });
  const url = new URL(request.url),
    since = Number(url.searchParams.get('since') ?? 0);
  if (!Number.isSafeInteger(since) || since < 0)
    return new Response(null, { status: 400, headers });
  try {
    const session = await tripRequestSession(guildId),
      service = new TripSyncService(session.db),
      catalog = publicCatalogDatabase();
    const initial = await service.read(
      guildId,
      tripId,
      url.searchParams.has('snapshot') ? 2147483647 : since,
    );
    if (url.searchParams.has('snapshot')) {
      const snapshot = await new TripService(session.db).plan(guildId, tripId, catalog);
      if (!snapshot) return new Response(null, { status: 404, headers });
      return Response.json(
        { snapshot, can_edit: initial.can_edit, can_manage: initial.can_manage },
        { headers },
      );
    }
    if (!request.headers.get('accept')?.includes('text/event-stream'))
      return Response.json(await enrichTripChanges(initial, catalog, session.db), { headers });
    const { data } = await session.db.auth.getSession();
    if (!data.session?.access_token) return new Response(null, { status: 401, headers });
    await session.db.realtime.setAuth(data.session.access_token);
    const channel = session.db.channel(`trip:${tripId}`, { config: { private: true } }),
      encoder = new TextEncoder();
    let cleanup = () => {};
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false,
          cursor = since,
          reading = false,
          again = false;
        const send = (event: string, data: unknown) => {
          if (!closed)
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
        };
        function close(cancelled = false) {
          if (closed) return;
          closed = true;
          clearTimeout(timeout);
          clearInterval(check);
          request.signal.removeEventListener('abort', abort);
          void session.db.removeChannel(channel);
          if (!cancelled) controller.close();
        }
        function abort() {
          close();
        }
        async function flush() {
          if (closed) return;
          if (reading) {
            again = true;
            return;
          }
          reading = true;
          try {
            const batch = await service.read(guildId, tripId, cursor);
            if (closed) return;
            if (batch.events.length || batch.version !== cursor || !batch.can_edit)
              send('change', await enrichTripChanges(batch, catalog, session.db));
            cursor = batch.version;
          } catch (error) {
            const failure = tripRequestFailure(error);
            if (failure.status === 403) send('revoked', {});
            close();
          } finally {
            reading = false;
            if (again) {
              again = false;
              void flush();
            }
          }
        }
        cleanup = () => close(true);
        // Reauthorize on a fresh connection at most every 35 seconds. The short
        // checks also revoke a SQL permission change while a stream is open.
        const timeout = setTimeout(() => close(), 35000),
          check = setInterval(() => void flush(), 10000);
        if (request.signal.aborted) {
          close();
          return;
        }
        request.signal.addEventListener('abort', abort, { once: true });
        send('change', await enrichTripChanges(initial, catalog, session.db));
        cursor = initial.version;
        if (closed) return;
        channel
          .on('broadcast', { event: 'refresh' }, () => void flush())
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') void flush();
            else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) close();
          });
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(body, {
      headers: { ...headers, 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' },
    });
  } catch (error) {
    const failure = tripRequestFailure(error);
    return Response.json(failure.body, { status: failure.status, headers });
  }
}
