'use server';
import { revalidatePath, updateTag } from 'next/cache';
import { countryImportMaxBytes, parseCountryImport } from '@nagi/shared';
import { requireAdmin } from '@/features/auth/session';
import { publishedCatalogTag } from '@/features/catalog/queries';
import { sessionDatabase } from '@/lib/supabase/server';

export type CountryImportState = {
  error?: string;
  issues?: string[];
  created?: number;
  skipped?: number;
};
export async function importCountries(form: FormData): Promise<CountryImportState> {
  await requireAdmin();
  const file = form instanceof FormData ? form.get('file') : null;
  if (!(file instanceof File) || !file.size)
    return { error: 'Choisissez un fichier JSON contenant les pays à importer.' };
  if (file.size > countryImportMaxBytes) return { error: 'Le fichier ne doit pas dépasser 1 Mo.' };
  const result = parseCountryImport(await file.text());
  if (!result.ok) return { error: result.error, issues: result.issues };
  const db = await sessionDatabase();
  // One atomic statement. An existing ISO is ignored, never updated or unpublished.
  const saved = await db
    .from('countries')
    .upsert(result.countries, { onConflict: 'iso_code', ignoreDuplicates: true })
    .select('id');
  if (saved.error) {
    if (saved.error.code === '23505')
      return {
        error:
          'Une adresse générée à partir d’un nom est déjà utilisée par un autre pays. Vérifiez les noms et les codes ISO. Aucun pays de ce fichier n’a été ajouté.',
      };
    if (saved.error.code === '42501')
      return { error: 'Cette action est réservée à l’administration Nagi.' };
    console.error('Échec de l’import des pays.', { code: saved.error.code });
    return {
      error:
        'L’import a échoué. Réessayez dans quelques instants ; les pays déjà présents seront ignorés.',
    };
  }
  if (!saved.data)
    return {
      error:
        'Le résultat de l’import ne peut pas être confirmé. Réessayez ; les pays déjà présents seront ignorés.',
    };
  if (saved.data.length) {
    updateTag(publishedCatalogTag);
    revalidatePath('/admin/countries');
    revalidatePath('/admin');
  }
  return { created: saved.data.length, skipped: result.countries.length - saved.data.length };
}
