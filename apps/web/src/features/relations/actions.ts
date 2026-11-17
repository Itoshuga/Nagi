'use server';

import { catalogRelationTypeInput, destinationIdSchema, toDestinationSlug } from '@nagi/shared';
import { searchCatalogEntries } from '@nagi/database';
import { requireAdmin } from '@/features/auth/session';
import { catalogError, refreshCatalog, type CatalogResult } from '@/features/catalog/mutations';
import { serviceDatabase, sessionDatabase } from '@/lib/supabase/server';

const validId = (value: unknown) => destinationIdSchema.safeParse(value).success;

export async function findRelationEntries(search: string, exclude: string, category?: string) {
  await requireAdmin();
  if (typeof search !== 'string' || !validId(exclude) || (category && !validId(category)))
    return [];
  return searchCatalogEntries(await sessionDatabase(), search, exclude, category);
}

export async function saveRelationType(id: string | null, form: FormData): Promise<CatalogResult> {
  await requireAdmin();
  if (id && !validId(id)) return { ok: false, message: 'Type de relation introuvable.' };
  const raw = Object.fromEntries(form);
  raw.slug ||= toDestinationSlug(String(raw.name ?? ''))
    .slice(0, 100)
    .replace(/-$/, '');
  const parsed = catalogRelationTypeInput.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Vérifiez les paramètres du type.',
    };
  const db = serviceDatabase();
  const query = id
    ? db.from('relation_types').update(parsed.data).eq('id', id)
    : db.from('relation_types').insert(parsed.data);
  const { error } = await query.select('id').single();
  if (error) return catalogError(error, 'Impossible d’enregistrer le type de relation.');
  refreshCatalog('relations');
  return { ok: true, message: 'Type de relation enregistré.' };
}

export async function deleteRelationType(id: string, form: FormData): Promise<CatalogResult> {
  await requireAdmin();
  if (!validId(id) || form.get('confirm') !== 'yes')
    return { ok: false, message: 'Confirmez la suppression de ce type.' };
  const { error } = await serviceDatabase()
    .from('relation_types')
    .delete()
    .eq('id', id)
    .select('id')
    .single();
  if (error) return catalogError(error, 'Impossible de supprimer ce type de relation.');
  refreshCatalog('relations');
  return { ok: true, message: 'Type de relation supprimé.' };
}

export async function saveEntryRelation(
  entryId: string,
  relationId: string | null,
  form: FormData,
): Promise<CatalogResult> {
  await requireAdmin();
  const destination = String(form.get('target') ?? '');
  const type = String(form.get('type') ?? '');
  if (
    !validId(entryId) ||
    !validId(type) ||
    (relationId ? !validId(relationId) : !validId(destination) || entryId === destination)
  )
    return { ok: false, message: 'Choisissez un type de relation et une autre fiche.' };
  const db = serviceDatabase();
  const query = relationId
    ? db
        .from('entry_relations')
        .update({ relation_type_id: type })
        .eq('id', relationId)
        .or(`source_id.eq.${entryId},target_id.eq.${entryId}`)
    : db
        .from('entry_relations')
        .insert({ source_id: entryId, target_id: destination, relation_type_id: type });
  const { error } = await query.select('id').single();
  if (error) return catalogError(error, 'Impossible d’enregistrer la relation.');
  refreshCatalog('entries', entryId);
  return { ok: true, message: 'Relation enregistrée.' };
}

export async function deleteEntryRelation(
  entryId: string,
  relationId: string,
  _form: FormData,
): Promise<CatalogResult> {
  await requireAdmin();
  if (!validId(entryId) || !validId(relationId))
    return { ok: false, message: 'Relation introuvable.' };
  const { error } = await serviceDatabase()
    .from('entry_relations')
    .delete()
    .eq('id', relationId)
    .or(`source_id.eq.${entryId},target_id.eq.${entryId}`)
    .select('id')
    .single();
  if (error) return catalogError(error, 'Impossible de retirer cette relation.');
  refreshCatalog('entries', entryId);
  return { ok: true, message: 'Relation retirée.' };
}
