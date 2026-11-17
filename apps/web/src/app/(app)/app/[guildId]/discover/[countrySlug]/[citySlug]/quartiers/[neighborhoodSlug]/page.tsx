import { notFound } from 'next/navigation';
import { GeographyService } from '@nagi/database';
import { slugSchema } from '@nagi/shared';
import { DiscoverCategories, DestinationHero } from '@/features/geography/discover';
import type { SearchParams } from '@/features/geography/model';
import { Breadcrumbs } from '@/features/geography/navigation';
import { requireGuild } from '@/features/spaces/server';
import { sessionDatabase } from '@/lib/supabase/server';

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
  const neighborhood = await new GeographyService(await sessionDatabase()).publishedNeighborhood(
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
      <DiscoverCategories
        cityId={neighborhood.city_id}
        neighborhoodId={neighborhood.id}
        path={`${cityPath}/quartiers/${neighborhoodSlug}`}
        params={await searchParams}
      />
    </>
  );
}
