import { snowflakeSchema, uuidSchema } from '@nagi/shared';
import { requireGuild, spaceServices } from '@/features/spaces/server';
import { tripCoverBucket, tripCoverKey, tripCoverPath } from '@/features/trips/cover';
import { serviceDatabase } from '@/lib/supabase/server';

const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ guildId: string; tripId: string; version: string }>;
  },
) {
  const { guildId, tripId, version } = await params;
  if (
    !snowflakeSchema.safeParse(guildId).success ||
    ![tripId, version].every((value) => uuidSchema.safeParse(value).success)
  )
    return new Response(null, { status: 404, headers });
  await requireGuild(guildId);
  const trip = await (await spaceServices()).trips.get(guildId, tripId);
  const url = tripCoverPath(guildId, tripId, version);
  if (trip?.cover_image_url !== url) return new Response(null, { status: 404, headers });
  const { data, error } = await serviceDatabase()
    .storage.from(tripCoverBucket)
    .download(tripCoverKey(url));
  if (error) return new Response(null, { status: 404, headers });
  return new Response(data.stream(), {
    headers: { ...headers, 'Content-Type': 'image/webp', 'Content-Length': String(data.size) },
  });
}
