import { notFound } from 'next/navigation';
import { destinationIdSchema } from '@nagi/shared';
import { findCatalogEntry } from '@nagi/database';
import { requireAdmin } from '@/features/auth/session';
import { CatalogEntryPage } from '@/features/entries/detail';
import { sessionDatabase } from '@/lib/supabase/server';

export const metadata = { title: 'Aperçu de la fiche · Administration' };

export default async function PreviewEntry({
  params,
}: {
  params: Promise<{ section: string; destinationId: string }>;
}) {
  const { section, destinationId } = await params;
  if (section !== 'entries' || !destinationIdSchema.safeParse(destinationId).success) notFound();
  await requireAdmin();
  const db = await sessionDatabase();
  const entry = await findCatalogEntry(db, destinationId);
  if (!entry) notFound();
  return <CatalogEntryPage db={db} entry={entry} />;
}
