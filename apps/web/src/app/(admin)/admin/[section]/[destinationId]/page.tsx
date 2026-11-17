import { notFound } from 'next/navigation';
import { destinationIdSchema, destinationKindSchema } from '@nagi/shared';
import { AdminDestinationDetail } from '@/features/geography/admin-detail';
import type { SearchParams } from '@/features/geography/model';

export const metadata = { title: 'Destination · Administration' };

export default async function DestinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string; destinationId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { section, destinationId } = await params;
  const kind = destinationKindSchema.safeParse(section);
  if (
    !kind.success ||
    (destinationId !== 'new' && !destinationIdSchema.safeParse(destinationId).success)
  )
    notFound();
  return (
    <AdminDestinationDetail
      kind={kind.data}
      id={destinationId === 'new' ? undefined : destinationId}
      params={await searchParams}
    />
  );
}
