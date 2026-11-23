import { TripSyncService } from '@nagi/database';
import { uuidSchema } from '@nagi/shared';
import { imageRoute } from '@/features/images/route';
import { tripRequestSession, TripRequestError } from '@/features/trips/sync-server';
export const dynamic = 'force-dynamic';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ guildId: string; tripId: string }> },
) {
  return imageRoute(request, async () => {
    const { guildId, tripId } = await params;
    if (!uuidSchema.safeParse(tripId).success)
      throw new TripRequestError(404, 'forbidden', 'Voyage introuvable.');
    const session = await tripRequestSession(guildId);
    await new TripSyncService(session.db).read(guildId, tripId, 2147483647);
    return { db: session.db, actor: session.userId, trip: tripId };
  });
}
