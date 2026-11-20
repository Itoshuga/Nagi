import { notFound } from 'next/navigation';
import { catalogEntriesById } from '@nagi/database';
import { publishedCatalog } from '@/features/catalog/queries';
import { uuidSchema } from '@nagi/shared';
import { requireGuild, spaceServices } from '@/features/spaces/server';
import { publicCatalogDatabase } from '@/lib/supabase/server';
import { TripWorkbench } from '@/features/trips/workbench';

export const metadata = { title: 'Itinéraire du voyage' };
export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; tripId: string }>;
  searchParams: Promise<{
    ajouter?: string;
    vue?: string;
    jour?: string;
    mode?: string;
    etape?: string;
  }>;
}) {
  const { guildId, tripId } = await params;
  if (!uuidSchema.safeParse(tripId).success) notFound();
  const { viewer, isAdmin } = await requireGuild(guildId);
  const { trips } = await spaceServices();
  const catalog = publicCatalogDatabase();
  const query = await searchParams;
  const selection = uuidSchema.safeParse(query.ajouter);
  const [plan, categories, selected] = await Promise.all([
    trips.plan(guildId, tripId, catalog),
    publishedCatalog.categories(),
    selection.success ? catalogEntriesById(catalog, [selection.data]) : null,
  ]);
  if (!plan) notFound();
  const canManage =
    plan.organizers.some((person) => person.user_id === viewer.id) ||
    (isAdmin && plan.organizers.length === 0);
  return (
    <TripWorkbench
      key={`${viewer.id}:${guildId}:${plan.id}`}
      guild={guildId}
      viewerId={viewer.id}
      plan={plan}
      categories={categories.map(({ id, name }) => ({ id, name }))}
      canManage={canManage}
      canEdit={canManage || plan.collaboration_mode === 'all_members'}
      initialEntry={selection.success ? selected?.get(selection.data) : undefined}
      initialView={query.vue}
      initialDay={query.jour}
      initialMode={query.mode}
      initialItem={query.etape}
    />
  );
}
