'use server';

import { catalogCategoryInput, catalogFieldInput, destinationIdSchema } from '@nagi/shared';
import { requireAdmin } from '@/features/auth/session';
import { serviceDatabase } from '@/lib/supabase/server';
import { catalogError, refreshCatalog, type CatalogResult } from '@/features/catalog/mutations';

export async function saveCategory(id: string | null, form: FormData): Promise<CatalogResult> {
  await requireAdmin();
  const parsed = catalogCategoryInput.safeParse(Object.fromEntries(form));
  if (!parsed.success || (id && !destinationIdSchema.safeParse(id).success))
    return { ok: false, message: 'Vérifiez le nom, l’adresse et les paramètres de la catégorie.' };
  const db = serviceDatabase();
  const query = id
    ? db.from('categories').update(parsed.data).eq('id', id)
    : db.from('categories').insert(parsed.data);
  const result = await query.select('id').single();
  if (result.error) return catalogError(result.error, 'Impossible d’enregistrer la catégorie.');
  refreshCatalog('categories', result.data.id);
  return {
    ok: true,
    message: 'Catégorie enregistrée.',
    href: id ? undefined : `/admin/categories/${result.data.id}`,
  };
}

export async function orderCategories(ids: string[]): Promise<CatalogResult> {
  await requireAdmin();
  if (!destinationIdSchema.array().max(1000).safeParse(ids).success)
    return { ok: false, message: 'Ordre des catégories invalide.' };
  const { error } = await serviceDatabase().rpc('catalog_order_categories', { p_ids: ids });
  if (error) return catalogError(error, 'Impossible d’enregistrer cet ordre.');
  refreshCatalog('categories');
  return { ok: true, message: 'Ordre des catégories enregistré.' };
}

export async function removeCategory(id: string, form: FormData): Promise<CatalogResult> {
  await requireAdmin();
  const target = String(form.get('destination') ?? '');
  if (
    !destinationIdSchema.safeParse(id).success ||
    (target && !destinationIdSchema.safeParse(target).success) ||
    form.get('confirm') !== 'yes'
  )
    return {
      ok: false,
      message: 'Confirmez la suppression et vérifiez la catégorie de destination.',
    };
  const { error, data } = await serviceDatabase().rpc('catalog_remove_category', {
    p_id: id,
    p_destination: target,
  });
  if (error) return catalogError(error, 'Impossible de supprimer la catégorie.');
  refreshCatalog('categories');
  return {
    ok: true,
    message: data ? `Catégorie supprimée, ${data} fiche(s) réaffectée(s).` : 'Catégorie supprimée.',
    href: '/admin/categories',
  };
}

export async function saveCategoryField(
  categoryId: string,
  fieldId: string | null,
  form: FormData,
): Promise<CatalogResult> {
  await requireAdmin();
  const parsed = catalogFieldInput.safeParse(Object.fromEntries(form));
  if (
    !destinationIdSchema.safeParse(categoryId).success ||
    (fieldId && !destinationIdSchema.safeParse(fieldId).success)
  )
    return { ok: false, message: 'Champ introuvable.' };
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Vérifiez les paramètres du champ.',
    };
  const db = serviceDatabase();
  const query = fieldId
    ? db.from('category_fields').update(parsed.data).eq('id', fieldId).eq('category_id', categoryId)
    : db.from('category_fields').insert({ ...parsed.data, category_id: categoryId });
  const { error } = await query.select('id').single();
  if (error) return catalogError(error, 'Impossible d’enregistrer le champ.');
  refreshCatalog('categories', categoryId);
  return { ok: true, message: 'Champ enregistré.' };
}

export async function deleteCategoryField(
  categoryId: string,
  fieldId: string,
  form: FormData,
): Promise<CatalogResult> {
  await requireAdmin();
  if (
    ![categoryId, fieldId].every((id) => destinationIdSchema.safeParse(id).success) ||
    form.get('confirm') !== 'yes'
  )
    return { ok: false, message: 'Confirmez la suppression du champ.' };
  const { error } = await serviceDatabase()
    .from('category_fields')
    .delete()
    .eq('id', fieldId)
    .eq('category_id', categoryId)
    .select('id')
    .single();
  if (error) return catalogError(error, 'Impossible de supprimer le champ.');
  refreshCatalog('categories', categoryId);
  return { ok: true, message: 'Champ supprimé.' };
}
