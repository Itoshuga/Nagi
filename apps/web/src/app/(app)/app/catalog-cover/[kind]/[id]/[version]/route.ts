import { destinationIdSchema, destinationKindSchema } from '@nagi/shared';
import { coverUrl } from '@/features/geography/model';
import { downloadCover } from '@/features/geography/storage';
import { sessionDatabase } from '@/lib/supabase/server';
import { privateImageResponse } from '@/features/media/private-response';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string; version: string }> },
) {
  const { kind, id, version } = await params;
  const parsed = destinationKindSchema.safeParse(kind);
  if (
    !parsed.success ||
    !destinationIdSchema.safeParse(id).success ||
    !destinationIdSchema.safeParse(version).success
  )
    return new Response(null, { status: 404, headers: privateHeaders });
  const db = await sessionDatabase();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims?.sub) return new Response(null, { status: 404, headers: privateHeaders });
  const url = coverUrl(parsed.data, id, version);
  const { data, error } = await db
    .from(parsed.data)
    .select('id')
    .eq('id', id)
    .eq('cover_image_url', url)
    .maybeSingle();
  if (error) return new Response(null, { status: 503, headers: privateHeaders });
  if (!data) return new Response(null, { status: 404, headers: privateHeaders });
  return privateImageResponse(request, url, () => downloadCover(url));
}
