import { notFound } from 'next/navigation';
import { publishedGeography } from '@/features/catalog/queries';
import { slugSchema } from '@nagi/shared';
import { DiscoverGrid, DestinationHero } from '@/features/geography/discover';
import { pageParam, type SearchParams } from '@/features/geography/model';
import { Breadcrumbs } from '@/features/geography/navigation';
import { requireGuild } from '@/features/spaces/server';

export default async function DiscoverCountry({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; countrySlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { guildId, countrySlug } = await params;
  if (!slugSchema.safeParse(countrySlug).success) notFound();
  await requireGuild(guildId);
  const catalog = publishedGeography;
  const country = await catalog.country(countrySlug);
  if (!country) notFound();
  const page = pageParam(await searchParams);
  const { rows, count } = await catalog.list('cities', { page, parentId: country.id });
  const base = `/app/${guildId}/discover`;
  return (
    <>
      <Breadcrumbs links={[{ label: 'Découvrir', href: base }, { label: country.name }]} />
      <DestinationHero destination={country} kind="countries" />
      <DiscoverGrid
        rows={rows}
        page={page}
        count={count}
        kind="cities"
        path={`${base}/${countrySlug}`}
        title="Villes"
        emptyTitle="Aucune ville publiée"
        emptyDescription="Les villes de ce pays apparaîtront ici après leur publication."
      />
    </>
  );
}
