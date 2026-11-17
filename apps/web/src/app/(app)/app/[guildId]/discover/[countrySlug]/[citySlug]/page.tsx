import { notFound } from 'next/navigation';
import { GeographyService } from '@nagi/database';
import { slugSchema } from '@nagi/shared';
import { DiscoverCategories, DiscoverGrid, DestinationHero } from '@/features/geography/discover';
import { pageParam, type SearchParams } from '@/features/geography/model';
import { Breadcrumbs } from '@/features/geography/navigation';
import { requireGuild } from '@/features/spaces/server';
import { sessionDatabase } from '@/lib/supabase/server';

export default async function DiscoverCity({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; countrySlug: string; citySlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { guildId, countrySlug, citySlug } = await params;
  if (![countrySlug, citySlug].every((slug) => slugSchema.safeParse(slug).success)) notFound();
  await requireGuild(guildId);
  const catalog = new GeographyService(await sessionDatabase());
  const city = await catalog.publishedCity(countrySlug, citySlug);
  if (!city?.country) notFound();
  const base = `/app/${guildId}/discover`;
  const countryPath = `${base}/${countrySlug}`;
  const path = `${countryPath}/${citySlug}`;
  const query = await searchParams;
  const page = pageParam(query);
  const neighborhoods = city.has_neighborhoods
    ? await catalog.list('neighborhoods', { page, parentId: city.id }, true)
    : null;
  return (
    <>
      <Breadcrumbs
        links={[
          { label: 'Découvrir', href: base },
          { label: city.country.name, href: countryPath },
          { label: city.name },
        ]}
      />
      <DestinationHero destination={city} kind="cities" />
      {neighborhoods ? (
        <DiscoverGrid
          rows={neighborhoods.rows}
          page={page}
          count={neighborhoods.count}
          kind="neighborhoods"
          path={path}
          title="Quartiers"
          emptyTitle="Aucun quartier publié"
          emptyDescription="Vous pourrez choisir un quartier de cette ville après sa publication."
        />
      ) : (
        <DiscoverCategories cityId={city.id} neighborhoodId={null} path={path} params={query} />
      )}
    </>
  );
}
