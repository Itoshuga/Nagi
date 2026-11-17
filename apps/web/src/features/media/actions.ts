'use server';

import { randomUUID } from 'node:crypto';
import type { Json } from '@nagi/database';
import { coverFileSchema, destinationIdSchema } from '@nagi/shared';
import { requireAdmin } from '@/features/auth/session';
import { catalogError, refreshCatalog, type CatalogResult } from '@/features/catalog/mutations';
import { optimizeCover } from '@/features/geography/cover-image';
import { maxCoverSize } from '@/features/geography/storage';
import { serviceDatabase } from '@/lib/supabase/server';
import { cleanEntryMedia, entryMediaBucket } from './storage';

const isId = (value: unknown) => destinationIdSchema.safeParse(value).success;

async function edit(entry: string, operation: string, data: Json): Promise<CatalogResult> {
  const { error } = await serviceDatabase().rpc('catalog_edit_media', {
    p_entry: entry,
    p_operation: operation,
    p_data: data,
  });
  if (error) return catalogError(error, 'Impossible de modifier la galerie.');
  await cleanEntryMedia();
  refreshCatalog('entries', entry);
  return { ok: true, message: 'Galerie mise à jour.' };
}

export async function uploadEntryImage(
  entry: string,
  mediaId: string | null,
  expectedVersion: string | null,
  form: FormData,
): Promise<CatalogResult> {
  await requireAdmin();
  if (!isId(entry) || (mediaId && (!isId(mediaId) || !isId(expectedVersion))))
    return { ok: false, message: 'Image ou fiche introuvable.' };
  const image = coverFileSchema(maxCoverSize()).safeParse(form.get('file'));
  if (!image.success)
    return { ok: false, message: image.error.issues[0]?.message ?? 'Image invalide.' };
  const alt = String(form.get('alt_text') ?? '').trim();
  if (alt.length > 220)
    return { ok: false, message: 'Le texte alternatif est limité à 220 caractères.' };
  let bytes: Buffer;
  try {
    bytes = await optimizeCover(image.data);
  } catch {
    return { ok: false, message: 'Choisissez une image statique JPEG, PNG ou WebP valide.' };
  }
  const db = serviceDatabase();
  const { data: exists, error: lookupError } = await db
    .from('entries')
    .select('id')
    .eq('id', entry)
    .maybeSingle();
  if (!exists || lookupError)
    return { ok: false, message: 'Enregistrez la fiche avant d’envoyer des images.' };
  const id = mediaId ?? randomUUID();
  const version = randomUUID();
  const path = `${entry}/${id}/${version}.webp`;
  const queued = await db.from('catalog_media_garbage').insert({
    path,
    not_before: new Date(Date.now() + 3_600_000).toISOString(),
  });
  if (queued.error) return { ok: false, message: 'Impossible de préparer l’envoi de l’image.' };
  const uploaded = await db.storage
    .from(entryMediaBucket)
    .upload(path, bytes, { contentType: 'image/webp', upsert: false });
  if (uploaded.error)
    return { ok: false, message: 'Supabase Storage a refusé l’envoi de l’image.' };
  const result = await edit(entry, mediaId ? 'replace' : 'add', {
    id,
    version,
    expected_version: expectedVersion,
    alt_text: alt,
  });
  if (!result.ok) {
    await db
      .from('catalog_media_garbage')
      .update({ not_before: new Date().toISOString() })
      .eq('path', path);
    await cleanEntryMedia();
  }
  return result;
}

export async function changeEntryImage(
  entry: string,
  id: string,
  version: string,
  action: 'alt' | 'cover' | 'remove',
  form: FormData,
): Promise<CatalogResult> {
  await requireAdmin();
  if (![entry, id, version].every(isId) || !['alt', 'cover', 'remove'].includes(action))
    return { ok: false, message: 'Image introuvable.' };
  const alt = String(form.get('alt_text') ?? '').trim();
  if (alt.length > 220)
    return { ok: false, message: 'Le texte alternatif est limité à 220 caractères.' };
  if (action === 'remove' && form.get('confirm') !== 'yes')
    return { ok: false, message: 'Confirmez le retrait de cette image.' };
  return edit(entry, action, { id, expected_version: version, alt_text: alt });
}

export async function autoEntryCover(entry: string, _form: FormData): Promise<CatalogResult> {
  await requireAdmin();
  if (!isId(entry)) return { ok: false, message: 'Fiche introuvable.' };
  return edit(entry, 'auto', {});
}

export async function orderEntryMedia(entry: string, ids: string[]): Promise<CatalogResult> {
  await requireAdmin();
  if (!isId(entry) || !destinationIdSchema.array().max(20).safeParse(ids).success)
    return { ok: false, message: 'Ordre des images invalide.' };
  return edit(entry, 'order', { ids });
}
