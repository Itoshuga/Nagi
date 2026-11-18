import { uuidSchema } from '@nagi/shared';
import { timedFetch } from '@nagi/database';
import { authorizedProfile } from '@/features/profiles/server';
import { serviceDatabase } from '@/lib/supabase/server';
import { profileBannerBucket } from '@/features/profiles/banner';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string; version: string }> },
) {
  const { userId, version } = await params;
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!uuidSchema.safeParse(userId).success || !uuidSchema.safeParse(version).success)
    return new Response(null, { status: 404, headers });
  const profile = await authorizedProfile(userId);
  const path = `${userId}/${version}.webp`;
  if (!profile || profile.customization.banner_path !== path)
    return new Response(null, { status: 404, headers });
  const { data, error } = await serviceDatabase()
    .storage.from(profileBannerBucket)
    .createSignedUrl(path, 30);
  if (error || !data) return new Response(null, { status: 404, headers });
  // Keep the short-lived Storage signature on the server: every browser request is authorized again.
  const download = await timedFetch(data.signedUrl, { cache: 'no-store' });
  if (!download.ok) return new Response(null, { status: 404, headers });
  return new Response(download.body, { headers: { ...headers, 'Content-Type': 'image/webp' } });
}
