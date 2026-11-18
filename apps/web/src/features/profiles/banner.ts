import 'server-only';
import { randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import { ProfileWriteError } from '@nagi/database';
import { profileBannerMaxSize, coverFileSchema } from '@nagi/shared';
import { serviceDatabase } from '@/lib/supabase/server';

export const profileBannerBucket = 'profile-banners';
export async function uploadProfileBanner(user: string, value: FormDataEntryValue | null) {
  const parsed = coverFileSchema(profileBannerMaxSize).safeParse(value);
  if (!parsed.success)
    throw new ProfileWriteError(parsed.error.issues[0]?.message ?? 'Bannière invalide.');
  const image = sharp(Buffer.from(await parsed.data.arrayBuffer()), { limitInputPixels: 36000000 });
  let meta: Metadata;
  try {
    meta = await image.metadata();
  } catch {
    throw new ProfileWriteError(
      'Cette image est illisible. Choisissez un fichier JPEG, PNG ou WebP valide.',
    );
  }
  if (`image/${meta.format}` !== parsed.data.type || (meta.pages ?? 1) > 1)
    throw new ProfileWriteError('Choisissez une image JPEG, PNG ou WebP statique et valide.');
  const buffer = await image
    .autoOrient()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer()
    .catch(() => {
      throw new ProfileWriteError(
        'Impossible de traiter cette image. Choisissez un autre fichier.',
      );
    });
  const path = `${user}/${randomUUID()}.webp`;
  const db = serviceDatabase();
  const queued = await db
    .from('profile_banner_garbage')
    .insert({ path, not_before: new Date(Date.now() + 600000).toISOString() });
  if (queued.error) throw new ProfileWriteError('Impossible de préparer la bannière.');
  const result = await db.storage
    .from(profileBannerBucket)
    .upload(path, buffer, { contentType: 'image/webp', upsert: false });
  if (result.error) throw new ProfileWriteError('L’envoi de votre bannière a échoué. Réessayez.');
  return path;
}
export async function cleanProfileBanners() {
  try {
    const db = serviceDatabase();
    const { data, error } = await db
      .from('profile_banner_garbage')
      .select('path')
      .lte('not_before', new Date().toISOString())
      .limit(20);
    if (error || !data?.length) return;
    const paths = data.map((row) => row.path);
    const removed = await db.storage.from(profileBannerBucket).remove(paths);
    if (!removed.error) await db.from('profile_banner_garbage').delete().in('path', paths);
  } catch {
    console.warn('Nettoyage des anciennes bannières à réessayer.');
  }
}
