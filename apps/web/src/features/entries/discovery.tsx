import { IntentLink as Link } from '@/components/shared/intent-link';
import { ArrowUpRight, MapPin, Search } from 'lucide-react';
import { Button, EmptyState, Input, cn } from '@nagi/ui';
import type { EntryCardRow } from '@nagi/database';
import { publishedCatalog } from '@/features/catalog/queries';
import { CategoryIcon } from '@/features/categories/icon';
import { EntryImage } from '@/features/media/image';
import { CatalogPagination } from '@/features/geography/navigation';
import { firstParam, pageParam, withQuery, type SearchParams } from '@/features/geography/model';

import { entryHref } from './links';
export { entryHref } from './links';

export function EntryCard({ entry, href }: { entry: EntryCardRow; href: string }) {
  const location = [entry.neighborhood?.name, entry.city?.name, entry.country?.name]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      href={href}
      className="group block h-full overflow-hidden rounded-3xl border border-border bg-card shadow-card transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
    >
      <EntryImage
        src={entry.cover_image_url}
        className="aspect-[16/10] [&>img]:transition-transform [&>img]:duration-500 group-hover:[&>img]:scale-105 motion-reduce:[&>img]:transform-none motion-reduce:[&>img]:transition-none"
      />
      <div className="relative space-y-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-primary-ink">{entry.category?.name}</span>
          <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-primary-ink" />
        </div>
        <h3 className="break-words font-display text-xl font-extrabold">{entry.title}</h3>
        {entry.summary && (
          <p className="line-clamp-3 break-words text-sm leading-relaxed text-muted-foreground">
            {entry.summary}
          </p>
        )}
        {location && (
          <p className="flex items-start gap-1.5 break-words text-xs text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            {location}
          </p>
        )}
      </div>
    </Link>
  );
}

export async function DiscoverEntryCategories({
  cityId,
  neighborhoodId,
  guildId,
  path,
  params,
}: {
  cityId: string;
  neighborhoodId: string | null;
  guildId: string;
  path: string;
  params: SearchParams;
}) {
  const categories = await publishedCatalog.categoriesAt(cityId, neighborhoodId);
  const active = categories.find((category) => category.slug === firstParam(params, 'categorie'));
  const page = pageParam(params);
  const search = firstParam(params, 'q')?.trim().slice(0, 100) || undefined;
  const entries = active
    ? await publishedCatalog.entries({
        cityId,
        neighborhoodId,
        categoryId: active.id,
        page,
        search,
        published: true,
      })
    : null;
  return (
    <section>
      <h2 className="mb-5 text-xl font-extrabold">Explorer le catalogue</h2>
      {categories.length ? (
        <nav
          aria-label="Catégories de la destination"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {categories.map((category) => {
            return (
              <Link
                key={category.id}
                aria-current={active?.id === category.id ? 'page' : undefined}
                href={withQuery(path, { categorie: category.slug })}
                className={cn(
                  'flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card p-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                  active?.id === category.id && 'border-primary bg-accent',
                )}
              >
                <CategoryIcon name={category.icon} color={category.color} />
                <span className="block min-w-0">
                  <span className="block break-words text-sm font-bold">{category.name}</span>
                  {category.description && (
                    <span className="block line-clamp-1 text-xs text-muted-foreground">
                      {category.description}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
      ) : (
        <EmptyState
          title="Aucune fiche publiée ici"
          description="Les découvertes de cette destination apparaîtront dès leur publication."
        />
      )}
      {active && entries && (
        <div className="mt-8" id="fiches">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="break-words font-display text-2xl font-extrabold">{active.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {entries.count} {entries.count === 1 ? 'fiche' : 'fiches'}
              </p>
            </div>
            <form action={path} className="flex w-full flex-wrap gap-2 sm:w-auto">
              <input type="hidden" name="categorie" value={active.slug} />
              <Input
                name="q"
                type="search"
                maxLength={100}
                defaultValue={search}
                aria-label={`Rechercher dans ${active.name}`}
                placeholder="Chercher par titre"
                className="min-w-32 flex-1 sm:w-52"
              />
              <Button
                type="submit"
                variant="secondary"
                size="icon"
                aria-label="Lancer la recherche"
              >
                <Search className="size-4" />
              </Button>
            </form>
          </div>
          {entries.rows.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entries.rows.map((entry) => (
                <li key={entry.id}>
                  <EntryCard entry={entry} href={entryHref(guildId, entry)} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Aucune fiche correspondante"
              description="Essayez un autre titre ou changez de catégorie."
            />
          )}
          <CatalogPagination
            path={path}
            page={page}
            count={entries.count}
            query={{ categorie: active.slug, q: search }}
          />
        </div>
      )}
    </section>
  );
}
