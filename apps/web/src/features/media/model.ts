import type { EntryMedia } from '@nagi/database';

export function entryMediaUrl(media: Pick<EntryMedia, 'entry_id' | 'id' | 'version'>) {
  return `/app/entry-media/${media.entry_id}/${media.id}/${media.version}`;
}
