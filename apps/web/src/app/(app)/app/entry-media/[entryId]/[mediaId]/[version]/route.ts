import { destinationIdSchema } from '@nagi/shared';
import { serviceDatabase, sessionDatabase } from '@/lib/supabase/server';
import { entryMediaBucket } from '@/features/media/storage';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entryId: string; mediaId: string; version: string }> },
) {
  const { entryId, mediaId, version } = await params;
  if (![entryId, mediaId, version].every((id) => destinationIdSchema.safeParse(id).success))
    return new Response(null, { status: 404, headers });
  const db = await sessionDatabase();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims.sub) return new Response(null, { status: 404, headers });
  const media = await db
    .from('entry_media')
    .select('storage_path')
    .eq('entry_id', entryId)
    .eq('id', mediaId)
    .eq('version', version)
    .maybeSingle();
  if (media.error) return new Response(null, { status: 503, headers });
  if (!media.data) return new Response(null, { status: 404, headers });
  const file = await serviceDatabase()
    .storage.from(entryMediaBucket)
    .download(media.data.storage_path);
  if (file.error)
    return new Response(null, { status: file.error.status === 404 ? 404 : 503, headers });
  return new Response(file.data.stream(), {
    headers: { ...headers, 'Content-Type': 'image/webp', 'Content-Length': String(file.data.size) },
  });
}
