import 'server-only';
import { serviceDatabase } from '@/lib/supabase/server';

export const entryMediaBucket = 'entry-media';

export async function cleanEntryMedia() {
  const db = serviceDatabase();
  try {
    const pending = await db
      .from('catalog_media_garbage')
      .select('path')
      .lte('not_before', new Date().toISOString())
      .order('not_before')
      .limit(40);
    if (pending.error || !pending.data.length) return;
    const paths = pending.data.map((row) => row.path);
    const removed = await db.storage.from(entryMediaBucket).remove(paths);
    if (removed.error) return;
    await db.from('catalog_media_garbage').delete().in('path', paths);
  } catch {
    // The durable queue is retried by subsequent media operations.
    console.warn('Nettoyage différé des images du catalogue.');
  }
}
