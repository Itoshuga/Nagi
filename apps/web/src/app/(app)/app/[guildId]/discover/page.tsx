import { publishedGeography } from '@/features/catalog/queries';
import { FadeIn } from '@/components/shared/fade-in';
import { DiscoverGrid } from '@/features/geography/discover';
import { pageParam, type SearchParams } from '@/features/geography/model';
import { requireGuild } from '@/features/spaces/server';

export const metadata = { title: 'Découvrir' };

export default async function Discover({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  const page = pageParam(await searchParams);
  const { rows, count } = await publishedGeography.list('countries', { page });
  return (
    <>
      <FadeIn className="mb-8 sm:mb-10">
        <h1 className="space-title">Découvrir</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
          Explorez les pays, les villes et les quartiers du catalogue mondial de Nagi.
        </p>
      </FadeIn>
      <DiscoverGrid
        kind="countries"
        rows={rows}
        page={page}
        count={count}
        path={`/app/${guildId}/discover`}
        emptyTitle="Aucun pays à découvrir"
        emptyDescription="Les premières destinations apparaîtront ici après leur publication."
      />
    </>
  );
}
