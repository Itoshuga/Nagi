'use server';

import { randomUUID } from 'node:crypto';
import {
  catalogRelationTypeInput,
  destinationIdSchema,
  entryRelationInput,
  toDestinationSlug,
} from '@nagi/shared';
import { searchCatalogEntries } from '@nagi/database';
import { requireAdmin } from '@/features/auth/session';
import {
  catalogError,
  refreshRelationTypes,
  refreshRelations,
  type CatalogResult,
} from '@/features/catalog/mutations';
import { sessionDatabase } from '@/lib/supabase/server';
import { isLibraryIcon } from '@/features/icons/library';

const validId = (value: unknown) => destinationIdSchema.safeParse(value).success;
const validStamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
export async function findRelationEntries(
  search: string,
  exclude: string,
  category?: string,
  country?: string,
  page = 0,
) {
  await requireAdmin();
  if (
    typeof search !== 'string' ||
    search.length > 180 ||
    !validId(exclude) ||
    (category && !validId(category)) ||
    (country && !validId(country)) ||
    !Number.isInteger(page) ||
    page < 0 ||
    page > 10000
  )
    return { rows: [], hasMore: false };
  return searchCatalogEntries(await sessionDatabase(), search, exclude, category, {
    countryId: country,
    page,
  });
}
export async function findRelationCountries(search: string) {
  await requireAdmin();
  const { searchCatalogLocations } = await import('@nagi/database');
  return typeof search === 'string' && search.length <= 100
    ? searchCatalogLocations(await sessionDatabase(), 'countries', search)
    : [];
}
export async function saveRelationType(id: string | null, form: FormData): Promise<CatalogResult> {
  await requireAdmin();
  if (id && !validId(id)) return { ok: false, message: 'Type de relation introuvable.' };
  const raw = Object.fromEntries(form);
  raw.name =
    String(raw.name ?? '').trim() ||
    String(raw.forward_label ?? '')
      .trim()
      .slice(0, 100);
  raw.slug ||=
    toDestinationSlug(String(raw.name)).slice(0, 100).replace(/-$/, '') ||
    `relation-${randomUUID().slice(0, 8)}`;
  const parsed = catalogRelationTypeInput.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Vérifiez les paramètres du type.',
    };
  if (parsed.data.icon && !isLibraryIcon(parsed.data.icon))
    return { ok: false, message: 'Choisissez une icône dans la bibliothèque.' };
  if (id && !validStamp(form.get('updated_at')))
    return { ok: false, message: 'Rechargez le type avant de le modifier.' };
  const { error } = await (
    await sessionDatabase()
  ).rpc('catalog_save_relation_type', {
    p_id: id!,
    p_data: { ...parsed.data, updated_at: String(form.get('updated_at') ?? '') },
  });
  if (error) return catalogError(error, 'Impossible d’enregistrer le type de relation.');
  refreshRelationTypes();
  return { ok: true, message: 'Type de relation enregistré.' };
}
export async function toggleRelationType(
  id: string,
  enabled: boolean,
  expected: string,
): Promise<CatalogResult> {
  await requireAdmin();
  if (!validId(id) || typeof enabled !== 'boolean' || !validStamp(expected))
    return { ok: false, message: 'Type invalide.' };
  const { error } = await (
    await sessionDatabase()
  ).rpc('catalog_toggle_relation_type', { p_id: id, p_enabled: enabled, p_expected: expected });
  if (error) return catalogError(error, 'Impossible de modifier le statut.');
  refreshRelationTypes();
  return {
    ok: true,
    message: enabled ? 'Type activé.' : 'Type désactivé. Les relations existantes sont conservées.',
  };
}
export async function orderRelationTypes(ids: string[]): Promise<CatalogResult> {
  await requireAdmin();
  if (!destinationIdSchema.array().max(1000).safeParse(ids).success)
    return { ok: false, message: 'Ordre invalide.' };
  const { error } = await (
    await sessionDatabase()
  ).rpc('catalog_order_relation_types', { p_ids: ids });
  if (error) return catalogError(error, 'Impossible d’enregistrer cet ordre.');
  refreshRelationTypes();
  return { ok: true, message: 'Ordre enregistré.' };
}
export async function relationTypeDependencies(id: string) {
  await requireAdmin();
  if (!validId(id)) throw new Error('Type invalide.');
  const { data, error } = await (
    await sessionDatabase()
  )
    .from('entry_relations')
    .select(
      'id,source:entries!entry_relations_source_id_fkey(id,title),target:entries!entry_relations_target_id_fkey(id,title)',
    )
    .eq('relation_type_id', id)
    .order('id')
    .limit(6);
  if (error) throw new Error('Impossible de charger les dépendances.');
  return data;
}
export async function deleteRelationType(id: string, form: FormData): Promise<CatalogResult> {
  await requireAdmin();
  const destination = String(form.get('destination') ?? '');
  if (
    !validId(id) ||
    (destination && !validId(destination)) ||
    !validStamp(form.get('updated_at')) ||
    form.get('confirm') !== 'yes'
  )
    return { ok: false, message: 'Confirmez la suppression de ce type.' };
  const { data, error } = await (
    await sessionDatabase()
  ).rpc('catalog_remove_relation_type', {
    p_id: id,
    p_destination: destination || null!,
    p_expected: String(form.get('updated_at')),
  });
  if (error)
    return catalogError(
      error,
      'Impossible de supprimer ce type. La réaffectation peut créer un doublon ou un cycle.',
    );
  refreshRelationTypes();
  return {
    ok: true,
    message: data ? `Type supprimé, ${data} relation(s) réaffectée(s).` : 'Type supprimé.',
  };
}
export async function saveEntryRelation(
  entryId: string,
  relationId: string | null,
  form: FormData,
): Promise<CatalogResult> {
  await requireAdmin();
  const parsed = entryRelationInput.safeParse(Object.fromEntries(form));
  if (
    !validId(entryId) ||
    (relationId && !validId(relationId)) ||
    !parsed.success ||
    parsed.data.target === entryId ||
    (relationId && !parsed.data.updated_at)
  )
    return { ok: false, message: 'Choisissez le sens, le type de relation et une autre fiche.' };
  const { target, type, direction, updated_at } = parsed.data;
  const { data, error } = await (
    await sessionDatabase()
  ).rpc('catalog_edit_relation', {
    p_entry: entryId,
    p_id: relationId!,
    p_expected: updated_at!,
    p_other: target,
    p_type: type,
    p_direction: direction,
    p_delete: false,
  });
  if (error?.code === '23505')
    return { ok: false, message: 'Cette association existe déjà et apparaît sur les deux fiches.' };
  if (error) return catalogError(error, 'Impossible d’enregistrer la relation.');
  refreshRelations((data as { entries: string[] }).entries);
  return { ok: true, message: 'Relation enregistrée sur les deux fiches.' };
}
export async function deleteEntryRelation(
  entryId: string,
  relationId: string,
  form: FormData,
): Promise<CatalogResult> {
  await requireAdmin();
  if (
    !validId(entryId) ||
    !validId(relationId) ||
    form.get('confirm') !== 'yes' ||
    !validStamp(form.get('updated_at'))
  )
    return { ok: false, message: 'Confirmez la suppression de cette relation.' };
  const { data, error } = await (
    await sessionDatabase()
  ).rpc('catalog_edit_relation', {
    p_entry: entryId,
    p_id: relationId,
    p_expected: String(form.get('updated_at')),
    p_other: null!,
    p_type: null!,
    p_direction: 'forward',
    p_delete: true,
  });
  if (error) return catalogError(error, 'Impossible de supprimer cette relation.');
  refreshRelations((data as { entries: string[] }).entries);
  return { ok: true, message: 'Relation supprimée des deux fiches.' };
}
