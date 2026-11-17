import { notFound } from 'next/navigation';
import { destinationIdSchema, destinationKindSchema } from '@nagi/shared';
import { AdminDestinationDetail } from '@/features/geography/admin-detail';
import { AdminCategory } from '@/features/categories/pages';
import { AdminEntry } from '@/features/entries/admin';
import type { SearchParams } from '@/features/geography/model';

export const metadata = { title: 'Catalogue · Administration' };

export default async function DestinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string; destinationId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { section, destinationId } = await params;
  const id = destinationId === 'new' ? undefined : destinationId;
  if (id && !destinationIdSchema.safeParse(id).success) notFound();
  if (section === 'categories') return <AdminCategory id={id} />;
  if (section === 'entries') return <AdminEntry id={id} />;
  const kind = destinationKindSchema.safeParse(section);
  if (!kind.success) notFound();
  return <AdminDestinationDetail kind={kind.data} id={id} params={await searchParams} />;
}
