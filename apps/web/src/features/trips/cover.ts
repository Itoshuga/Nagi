import 'server-only';
import { randomUUID } from 'node:crypto';
import { coverFileSchema } from '@nagi/shared';
import { optimizeCover } from '@/features/geography/cover-image';
import { maxCoverSize } from '@/features/geography/storage';
import { serviceDatabase } from '@/lib/supabase/server';

export const tripCoverBucket = 'trip-covers';
export function tripCoverPath(guild: string, trip: string, version: string) {
  return `/app/trip-cover/${guild}/${trip}/${version}`;
}
export const tripCoverKey = (url: string) => `${url.slice('/app/trip-cover/'.length)}.webp`;

export async function uploadTripCover(
  guild: string,
  trip: string,
  value: FormDataEntryValue | null,
) {
  if (!value || (value instanceof File && !value.name && !value.size)) return undefined;
  const parsed = coverFileSchema(maxCoverSize()).safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Couverture invalide.');
  let buffer: Buffer;
  try {
    buffer = await optimizeCover(parsed.data);
  } catch {
    throw new Error('Choisissez une image JPEG, PNG ou WebP statique et valide.');
  }
  const url = tripCoverPath(guild, trip, randomUUID());
  const { error } = await serviceDatabase()
    .storage.from(tripCoverBucket)
    .upload(tripCoverKey(url), buffer, { contentType: 'image/webp', upsert: false });
  if (error) throw new Error('Impossible d’envoyer la couverture.');
  return url;
}

export async function discardTripCover(url?: string | null) {
  if (!url?.startsWith('/app/trip-cover/')) return;
  try {
    const { error } = await serviceDatabase()
      .storage.from(tripCoverBucket)
      .remove([tripCoverKey(url)]);
    if (error) console.warn('Nettoyage de couverture de voyage différé.');
  } catch {
    console.warn('Nettoyage de couverture de voyage différé.');
  }
}

export async function discardUnattachedTripCover(guild: string, trip: string, url?: string) {
  if (!url) return;
  const current = await serviceDatabase()
    .from('trips')
    .select('cover_image_url')
    .eq('guild_id', guild)
    .eq('id', trip)
    .maybeSingle();
  if (!current.error && current.data?.cover_image_url !== url) await discardTripCover(url);
}
