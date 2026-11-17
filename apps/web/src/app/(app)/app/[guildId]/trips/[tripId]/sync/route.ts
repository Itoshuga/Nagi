import { uuidSchema } from '@nagi/shared';
import { requireGuild, spaceServices } from '@/features/spaces/server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(
  request: Request,
  { params }: { params: Promise<{ guildId: string; tripId: string }> },
) {
  const { guildId, tripId } = await params;
  if (!uuidSchema.safeParse(tripId).success) return new Response(null, { status: 404, headers });
  await requireGuild(guildId);
  const { db } = await spaceServices();
  const result = await db
    .from('trips')
    .select('version')
    .eq('guild_id', guildId)
    .eq('id', tripId)
    .maybeSingle();
  if (result.error) return new Response(null, { status: 503, headers });
  if (!result.data) return new Response(null, { status: 404, headers });
  if (!request.headers.get('accept')?.includes('text/event-stream')) {
    return Response.json({ version: result.data.version }, { headers });
  }
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return new Response(null, { status: 401, headers });
  await db.realtime.setAuth(token);
  const channel = db.channel(`trip:${tripId}`, { config: { private: true } });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string) => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: 1\n\n`));
      };
      function close(cancelled = false) {
        if (closed) return;
        closed = true;
        clearTimeout(timeout);
        request.signal.removeEventListener('abort', abort);
        void db.removeChannel(channel);
        if (!cancelled) controller.close();
      }
      function abort() {
        close();
      }
      cleanup = () => close(true);
      const timeout = setTimeout(() => close(), 35_000);
      if (request.signal.aborted) {
        close();
        return;
      }
      request.signal.addEventListener('abort', abort, { once: true });
      controller.enqueue(encoder.encode('retry: 3500\n\n'));
      channel
        .on('broadcast', { event: 'refresh' }, () => send('change'))
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            send('unavailable');
            close();
          }
        });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(body, {
    headers: { ...headers, 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' },
  });
}
