import Link from 'next/link';
import Form from 'next/form';
import { Search } from 'lucide-react';
import { Button, Input, cn } from '@nagi/ui';
import { requireGuild, spaceServices } from '@/features/spaces/server';
import { CreateTripLink } from '@/features/trips/create-trip-dialog';
import { TripList } from '@/features/trips/trip-list';
import { firstParam, pageParam, withQuery, type SearchParams } from '@/features/geography/model';
import { CatalogPagination } from '@/features/geography/navigation';

export const metadata = { title: 'Voyages' };
const filters = [
  ['', 'Tous les voyages'],
  ['upcoming', 'À venir'],
  ['ongoing', 'En cours'],
  ['completed', 'Terminés'],
] as const;

export default async function Trips({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { guildId } = await params;
  const { guild, isAdmin } = await requireGuild(guildId);
  const criteria = await searchParams;
  const status = filters.find(([id]) => id === firstParam(criteria, 'statut'))?.[0] || undefined;
  const search = firstParam(criteria, 'q')?.trim().slice(0, 100);
  const page = pageParam(criteria);
  const { rows, count } = await (
    await spaceServices()
  ).trips.cards(guildId, { search, status, page });
  const canCreate = isAdmin || guild.members_can_create_trips;
  const path = `/app/${guildId}/trips`;
  return (
    <section className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="space-title">Vos voyages</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Toutes vos aventures, organisées au même endroit.
          </p>
        </div>
        {canCreate && <CreateTripLink guildId={guildId} />}
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <nav aria-label="Filtrer les voyages" className="flex flex-wrap gap-1">
          {filters.map(([id, label]) => (
            <Link
              key={id}
              href={withQuery(path, { statut: id || undefined, q: search })}
              aria-current={(status ?? '') === id ? 'page' : undefined}
              className={cn(
                'rounded-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
                (status ?? '') === id && 'bg-accent font-semibold text-primary-ink',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Form action={path} className="flex w-full items-center gap-2 sm:w-auto">
          {status && <input type="hidden" name="statut" value={status} />}
          <Input
            name="q"
            type="search"
            aria-label="Rechercher un voyage"
            placeholder="Rechercher un voyage"
            maxLength={100}
            defaultValue={search}
            className="h-9 sm:w-52"
          />
          <Button type="submit" size="icon" variant="secondary" aria-label="Rechercher">
            <Search className="size-4" />
          </Button>
        </Form>
      </div>
      <TripList
        trips={rows}
        guildId={guildId}
        canCreate={canCreate}
        filtered={Boolean(status || search)}
      />
      <CatalogPagination
        path={path}
        page={page}
        count={count}
        query={{ statut: status, q: search }}
      />
    </section>
  );
}
