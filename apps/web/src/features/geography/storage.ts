import 'server-only';
import { coverLimitMib, coverMebibyte } from '@nagi/shared';
import { serviceDatabase } from '@/lib/supabase/server';

export function maxCoverSize() {
  return coverLimitMib.parse(process.env.NAGI_COVER_MAX_MIB) * coverMebibyte;
}

function objectKey(url: string) {
  return `${url.slice('/app/catalog-cover/'.length)}.webp`;
}

function destinationBucket() {
  return serviceDatabase().storage.from('destination-covers');
}

export async function uploadCover(url: string, data: Buffer) {
  return destinationBucket().upload(objectKey(url), data, {
    contentType: 'image/webp',
    upsert: false,
  });
}

export async function downloadCover(url: string) {
  return destinationBucket().download(objectKey(url));
}

export async function removeCover(url: string | null | undefined) {
  if (!url) return;
  try {
    const { error } = await destinationBucket().remove([objectKey(url)]);
    if (error)
      console.warn('Nettoyage de couverture Nagi à réessayer.', { url, status: error.status });
  } catch {
    console.warn('Nettoyage de couverture Nagi à réessayer.', { url });
  }
}
