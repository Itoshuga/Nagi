import { destinationIdSchema, destinationKindSchema } from '@nagi/shared';
import { coverUrl } from '@/features/geography/model';
import { downloadCover } from '@/features/geography/storage';
import { sessionDatabase } from '@/lib/supabase/server';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

export async function GET(
  _request: Request,
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
  if (!auth?.claims.sub) return new Response(null, { status: 404, headers: privateHeaders });
  const url = coverUrl(parsed.data, id, version);
  const { data, error } = await db
    .from(parsed.data)
    .select('id')
    .eq('id', id)
    .eq('cover_image_url', url)
    .maybeSingle();
  if (error) return new Response(null, { status: 503, headers: privateHeaders });
  if (!data) return new Response(null, { status: 404, headers: privateHeaders });
  const image = await downloadCover(url);
  if (image.error) return new Response(null, { status: 404, headers: privateHeaders });
  return new Response(image.data.stream(), {
    headers: { ...privateHeaders, 'Content-Type': 'image/webp' },
  });
}
