'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';
export async function toggleGooglePlaces(form: FormData) {
  await requireAdmin();
  const value = form.get('enabled');
  if (value !== 'true' && value !== 'false') throw new Error('Valeur invalide.');
  const db = await sessionDatabase(true),
    result = await db.rpc('google_places_admin', { p_enabled: value === 'true' });
  if (result.error) throw new Error('La disponibilité Google Maps ne peut pas être modifiée.');
  revalidatePath('/admin/settings/integrations');
}
