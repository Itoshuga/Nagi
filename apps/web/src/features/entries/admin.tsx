import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Input, Label } from '@nagi/ui';
import { destinationIdSchema } from '@nagi/shared';
import {
  findCatalogEntry,
  listCatalogEntries,
  listCategories,
  listCategoryFields,
} from '@nagi/database';
import { requireAdmin } from '@/features/auth/session';
import { CatalogSelect } from '@/features/catalog/admin-form';
import { firstParam, pageParam, type SearchParams } from '@/features/geography/model';
import { CatalogPagination } from '@/features/geography/navigation';
import { EntryImage } from '@/features/media/image';
import { DeferredEntryPanel } from './panels';
import { sessionDatabase } from '@/lib/supabase/server';
import { EntryForm } from './form';
import { EntryLocationFields } from './location';
import { maxCoverSize } from '@/features/geography/storage';
import { ArrowLeft, Eye } from 'lucide-react';

const adminPath = '/admin/entries';
const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

export async function AdminEntries({ params }: { params: SearchParams }) {
  await requireAdmin();
  const db = await sessionDatabase();
  const getId = (key: string) => {
    const result = destinationIdSchema.safeParse(firstParam(params, key));
    return result.success ? result.data : undefined;
  };
  const countryId = getId('pays');
  const cityId = getId('ville');
  const neighborhoodId = getId('quartier');
  const search = firstParam(params, 'q')?.trim().slice(0, 100) || undefined;
  const status = firstParam(params, 'statut');
  const published = status === 'publiee' ? true : status === 'brouillon' ? false : undefined;
  const page = pageParam(params);

  const [countryResult, cityResult, neighborhoodResult, categories] = await Promise.all([
    countryId ? db.from('countries').select('id,name').eq('id', countryId).maybeSingle() : null,
    countryId && cityId
      ? db
          .from('cities')
          .select('id,name,has_neighborhoods')
          .eq('id', cityId)
          .eq('country_id', countryId)
          .maybeSingle()
      : null,
    cityId && neighborhoodId
      ? db
          .from('neighborhoods')
          .select('id,name')
          .eq('id', neighborhoodId)
          .eq('city_id', cityId)
          .maybeSingle()
      : null,
    listCategories(db),
  ]);
  if (countryResult?.error || cityResult?.error || neighborhoodResult?.error)
    throw new Error('Impossible de charger les filtres.');
  const country = countryResult?.data ?? undefined;
  const city = country ? (cityResult?.data ?? undefined) : undefined;
  const neighborhood = city?.has_neighborhoods
    ? (neighborhoodResult?.data ?? undefined)
    : undefined;
  const requestedCategoryId = getId('categorie');
  const categoryId = categories.find((category) => category.id === requestedCategoryId)?.id;
  const { rows, count } = await listCatalogEntries(db, {
    page,
    search,
    published,
    categoryId,
    countryId: country?.id,
    cityId: city?.id,
    neighborhoodId: neighborhood?.id,
  });

  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {count} {count === 1 ? 'fiche' : 'fiches'}
        </p>
        <Button asChild>
          <Link href={`${adminPath}/new`}>Ajouter une fiche</Link>
        </Button>
      </div>
      <Card>
        <form
          action={adminPath}
          key={[search, categoryId, country?.id, city?.id, neighborhood?.id, status].join('-')}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="entry-search">Titre</Label>
              <Input
                id="entry-search"
                name="q"
                type="search"
                maxLength={100}
                defaultValue={search}
                placeholder="Rechercher une fiche"
              />
            </div>
            <div>
              <Label htmlFor="entry-filter-category">Catégorie</Label>
              <CatalogSelect
                id="entry-filter-category"
                name="categorie"
                defaultValue={categoryId ?? ''}
              >
                <option value="">Toutes les catégories</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </CatalogSelect>
            </div>
            <div>
              <Label htmlFor="entry-filter-status">Publication</Label>
              <CatalogSelect
                id="entry-filter-status"
                name="statut"
                defaultValue={published === undefined ? '' : status}
              >
                <option value="">Tous les statuts</option>
                <option value="brouillon">Brouillons</option>
                <option value="publiee">Publiées</option>
              </CatalogSelect>
            </div>
          </div>
          <EntryLocationFields filter initial={{ country, city, neighborhood }} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm">
              Appliquer les filtres
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={adminPath}>Réinitialiser</Link>
            </Button>
          </div>
        </form>
      </Card>
      {rows.length ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Fiche
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Localisation
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Publication
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Modification
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <EntryImage
                        src={entry.cover_image_url}
                        className="h-11 w-14 shrink-0 rounded-lg"
                        sizes="56px"
                      />
                      <div>
                        <Link
                          href={`${adminPath}/${entry.id}`}
                          className="break-words font-semibold hover:underline"
                        >
                          {entry.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {entry.category?.name}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {[entry.country?.name, entry.city?.name, entry.neighborhood?.name]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={entry.published ? 'bg-accent text-primary-ink' : undefined}>
                      {entry.published ? 'Publiée' : 'Brouillon'}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    <time dateTime={entry.updated_at}>
                      {date.format(new Date(entry.updated_at))}
                    </time>
                  </td>
                  <td className="px-4 py-3">
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`${adminPath}/${entry.id}`}
                        aria-label={`Modifier ${entry.title}`}
                      >
                        Modifier
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState
          title="Aucune fiche trouvée"
          description="Modifiez vos filtres ou ajoutez la première fiche correspondant à cette recherche."
        />
      )}
      <CatalogPagination
        path={adminPath}
        page={page}
        count={count}
        query={{
          q: search,
          categorie: categoryId,
          pays: country?.id,
          ville: city?.id,
          quartier: neighborhood?.id,
          statut: status,
        }}
      />
    </div>
  );
}

export async function AdminEntry({ id }: { id?: string }) {
  await requireAdmin();
  const db = await sessionDatabase();
  const [entry, categories] = await Promise.all([
    id ? findCatalogEntry(db, id) : null,
    listCategories(db),
  ]);
  if (id && !entry) notFound();
  const [fields, mediaCount, relationCount] = entry
    ? await Promise.all([
        listCategoryFields(db, entry.category_id),
        db
          .from('entry_media')
          .select('id', { count: 'exact', head: true })
          .eq('entry_id', entry.id),
        db
          .from('entry_relations')
          .select('id', { count: 'exact', head: true })
          .or(`source_id.eq.${entry.id},target_id.eq.${entry.id}`),
      ])
    : [[], null, null];
  if (mediaCount?.error || relationCount?.error)
    throw new Error('Impossible de charger les compteurs.');
  const refreshKey = crypto.randomUUID();
  const current = entry
    ? {
        id: entry.id,
        title: entry.title,
        cover_image_url: entry.cover_image_url,
        category: entry.category,
        country: entry.country,
        city: entry.city,
        neighborhood: entry.neighborhood,
      }
    : null;
  return (
    <div className="max-w-5xl space-y-5">
      <header className="entry-editor-header pb-2">
        <Link href={adminPath} className="text-sm font-medium text-primary-ink hover:underline">
          <span className="inline-flex items-center gap-2 text-xs">
            <ArrowLeft className="size-3.5" />
            Retour aux fiches
          </span>
        </Link>
        <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">
                Catalogue Nagi
              </p>
              {entry && <Badge>{entry.published ? 'Publiée' : 'Brouillon'}</Badge>}
            </div>
            <h1 className="break-words text-3xl font-extrabold tracking-[-.045em] sm:text-4xl">
              {entry?.title ?? 'Créer une fiche'}
            </h1>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              {entry
                ? 'Le contenu, les images et les liens de votre fiche, chacun à leur place.'
                : 'Un lieu, une expérience, une bonne adresse. Commencez par l’essentiel.'}
            </p>
          </div>
          {entry && (
            <Button asChild variant="secondary">
              <Link href={`${adminPath}/${entry.id}/preview`}>
                <Eye className="size-4" />
                Prévisualiser
              </Link>
            </Button>
          )}
        </div>
      </header>
      {!categories.length ? (
        <EmptyState
          title="Ajoutez une catégorie pour continuer"
          description="Chaque fiche appartient à une catégorie globale."
        >
          <Button asChild className="mt-4">
            <Link href="/admin/categories/new">Créer une catégorie</Link>
          </Button>
        </EmptyState>
      ) : (
        <EntryForm
          entry={entry ?? undefined}
          categories={categories}
          fields={fields}
          mediaCount={mediaCount?.count ?? 0}
          relationCount={relationCount?.count ?? 0}
          media={
            entry && (
              <DeferredEntryPanel
                kind="medias"
                current={current!}
                categories={categories}
                maxFileSize={maxCoverSize()}
                refreshKey={refreshKey}
              />
            )
          }
          relations={
            entry && (
              <DeferredEntryPanel
                kind="relations"
                current={current!}
                categories={categories}
                maxFileSize={maxCoverSize()}
                refreshKey={refreshKey}
              />
            )
          }
        />
      )}
    </div>
  );
}
