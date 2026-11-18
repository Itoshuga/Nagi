'use server';

import { randomUUID } from 'node:crypto';
import {
  catalogEntryInput,
  catalogEntrySlug,
  destinationIdSchema,
  destinationKindSchema,
  readCatalogValue,
  type CatalogValue,
  type DestinationKind,
} from '@nagi/shared';
import { listCategoryFields, searchCatalogLocations } from '@nagi/database';
import { requireAdmin } from '@/features/auth/session';
import { catalogError, refreshCatalog, type CatalogResult } from '@/features/catalog/mutations';
import { cleanEntryMedia } from '@/features/media/storage';
import { serviceDatabase, sessionDatabase } from '@/lib/supabase/server';

export async function findEntryLocations(kind: DestinationKind, search: string, parent?: string) {
  await requireAdmin();
  if (
    !destinationKindSchema.safeParse(kind).success ||
    typeof search !== 'string' ||
    (parent && !destinationIdSchema.safeParse(parent).success)
  )
    return [];
  return searchCatalogLocations(await sessionDatabase(), kind, search, parent);
}

export async function findEntryFields(categoryId: string) {
  await requireAdmin();
  return destinationIdSchema.safeParse(categoryId).success
    ? listCategoryFields(await sessionDatabase(), categoryId)
    : [];
}

export async function saveEntry(id: string | null, form: FormData): Promise<CatalogResult> {
  const viewer = await requireAdmin();
  const parsed = catalogEntryInput.safeParse(Object.fromEntries(form));
  if (id && !destinationIdSchema.safeParse(id).success)
    return { ok: false, message: 'Fiche introuvable.' };
  if (!parsed.success)
    return {
      ok: false,
      message: 'Vérifiez le titre, la localisation et les coordonnées de la fiche.',
    };
  const values = parsed.data;
  const db = serviceDatabase();
  const [city, neighborhood, category, current, fields] = await Promise.all([
    db
      .from('cities')
      .select('id,has_neighborhoods')
      .eq('id', values.city_id)
      .eq('country_id', values.country_id)
      .maybeSingle(),
    values.neighborhood_id
      ? db
          .from('neighborhoods')
          .select('id')
          .eq('id', values.neighborhood_id)
          .eq('city_id', values.city_id)
          .maybeSingle()
      : null,
    db.from('categories').select('id').eq('id', values.category_id).maybeSingle(),
    id
      ? db
          .from('entries')
          .select('id,updated_at,category_id,custom_values')
          .eq('id', id)
          .maybeSingle()
      : null,
    listCategoryFields(db, values.category_id),
  ]);
  if (city.error || neighborhood?.error || category.error || current?.error)
    return { ok: false, message: 'Impossible de valider cette fiche pour le moment.' };
  if (
    !city.data ||
    city.data.has_neighborhoods !== Boolean(values.neighborhood_id) ||
    (values.neighborhood_id && !neighborhood?.data)
  )
    return {
      ok: false,
      message:
        'Sélectionnez une ville de ce pays et un quartier de cette ville lorsque les quartiers sont activés.',
    };
  if (!category.data) return { ok: false, message: 'Cette catégorie n’existe plus.' };
  if (id && !current?.data) return { ok: false, message: 'Cette fiche n’existe plus.' };
  if (current?.data && current.data.updated_at !== form.get('updated_at'))
    return {
      ok: false,
      message: 'Cette fiche a été modifiée depuis son ouverture. Rechargez-la avant d’enregistrer.',
    };
  if (
    current?.data &&
    current.data.category_id !== values.category_id &&
    Object.keys(current.data.custom_values ?? {}).length &&
    form.get('confirm_category_change') !== 'yes'
  )
    return {
      ok: false,
      message:
        'Confirmez le changement de catégorie. Les anciennes valeurs personnalisées seront remplacées.',
    };
  if (
    form.get('fields_category') !== values.category_id ||
    form.get('fields_version') !== fields.map((field) => field.id).join(',')
  )
    return {
      ok: false,
      message:
        'Les champs ont changé ou sont encore en cours de chargement. Rechargez la fiche si nécessaire.',
    };

  const customValues: Record<string, CatalogValue> = {};
  try {
    for (const field of fields) {
      const value = readCatalogValue(
        field,
        form.getAll(`field-${field.id}`).map(String),
        values.published,
      );
      if (value !== undefined) customValues[field.id] = value;
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Valeur personnalisée invalide.',
    };
  }
  const entryId = id ?? randomUUID();
  const entry = { ...values, custom_values: customValues };
  const query = current?.data
    ? db.from('entries').update(entry).eq('id', entryId).eq('updated_at', current.data.updated_at)
    : db.from('entries').insert({
        ...entry,
        id: entryId,
        slug: catalogEntrySlug(values.title, entryId),
        created_by: viewer.id,
      });
  const saved = await query.select('id').maybeSingle();
  if (saved.error)
    return catalogError(saved.error, 'Impossible d’enregistrer la fiche. Vérifiez ses paramètres.');
  if (!saved.data)
    return {
      ok: false,
      message: 'La fiche a changé pendant l’enregistrement. Rechargez-la puis réessayez.',
    };
  refreshCatalog('entries', entryId);
  return {
    ok: true,
    message: values.published ? 'Fiche publiée.' : 'Brouillon enregistré.',
    href: id ? undefined : `/admin/entries/${entryId}?onglet=medias`,
  };
}

export async function deleteEntry(id: string, form: FormData): Promise<CatalogResult> {
  await requireAdmin();
  if (!destinationIdSchema.safeParse(id).success || form.get('confirm') !== 'yes')
    return { ok: false, message: 'Confirmez la suppression de cette fiche.' };
  const { error } = await serviceDatabase()
    .from('entries')
    .delete()
    .eq('id', id)
    .select('id')
    .single();
  if (error?.code === '23503')
    return {
      ok: false,
      message:
        'Cette fiche est utilisée dans un voyage. Dépubliez-la pour la retirer de Découvrir en conservant la référence.',
    };
  if (error) return catalogError(error, 'Impossible de supprimer la fiche.');
  await cleanEntryMedia();
  refreshCatalog('entries');
  return { ok: true, message: 'Fiche supprimée.', href: '/admin/entries' };
}
