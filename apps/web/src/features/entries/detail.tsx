import Link from 'next/link';
import { ArrowUpRight, Compass, MapPin } from 'lucide-react';
import { Badge } from '@nagi/ui';
import {
  listCategoryFields,
  listEntryMedia,
  listEntryRelations,
  type CatalogEntryDetail,
  type CatalogRelation,
  type NagiDatabase,
} from '@nagi/database';
import { catalogButtonsValue, safeCatalogUrl } from '@nagi/shared';
import { CategoryIcon } from '@/features/categories/icon';
import { Breadcrumbs } from '@/features/geography/navigation';
import { withQuery } from '@/features/geography/model';
import { EntryImage } from '@/features/media/image';
import { entryMediaUrl } from '@/features/media/model';
import { EntryCard, entryHref } from './discovery';
import { EntryRichText } from './rich-text';
import { AddPlaceDialog } from '@/features/trips/add-place-dialog';
import { FieldIcon } from '@/features/icons/field-icon';

function groupRelations(relations: CatalogRelation[]) {
  const groups = new Map<string, { label: string; relations: CatalogRelation[] }>();
  for (const relation of relations) {
    const label = relation.isIncoming ? relation.type.inverse_label : relation.type.forward_label;
    const key = `${relation.type.id}:${label}`;
    const current = groups.get(key);
    if (current) current.relations.push(relation);
    else groups.set(key, { label, relations: [relation] });
  }
  return [...groups.entries()];
}

export async function CatalogEntryPage({
  db,
  entry,
  guildId,
}: {
  db: NagiDatabase;
  entry: CatalogEntryDetail;
  guildId?: string;
}) {
  const [media, fields, relations] = await Promise.all([
    listEntryMedia(db, entry.id),
    listCategoryFields(db, entry.category_id),
    listEntryRelations(db, entry.id),
  ]);
  const cover = media.find((image) => entryMediaUrl(image) === entry.cover_image_url);
  const custom =
    entry.custom_values &&
    typeof entry.custom_values === 'object' &&
    !Array.isArray(entry.custom_values)
      ? entry.custom_values
      : {};
  const metadata = fields.flatMap((field) => {
    const value = custom[field.id];
    const heading = { label: field.label, icon: field.icon };
    if (field.type === 'buttons') return [];
    if (value == null) return [];
    if (typeof value === 'boolean')
      return [{ ...heading, text: value ? 'Oui' : 'Non', href: null }];
    if (typeof value === 'number')
      return [{ ...heading, text: new Intl.NumberFormat('fr-FR').format(value), href: null }];
    if (Array.isArray(value)) return [{ ...heading, text: value.join(' · '), href: null }];
    if (typeof value === 'string') {
      const href = field.type === 'url' ? safeCatalogUrl(value) : null;
      return [{ ...heading, text: value, href }];
    }
    return [];
  });
  const buttonGroups = fields.flatMap((field) => {
    if (field.type !== 'buttons') return [];
    const parsed = catalogButtonsValue.safeParse(custom[field.id]);
    return parsed.success && parsed.data.length
      ? [{ id: field.id, label: field.label, icon: field.icon, buttons: parsed.data }]
      : [];
  });
  const coordinates =
    entry.latitude !== null && entry.longitude !== null ? [entry.latitude, entry.longitude] : null;
  const location = [entry.neighborhood?.name, entry.city?.name, entry.country?.name]
    .filter(Boolean)
    .join(' · ');
  const base = `/app/${guildId}/discover`;
  const country = entry.country ? `${base}/${entry.country.slug}` : base;
  const city = entry.city ? `${country}/${entry.city.slug}` : country;
  const neighborhood = entry.neighborhood ? `${city}/quartiers/${entry.neighborhood.slug}` : city;
  const headingLinks = [{ label: 'Découvrir', href: base }];
  if (entry.country) headingLinks.push({ label: entry.country.name, href: country });
  if (entry.city) headingLinks.push({ label: entry.city.name, href: city });
  if (entry.neighborhood) headingLinks.push({ label: entry.neighborhood.name, href: neighborhood });
  if (entry.category)
    headingLinks.push({
      label: entry.category.name,
      href: withQuery(neighborhood, { categorie: entry.category.slug }),
    });
  const gallery = media.filter((image) => image.id !== cover?.id);

  return (
    <article className="mx-auto max-w-6xl pb-10">
      {guildId ? (
        <Breadcrumbs links={[...headingLinks, { label: entry.title }]} />
      ) : (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/entries/${entry.id}`}
            className="text-sm font-medium text-primary-ink hover:underline"
          >
            ← Modifier la fiche
          </Link>
          <Badge>{entry.published ? 'Aperçu administrateur' : 'Aperçu du brouillon'}</Badge>
        </div>
      )}
      <header className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-card">
        {cover && (
          <EntryImage
            src={entryMediaUrl(cover)}
            alt={cover.alt_text}
            eager
            className="aspect-[16/9] max-h-[32rem] sm:aspect-[2/1]"
            sizes="(max-width: 768px) 100vw, 1152px"
          />
        )}
        <div className="space-y-4 px-6 py-7 sm:px-10 sm:py-9">
          {entry.category && (
            <div className="flex items-center gap-2 text-sm font-semibold text-primary-ink">
              <CategoryIcon name={entry.category.icon} color={entry.category.color} />
              {entry.category.name}
            </div>
          )}
          <h1 className="space-title break-words font-display">{entry.title}</h1>
          {location && (
            <p className="flex items-start gap-2 text-sm font-medium text-muted-foreground">
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              {location}
            </p>
          )}
          {entry.summary && (
            <p className="max-w-3xl break-words text-base leading-relaxed text-muted-foreground sm:text-lg">
              {entry.summary}
            </p>
          )}
          {guildId && (
            <AddPlaceDialog
              guildId={guildId}
              entry={{
                id: entry.id,
                title: entry.title,
                summary: entry.summary,
                cover_image_url: entry.cover_image_url,
                category: entry.category,
                country: entry.country,
                city: entry.city,
                neighborhood: entry.neighborhood,
              }}
            />
          )}
        </div>
      </header>
      {buttonGroups.length > 0 && (
        <div className="mt-6 space-y-5 rounded-3xl border border-border bg-card p-6 sm:px-8">
          {buttonGroups.map((group) => (
            <section key={group.id} aria-labelledby={`buttons-${group.id}`}>
              <h2 id={`buttons-${group.id}`} className="mb-3 text-sm font-bold">
                {group.label}
              </h2>
              <ul className="flex flex-wrap gap-2.5">
                {group.buttons.map((button, index) => (
                  <li key={index} className="max-w-full">
                    <a
                      href={safeCatalogUrl(button.url)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-border bg-accent/50 px-5 py-3 text-sm font-semibold text-primary-ink transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <FieldIcon name={group.icon} />
                      <span className="min-w-0 break-words">{button.label}</span>
                      <ArrowUpRight className="size-4 shrink-0" />
                      <span className="sr-only"> (nouvel onglet)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {(entry.description || metadata.length > 0 || coordinates) && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
          {entry.description && (
            <section className="min-w-0 rounded-3xl border border-border bg-card p-6 sm:p-8">
              <h2 className="mb-5 text-xl font-extrabold">À propos</h2>
              <EntryRichText text={entry.description} />
            </section>
          )}
          {(metadata.length > 0 || coordinates) && (
            <section className="self-start rounded-3xl border border-border bg-card p-6">
              <h2 className="mb-4 text-lg font-extrabold">Informations pratiques</h2>
              <dl className="space-y-3">
                {metadata.map(({ label, text, href, icon }, index) => (
                  <div key={index} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <dt className="flex items-center gap-2 text-sm font-semibold">
                      <FieldIcon name={icon} className="text-primary-ink" />
                      {label}
                    </dt>
                    <dd className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-ink underline underline-offset-4"
                        >
                          {text}
                        </a>
                      ) : (
                        text
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {coordinates && (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Compass className="size-4 text-primary-ink" aria-hidden="true" />
                  <span>
                    <span className="sr-only">Coordonnées </span>
                    {coordinates.map((value) => value.toFixed(5)).join(' / ')}
                  </span>
                </p>
              )}
            </section>
          )}
        </div>
      )}
      {gallery.length > 0 && (
        <section className="mt-9">
          <h2 className="mb-4 text-xl font-extrabold">Galerie</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((image, index) => (
              <li key={image.id}>
                <Link
                  href={entryMediaUrl(image)}
                  target="_blank"
                  prefetch={false}
                  className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label={image.alt_text || `Ouvrir l’image ${index + 1}`}
                >
                  <EntryImage
                    src={entryMediaUrl(image)}
                    alt={image.alt_text}
                    className="aspect-[4/3] rounded-2xl"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {groupRelations(relations).map(([key, group]) => (
        <section key={key} className="mt-9">
          <h2 className="mb-4 break-words font-display text-2xl font-extrabold">{group.label}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.relations.map(({ id, entry: linked }) => (
              <li key={id}>
                <EntryCard
                  entry={linked}
                  href={
                    guildId ? entryHref(guildId, linked) : `/admin/entries/${linked.id}/preview`
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
