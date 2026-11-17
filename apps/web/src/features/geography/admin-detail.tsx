import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye, Pencil, Plus } from 'lucide-react';
import { Alert, Button } from '@nagi/ui';
import { GeographyService } from '@nagi/database';
import type { DestinationKind } from '@nagi/shared';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';
import { DestinationForm } from './admin-form';
import { countLabel, dependencyLabels, DestinationRows, PublicationBadge } from './admin-list';
import { DestinationMenu } from './admin-menu';
import { DestinationCover } from './cover';
import { DestinationHero } from './discover';
import {
  destinationLabels,
  firstParam,
  idParam,
  pageParam,
  withQuery,
  type Breadcrumb,
  type SearchParams,
} from './model';
import { Breadcrumbs, CatalogPagination } from './navigation';
import { maxCoverSize } from './storage';

export async function AdminDestinationDetail({
  kind,
  id,
  params,
}: {
  kind: DestinationKind;
  id?: string;
  params: SearchParams;
}) {
  await requireAdmin();
  const catalog = new GeographyService(await sessionDatabase());
  const destination = id ? await catalog.get(kind, id) : null;
  if (id && !destination) notFound();

  const path = `/admin/${kind}/${id ?? 'new'}`;
  const parentCityId =
    destination && 'city_id' in destination
      ? destination.city_id
      : kind === 'neighborhoods'
        ? idParam(params, 'ville')
        : undefined;
  const city = parentCityId ? await catalog.get('cities', parentCityId) : null;
  if (parentCityId && (!city || !('has_neighborhoods' in city) || !city.has_neighborhoods))
    notFound();
  const parentCountryId =
    city && 'country_id' in city
      ? city.country_id
      : destination && 'country_id' in destination
        ? destination.country_id
        : kind === 'cities'
          ? idParam(params, 'pays')
          : undefined;

  const childKind =
    kind === 'countries'
      ? 'cities'
      : destination && 'has_neighborhoods' in destination && destination.has_neighborhoods
        ? 'neighborhoods'
        : null;
  const page = pageParam(params);
  const preview = !!destination && firstParam(params, 'apercu') === '1';
  const geo = destination && 'latitude' in destination ? destination : null;
  const [country, children, entryCount, countries, cities] = await Promise.all([
    parentCountryId ? catalog.get('countries', parentCountryId) : null,
    destination && childKind ? catalog.list(childKind, { page, parentId: destination.id }) : null,
    geo ? catalog.countEntries(geo) : 0,
    kind === 'cities' && !preview ? catalog.countryOptions() : [],
    kind === 'neighborhoods' && !preview ? catalog.eligibleCities('') : [],
  ]);
  if (parentCountryId && !country) notFound();

  const labels = destinationLabels[kind];
  const title = destination?.name ?? labels.add;
  const hasParent = !!country || !!city;
  const breadcrumbs: Breadcrumb[] = [
    {
      label: hasParent ? 'Pays' : labels.plural,
      href: hasParent ? '/admin/countries' : `/admin/${kind}`,
    },
  ];
  if (country) breadcrumbs.push({ label: country.name, href: `/admin/countries/${country.id}` });
  if (city) breadcrumbs.push({ label: city.name, href: `/admin/cities/${city.id}` });
  const backHref = breadcrumbs.at(-1)!.href;
  breadcrumbs.push({ label: title, href: preview ? path : undefined });
  if (preview) breadcrumbs.push({ label: 'Aperçu' });

  const childCount = children?.count ?? 0;
  const dependencies = dependencyLabels(kind, childCount, entryCount);
  const unpublishedParent = [country, city].find((item) => item && !item.is_published);
  const modeWarning =
    kind === 'cities' && childCount > 0
      ? `Cette ville contient ${countLabel(childCount, 'quartier')}. Réaffectez les fiches concernées, puis déplacez ou supprimez tous les quartiers avant de désactiver ce mode.`
      : geo && 'has_neighborhoods' in geo && !geo.has_neighborhoods && entryCount > 0
        ? `Cette ville contient ${countLabel(entryCount, 'fiche rattachée directement', 'fiches rattachées directement')}. Réorganisez ces fiches avant d’activer les quartiers.`
        : undefined;

  return (
    <>
      <Breadcrumbs links={breadcrumbs} />
      {preview && destination ? (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <PublicationBadge kind={kind} published={destination.is_published} />
            <Button variant="secondary" size="sm" asChild>
              <Link href={path}>
                <Pencil className="size-4" /> Modifier
              </Link>
            </Button>
          </div>
          <DestinationHero destination={destination} kind={kind} />
        </>
      ) : (
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {destination && (
              <DestinationCover
                kind={kind}
                src={destination.cover_image_url}
                className="hidden size-16 shrink-0 rounded-2xl sm:grid"
              />
            )}
            <div className="min-w-0">
              <h1 className="display-title break-words font-display">{title}</h1>
              {destination && (
                <div className="mt-2">
                  <PublicationBadge kind={kind} published={destination.is_published} />
                </div>
              )}
            </div>
          </div>
          {destination && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link href={withQuery(path, { apercu: '1' })}>
                  <Eye className="size-4" /> Aperçu
                </Link>
              </Button>
              <DestinationMenu
                kind={kind}
                id={destination.id}
                name={destination.name}
                version={destination.updated_at}
                published={destination.is_published}
                dependencies={dependencies}
                backHref={backHref}
                detail
              />
            </div>
          )}
        </div>
      )}
      {unpublishedParent && (
        <Alert className="mb-5">
          La destination apparaîtra dans Découvrir après publication de {unpublishedParent.name} et
          de la destination elle-même.
        </Alert>
      )}
      {!preview && (
        <DestinationForm
          key={destination?.updated_at ?? `${kind}-${parentCountryId}-${parentCityId}`}
          kind={kind}
          initial={destination ?? undefined}
          parentId={parentCountryId}
          cities={cities}
          countries={countries}
          selectedCity={
            city
              ? { id: city.id, name: city.name, countries: country ? { name: country.name } : null }
              : undefined
          }
          modeWarning={modeWarning}
          maxImageSize={maxCoverSize()}
        />
      )}
      {destination && childKind && children && (
        <section aria-label={destinationLabels[childKind].plural} className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{destinationLabels[childKind].plural}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {countLabel(childCount, destinationLabels[childKind].singular)}
              </p>
            </div>
            {!preview && (
              <Button size="sm" variant="secondary" asChild>
                <Link
                  href={withQuery(`/admin/${childKind}/new`, {
                    [childKind === 'cities' ? 'pays' : 'ville']: destination.id,
                  })}
                >
                  <Plus className="size-4" />
                  {destinationLabels[childKind].add}
                </Link>
              </Button>
            )}
          </div>
          <DestinationRows
            kind={childKind}
            rows={children.rows}
            emptyTitle={childKind === 'cities' ? 'Aucune ville' : 'Aucun quartier'}
            emptyDescription={
              childKind === 'cities'
                ? 'Ajoutez les villes à découvrir dans ce pays.'
                : 'Ajoutez les quartiers à découvrir dans cette ville.'
            }
          />
          <CatalogPagination
            path={path}
            page={page}
            count={children.count}
            query={{ apercu: preview ? '1' : undefined }}
          />
        </section>
      )}
    </>
  );
}
