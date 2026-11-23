import { getViewer } from '@/features/auth/session';
import { imageRoute } from '@/features/images/route';
import { TripRequestError } from '@/features/trips/sync-server';
import { sessionDatabase } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return imageRoute(request, async () => {
    const viewer = await getViewer();
    if (!viewer)
      throw new TripRequestError(
        401,
        'forbidden',
        'Connectez-vous pour accéder aux photographies.',
      );
    const db = await sessionDatabase(true);
    const { data, error } = await db.rpc('is_nagi_admin');
    if (error) throw new Error('Image permission check failed', { cause: error });
    return { db, actor: viewer.id, admin: !!data };
  });
}
