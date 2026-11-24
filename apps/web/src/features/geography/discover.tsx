import { IntentLink as Link } from '@/components/shared/intent-link';
import { ArrowUpRight } from 'lucide-react';
import { EmptyState, cn } from '@nagi/ui';
import { relatedCount, type Destination, type DestinationListRow } from '@nagi/database';
import type { DestinationKind } from '@nagi/shared';
import { DestinationCover } from './cover';
import { CatalogPagination } from './navigation';

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
        'md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]',
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
      {
        <DestinationCover
          id={destination.id}
          src={destination.cover_image_url}
          kind={kind}
          className="aspect-[16/8] rounded-3xl"
          iconClassName="size-14"
          eager
        />
      }
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
                    id={row.id}
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
