'use server';
import { revalidatePath } from 'next/cache';
import { ProfileWriteError } from '@nagi/database';
import {
  profileCustomizationInput,
  profileRevisionInput,
  destinationNamePattern,
  uuidSchema,
} from '@nagi/shared';
import { requireViewer } from '@/features/auth/session';
import { serviceDatabase, publicCatalogDatabase } from '@/lib/supabase/server';
import { profileServices, authorizedProfile } from './server';
import { uploadProfileBanner, cleanProfileBanners } from './banner';

export async function saveProfile(form: FormData) {
  const viewer = await requireViewer();
  const parsed = profileCustomizationInput.safeParse(Object.fromEntries(form));
  const revision = profileRevisionInput.safeParse(form.get('revision'));
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Vérifiez votre profil.' };
  if (!revision.success) return { ok: false, error: 'Rechargez votre profil avant de réessayer.' };
  try {
    const db = serviceDatabase();
    const current = await db
      .from('profile_customizations')
      .select('banner_path')
      .eq('user_id', viewer.id)
      .single();
    if (current.error) throw new ProfileWriteError('Impossible de charger votre profil.');
    let banner = form.get('remove_banner') === 'yes' ? null : current.data.banner_path;
    const file = form.get('banner');
    if (file instanceof File && file.size) banner = await uploadProfileBanner(viewer.id, file);
    await profileServices().store.save(viewer.id, revision.data, parsed.data, banner);
    await cleanProfileBanners();
    revalidatePath('/app/profile', 'layout');
    return { ok: true, error: '' };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof ProfileWriteError
          ? error.message
          : 'Impossible d’enregistrer votre profil. Vos saisies sont conservées.',
    };
  }
}
export async function profileTrips(target: string, page: number) {
  const viewer = await requireViewer();
  if (!uuidSchema.safeParse(target).success) throw new Error('Profil invalide.');
  if (!Number.isInteger(page) || page < 0 || page > 1000) throw new Error('Page invalide.');
  const profile = await authorizedProfile(target);
  if (!profile) throw new Error('Ce profil n’est plus accessible.');
  return profileServices().store.trips(viewer.id, profile.id, page * 12);
}
export type DreamDestination = {
  id: string;
  name: string;
  country_id: string;
  country: string;
  city_id: string | null;
  kind: 'country' | 'city';
};
export async function searchDreamDestinations(query: string): Promise<DreamDestination[]> {
  await requireViewer();
  if (typeof query !== 'string' || query.length > 100) return [];
  const db = publicCatalogDatabase();
  const [countries, cities] = await Promise.all([
    db
      .from('countries')
      .select('id,name')
      .eq('is_published', true)
      .ilike('name', destinationNamePattern(query))
      .order('name')
      .limit(8),
    db
      .from('cities')
      .select('id,name,country:countries!inner(id,name,is_published)')
      .eq('is_published', true)
      .eq('country.is_published', true)
      .ilike('name', destinationNamePattern(query))
      .order('name')
      .limit(12),
  ]);
  if (countries.error || cities.error)
    throw new Error('La recherche de destinations est indisponible.');
  return [
    ...countries.data.map((c) => ({
      id: c.id,
      name: c.name,
      country_id: c.id,
      country: c.name,
      city_id: null,
      kind: 'country' as const,
    })),
    ...cities.data.map((c) => ({
      id: c.id,
      name: c.name,
      country_id: c.country.id,
      country: c.country.name,
      city_id: c.id,
      kind: 'city' as const,
    })),
  ];
}
