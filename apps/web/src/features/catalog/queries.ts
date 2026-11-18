import 'server-only';
import { unstable_cache } from 'next/cache';
import {
  GeographyService,
  findCatalogEntry,
  listCatalogEntries,
  listCategories,
  listCategoriesAt,
  listCategoryFields,
  listEntryMedia,
  listEntryRelations,
  type DestinationFilters,
  type EntryFilters,
} from '@nagi/database';
import type { DestinationKind } from '@nagi/shared';
import { publicCatalogDatabase } from '@/lib/supabase/server';

export const publishedCatalogTag = 'published-catalog';
const options = { revalidate: 60, tags: [publishedCatalogTag] };

// These caches only use anonymous RLS. Authenticated/admin clients never enter them.
export const publishedGeography = {
  list: unstable_cache(
    (kind: DestinationKind, filters: DestinationFilters) =>
      new GeographyService(publicCatalogDatabase()).list(kind, filters, true),
    ['published-destinations'],
    options,
  ),
  country: unstable_cache(
    (slug: string) => new GeographyService(publicCatalogDatabase()).publishedCountry(slug),
    ['published-country'],
    options,
  ),
  city: unstable_cache(
    (country: string, city: string) =>
      new GeographyService(publicCatalogDatabase()).publishedCity(country, city),
    ['published-city'],
    options,
  ),
  neighborhood: unstable_cache(
    (country: string, city: string, neighborhood: string) =>
      new GeographyService(publicCatalogDatabase()).publishedNeighborhood(
        country,
        city,
        neighborhood,
      ),
    ['published-neighborhood'],
    options,
  ),
};

export const publishedCatalog = {
  categories: unstable_cache(
    () => listCategories(publicCatalogDatabase()),
    ['published-categories'],
    options,
  ),
  categoriesAt: unstable_cache(
    (city: string, neighborhood: string | null) =>
      listCategoriesAt(publicCatalogDatabase(), city, neighborhood),
    ['published-categories-at'],
    options,
  ),
  entries: unstable_cache(
    (filters: EntryFilters) =>
      listCatalogEntries(publicCatalogDatabase(), { ...filters, published: true }, true),
    ['published-entries'],
    options,
  ),
  entry: unstable_cache(
    (id: string) => findCatalogEntry(publicCatalogDatabase(), id),
    ['published-entry'],
    options,
  ),
  content: unstable_cache(
    (id: string, category: string) => {
      const db = publicCatalogDatabase();
      return Promise.all([
        listEntryMedia(db, id),
        listCategoryFields(db, category),
        listEntryRelations(db, id),
      ]);
    },
    ['published-entry-content'],
    options,
  ),
};
