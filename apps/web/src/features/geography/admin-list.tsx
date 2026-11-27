import Link from 'next/link';
import Form from 'next/form';
import { Eye, EyeOff, Plus, Search } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input } from '@nagi/ui';
import { GeographyService, relatedCount, type DestinationListRow } from '@nagi/database';
import type { DestinationKind } from '@nagi/shared';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';
import { DestinationMenu } from './admin-menu';
import { CountryImportButton } from './country-import';
import { DestinationCover } from './cover';
import {
  destinationLabels,
  firstParam,
  idParam,
  pageParam,
  selectClass,
  withQuery,
  type SearchParams,
} from './model';
import { CatalogPagination } from './navigation';

function publicationOptions() {
  return (
    <>
      <option value="">Tous les statuts</option>
      <option value="published">Publiés</option>
      <option value="draft">Brouillons</option>
    </>
  );
}

export function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${new Intl.NumberFormat('fr-FR').format(count)} ${count === 1 ? singular : plural}`;
}

export function PublicationBadge({
  kind,
  published,
}: {
  kind: DestinationKind;
  published: boolean;
}) {
  const Icon = published ? Eye : EyeOff;
  return (
    <Badge className={published ? 'bg-accent text-primary-ink' : undefined}>
      <Icon aria-hidden="true" className="size-3.5" />
      {published ? destinationLabels[kind].published : 'Brouillon'}
    </Badge>
  );
}

export function dependencyLabels(kind: DestinationKind, children: number, entries: number) {
  const labels = [];
  if (children) labels.push(countLabel(children, kind === 'countries' ? 'ville' : 'quartier'));
  if (entries) labels.push(countLabel(entries, 'fiche associée', 'fiches associées'));
  return labels;
}

export function DestinationRows({
  kind,
  rows,
  emptyTitle,
  emptyDescription,
}: {
  kind: DestinationKind;
  rows: DestinationListRow[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!rows.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <Card className="p-0">
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_8.5rem_3rem] items-center gap-3 border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground sm:grid sm:px-5"
      >
        <span>Destination</span>
        <span>{kind === 'neighborhoods' ? 'Ville' : 'Organisation'}</span>
        <span>Publication</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const childCount = relatedCount(row.children);
          const href = `/admin/${kind}/${row.id}`;
          return (
            <li
              key={row.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_8.5rem_3rem] sm:px-5"
            >
              <Link
                href={href}
                className="group col-start-1 row-start-1 flex min-w-0 items-center gap-3 rounded-lg"
              >
                <DestinationCover
                  id={row.id}
                  src={row.cover_image_url}
                  kind={kind}
                  className="h-11 w-14 shrink-0 rounded-lg"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold group-hover:underline">
                    {row.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {'iso_code' in row
                      ? (row.iso_code ?? 'Code ISO à renseigner')
                      : 'country_id' in row
                        ? row.parent?.name
                        : row.parent?.country?.name}
                  </span>
                </span>
              </Link>
              <div className="col-start-1 row-start-2 min-w-0 text-xs text-muted-foreground sm:col-start-2 sm:row-start-1 sm:text-sm">
                {kind === 'countries'
                  ? countLabel(childCount, 'ville')
                  : 'has_neighborhoods' in row
                    ? row.has_neighborhoods
                      ? countLabel(childCount, 'quartier')
                      : 'Sans quartiers'
                    : row.parent?.name}
                {'has_neighborhoods' in row && row.has_neighborhoods && childCount === 0 && (
                  <span className="ml-1">· Mode activé</span>
                )}
              </div>
              <div className="col-start-2 row-start-2 sm:col-start-3 sm:row-start-1">
                <PublicationBadge kind={kind} published={row.is_published} />
              </div>
              <div className="col-start-2 row-start-1 justify-self-end sm:col-start-4">
                <DestinationMenu
                  kind={kind}
                  id={row.id}
                  name={row.name}
                  version={row.updated_at}
                  published={row.is_published}
                  dependencies={dependencyLabels(kind, childCount, relatedCount(row.entries))}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export async function AdminDestinationList({
  kind,
  params,
}: {
  kind: DestinationKind;
  params: SearchParams;
}) {
  await requireAdmin();
  const catalog = new GeographyService(await sessionDatabase());
  const path = `/admin/${kind}`;
  const page = pageParam(params);
  const search = firstParam(params, 'q')?.trim().slice(0, 100);
  const status = firstParam(params, 'statut');
  const publication = status === 'published' ? true : status === 'draft' ? false : undefined;
  const parentId = kind === 'cities' ? idParam(params, 'pays') : undefined;
  const filtered = !!search || publication !== undefined || !!parentId;
  const [list, total, countries] = await Promise.all([
    catalog.list(kind, { page, search, publication, parentId }),
    filtered ? catalog.total(kind) : null,
    kind === 'cities' ? catalog.countryOptions() : [],
  ]);
  const labels = destinationLabels[kind];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-title font-display">{labels.plural}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {countLabel(total ?? list.count, labels.singular, labels.plural.toLowerCase())} dans le
            catalogue
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {kind === 'countries' && <CountryImportButton />}
          <Button asChild>
            <Link href={withQuery(`${path}/new`, { pays: parentId })}>
              <Plus className="size-4" />
              {labels.add}
            </Link>
          </Button>
        </div>
      </div>
      <Form
        action={path}
        className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3"
        role="search"
        aria-label={`Rechercher dans la section ${labels.plural.toLowerCase()}`}
      >
        <div className="relative min-w-44 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
          />
          <Input
            name="q"
            aria-label="Rechercher par nom"
            placeholder="Rechercher par nom"
            defaultValue={search}
            maxLength={100}
            className="pl-9"
          />
        </div>
        {kind === 'cities' && (
          <label className="min-w-36 flex-1 sm:flex-none">
            <span className="sr-only">Pays</span>
            <select name="pays" defaultValue={parentId ?? ''} className={selectClass}>
              <option value="">Tous les pays</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="min-w-36 flex-1 sm:flex-none">
          <span className="sr-only">Publication</span>
          <select
            aria-label="Statut de publication"
            name="statut"
            defaultValue={status ?? ''}
            className={selectClass}
          >
            {publicationOptions()}
          </select>
        </label>
        <Button variant="secondary" type="submit">
          Filtrer
        </Button>
        {filtered && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={path}>Réinitialiser</Link>
          </Button>
        )}
      </Form>
      {filtered && (
        <p className="mb-3 text-xs text-muted-foreground">{countLabel(list.count, 'résultat')}</p>
      )}
      <DestinationRows
        kind={kind}
        rows={list.rows}
        emptyTitle={
          filtered
            ? 'Aucun résultat'
            : `Aucun ${kind === 'cities' ? 'lieu' : labels.singular} pour le moment`
        }
        emptyDescription={
          filtered
            ? 'Modifiez la recherche ou les filtres pour afficher d’autres destinations.'
            : 'Ajoutez une destination pour commencer.'
        }
      />
      <CatalogPagination
        path={path}
        page={page}
        count={list.count}
        query={{ q: search, statut: status, pays: parentId }}
      />
    </>
  );
}
