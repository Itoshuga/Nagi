import Link from 'next/link';
import { ArrowUpRight, Compass } from 'lucide-react';
import { Card, EmptyState, cn } from '@nagi/ui';
import {
  GeographyService,
  listCategories,
  relatedCount,
  type Destination,
  type DestinationListRow,
} from '@nagi/database';
import type { DestinationKind } from '@nagi/shared';
import { sessionDatabase } from '@/lib/supabase/server';
import { DestinationCover } from './cover';
import { CatalogPagination } from './navigation';
import { firstParam, pageParam, withQuery, type SearchParams } from './model';

export function DestinationHero({
  destination,
  kind,
}: {
  destination: Destination;
  kind: DestinationKind;
}) {
  return (
    <div
      className={cn(
        'mb-10 grid items-center gap-6 sm:gap-8',
        destination.cover_image_url && 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]',
      )}
    >
      <div>
        <h1 className="space-title break-words font-display">{destination.name}</h1>
        {destination.description && (
          <p className="mt-4 max-w-xl whitespace-pre-line break-words text-sm leading-7 text-muted-foreground sm:text-base">
            {destination.description}
          </p>
        )}
      </div>
      {destination.cover_image_url && (
        <DestinationCover
          src={destination.cover_image_url}
          kind={kind}
          className="aspect-[16/8] rounded-3xl"
          iconClassName="size-14"
          eager
        />
      )}
    </div>
  );
}

export function DiscoverGrid({
  rows,
  kind,
  path,
  page,
  count,
  title,
  emptyTitle,
  emptyDescription,
}: {
  rows: DestinationListRow[];
  kind: DestinationKind;
  path: string;
  page: number;
  count: number;
  title?: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <section aria-label={title ?? 'Destinations'}>
      {title && <h2 className="mb-5 text-xl font-extrabold">{title}</h2>}
      {rows.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {rows.map((row) => {
            const cities = relatedCount(row.children);
            return (
              <li key={row.id}>
                <Link
                  href={`${path}/${kind === 'neighborhoods' ? 'quartiers/' : ''}${row.slug}`}
                  className="group block h-full overflow-hidden rounded-3xl border border-border bg-card shadow-card transition-shadow hover:shadow-lg motion-reduce:transition-none"
                >
                  <DestinationCover
                    kind={kind}
                    src={row.cover_image_url}
                    className="aspect-[16/10] [&>img]:transition-transform [&>img]:duration-500 group-hover:[&>img]:scale-105 motion-reduce:[&>img]:transform-none motion-reduce:[&>img]:transition-none"
                    iconClassName="size-12"
                  />
                  <div className="flex items-center justify-between gap-3 p-5">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-extrabold">{row.name}</h3>
                      {kind === 'countries' && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {cities} {cities === 1 ? 'ville publiée' : 'villes publiées'}
                        </p>
                      )}
                    </div>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-primary-ink transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <ArrowUpRight aria-hidden="true" className="size-4" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}
      <CatalogPagination path={path} page={page} count={count} />
    </section>
  );
}

export async function DiscoverCategories({
  cityId,
  neighborhoodId,
  path,
  params,
}: {
  cityId: string;
  neighborhoodId: string | null;
  path: string;
  params: SearchParams;
}) {
  const db = await sessionDatabase();
  const categories = await listCategories(db);
  const active = categories.find((category) => category.slug === firstParam(params, 'categorie'));
  const page = pageParam(params);
  const entries = active
    ? await new GeographyService(db).publishedEntries(cityId, neighborhoodId, active.id, page)
    : null;

  return (
    <section>
      <h2 className="mb-5 text-xl font-extrabold">Catégories</h2>
      {categories.length ? (
        <nav aria-label="Catégories de la destination" className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link
              key={category.id}
              aria-current={active?.id === category.id ? 'page' : undefined}
              href={withQuery(path, { categorie: category.slug })}
              className={cn(
                'inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium hover:bg-accent',
                active?.id === category.id && 'border-primary bg-accent text-primary-ink',
              )}
            >
              <Compass aria-hidden="true" className="size-4 text-primary-ink" />
              {category.name}
            </Link>
          ))}
        </nav>
      ) : (
        <EmptyState
          title="Aucune catégorie disponible"
          description="Revenez bientôt pour découvrir les premières catégories."
        />
      )}
      {active && entries && (
        <div className="mt-7">
          <h3 className="mb-4 text-lg font-bold">{active.name}</h3>
          {entries.rows.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entries.rows.map((entry) => (
                <li key={entry.id}>
                  <Card className="h-full">
                    <h4 className="break-words font-bold">{entry.title}</h4>
                    {entry.description && (
                      <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
                        {entry.description}
                      </p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Aucune fiche publiée"
              description="Les premières découvertes de cette catégorie apparaîtront ici."
            />
          )}
          <CatalogPagination
            path={path}
            page={page}
            count={entries.count}
            query={{ categorie: active.slug }}
          />
        </div>
      )}
    </section>
  );
}
