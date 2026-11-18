import { notFound } from 'next/navigation';
import { publishedGeography } from '@/features/catalog/queries';
import { slugSchema } from '@nagi/shared';
import { DestinationHero } from '@/features/geography/discover';
import { DiscoverEntryCategories } from '@/features/entries/discovery';
import type { SearchParams } from '@/features/geography/model';
import { Breadcrumbs } from '@/features/geography/navigation';
import { requireGuild } from '@/features/spaces/server';

export default async function DiscoverNeighborhood({
  params,
  searchParams,
}: {
  params: Promise<{
    guildId: string;
    countrySlug: string;
    citySlug: string;
    neighborhoodSlug: string;
  }>;
  searchParams: Promise<SearchParams>;
}) {
  const { guildId, countrySlug, citySlug, neighborhoodSlug } = await params;
  if (
    ![countrySlug, citySlug, neighborhoodSlug].every((slug) => slugSchema.safeParse(slug).success)
  )
    notFound();
  await requireGuild(guildId);
  const neighborhood = await publishedGeography.neighborhood(
    countrySlug,
    citySlug,
    neighborhoodSlug,
  );
  if (!neighborhood?.city?.country) notFound();
  const base = `/app/${guildId}/discover`;
  const countryPath = `${base}/${countrySlug}`;
  const cityPath = `${countryPath}/${citySlug}`;
  return (
    <>
      <Breadcrumbs
        links={[
          { label: 'Découvrir', href: base },
          { label: neighborhood.city.country.name, href: countryPath },
          { label: neighborhood.city.name, href: cityPath },
          { label: neighborhood.name },
        ]}
      />
      <DestinationHero destination={neighborhood} kind="neighborhoods" />
      <DiscoverEntryCategories
        cityId={neighborhood.city_id}
        neighborhoodId={neighborhood.id}
        guildId={guildId}
        path={`${cityPath}/quartiers/${neighborhoodSlug}`}
        params={await searchParams}
      />
    </>
  );
}
