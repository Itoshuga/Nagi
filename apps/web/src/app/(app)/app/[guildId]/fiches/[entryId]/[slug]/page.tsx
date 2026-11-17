import { notFound, redirect } from 'next/navigation';
import { destinationIdSchema } from '@nagi/shared';
import { findCatalogEntry } from '@nagi/database';
import { CatalogEntryPage } from '@/features/entries/detail';
import { entryHref } from '@/features/entries/discovery';
import { requireGuild } from '@/features/spaces/server';
import { publicCatalogDatabase } from '@/lib/supabase/server';

export default async function DiscoverEntry({
  params,
}: {
  params: Promise<{ guildId: string; entryId: string; slug: string }>;
}) {
  const { guildId, entryId, slug } = await params;
  if (!destinationIdSchema.safeParse(entryId).success) notFound();
  await requireGuild(guildId);
  const db = publicCatalogDatabase();
  const entry = await findCatalogEntry(db, entryId);
  if (!entry?.published || !entry.country || !entry.city || !entry.category) notFound();
  if (entry.slug !== slug) redirect(entryHref(guildId, entry));
  return <CatalogEntryPage db={db} entry={entry} guildId={guildId} />;
}
