import { uuidSchema } from '@nagi/shared';
import { requireViewer } from '@/features/auth/session';
import { profileServices } from '@/features/profiles/server';
import { privateImageResponse } from '@/features/media/private-response';
import { serviceDatabase } from '@/lib/supabase/server';
import { profileBannerBucket } from '@/features/profiles/banner';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string; version: string }> },
) {
  const { userId, version } = await params;
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!uuidSchema.safeParse(userId).success || !uuidSchema.safeParse(version).success)
    return new Response(null, { status: 404, headers });
  const viewer = await requireViewer();
  const { access, store } = profileServices();
  if (!(await access.verify(viewer.id, userId)))
    return new Response(null, { status: 404, headers });
  const path = `${userId}/${version}.webp`;
  if (!(await store.banner(viewer.id, userId, path)))
    return new Response(null, { status: 404, headers });
  return privateImageResponse(request, `${profileBannerBucket}/${path}`, () =>
    serviceDatabase().storage.from(profileBannerBucket).download(path),
  );
}
