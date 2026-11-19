import { destinationNamePattern, relationReading, type DestinationKind } from '@nagi/shared';
import type { NagiDatabase } from './client';
import type { Database } from './database.types';
import { destinationPageSize } from './geography';

type Tables = Database['public']['Tables'];
export type CatalogCategory = Tables['categories']['Row'];
export type CategoryField = Tables['category_fields']['Row'];
export type CatalogEntry = Tables['entries']['Row'];
export type EntryMedia = Tables['entry_media']['Row'];
export type RelationType = Tables['relation_types']['Row'];

export const entryLocationColumns =
  'country:countries!entries_country_id_fkey(id,name,slug),city:cities!entries_city_id_fkey(id,name,slug,has_neighborhoods),neighborhood:neighborhoods(id,name,slug),category:categories(id,name,slug,icon,color)' as const;
export const cardColumns =
  `id,title,slug,summary,cover_image_url,published,updated_at,latitude,longitude,${entryLocationColumns}` as const;

export type EntryFilters = {
  page: number;
  search?: string;
  categoryId?: string;
  countryId?: string;
  cityId?: string;
  neighborhoodId?: string | null;
  published?: boolean;
};

export async function listCatalogEntries(
  db: NagiDatabase,
  filters: EntryFilters,
  discover = false,
) {
  let query = db.from('entries').select(cardColumns, { count: 'exact' });
  if (filters.search) query = query.ilike('title', destinationNamePattern(filters.search));
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.countryId) query = query.eq('country_id', filters.countryId);
  if (filters.cityId) query = query.eq('city_id', filters.cityId);
  if (filters.neighborhoodId === null) query = query.is('neighborhood_id', null);
  else if (filters.neighborhoodId) query = query.eq('neighborhood_id', filters.neighborhoodId);
  if (filters.published !== undefined) query = query.eq('published', filters.published);
  query = discover
    ? query.order('sort_order').order('title')
    : query.order('updated_at', { ascending: false });
  const start = (filters.page - 1) * destinationPageSize;
  const result = await query.order('id').range(start, start + destinationPageSize - 1);
  if (result.error?.code === 'PGRST103' && filters.page > 1)
    return { rows: [], count: result.count ?? 0 };
  if (result.error) throw new Error('Impossible de charger les fiches.', { cause: result.error });
  return { rows: result.data, count: result.count ?? 0 };
}

export type EntryCardRow = Awaited<ReturnType<typeof listCatalogEntries>>['rows'][number];

export async function catalogEntriesById(db: NagiDatabase, ids: string[], signal?: AbortSignal) {
  const entries = new Map<string, EntryCardRow>();
  for (let offset = 0; offset < ids.length; offset += 75) {
    const query = db
      .from('entries')
      .select(cardColumns)
      .in('id', ids.slice(offset, offset + 75));
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    if (error) throw new Error('Impossible de charger les lieux du voyage.', { cause: error });
    for (const entry of data) entries.set(entry.id, entry);
  }
  return entries;
}

export async function findCatalogEntry(db: NagiDatabase, id: string) {
  const result = await db
    .from('entries')
    .select(`*,${entryLocationColumns}`)
    .eq('id', id)
    .maybeSingle();
  if (result.error) throw new Error('Impossible de charger cette fiche.', { cause: result.error });
  return result.data;
}

export type CatalogEntryDetail = NonNullable<Awaited<ReturnType<typeof findCatalogEntry>>>;

export async function listCategoryFields(db: NagiDatabase, categoryId: string) {
  const result = await db
    .from('category_fields')
    .select('*')
    .eq('category_id', categoryId)
    .order('sort_order')
    .order('id');
  if (result.error)
    throw new Error('Impossible de charger les champs de cette catégorie.', {
      cause: result.error,
    });
  return result.data;
}

export async function listCategoriesAt(
  db: NagiDatabase,
  cityId: string,
  neighborhoodId: string | null,
) {
  const result = await db.rpc('catalog_categories_at', {
    p_city: cityId,
    p_neighborhood: neighborhoodId ?? '',
  });
  if (result.error)
    throw new Error('Impossible de charger les catégories de cette destination.', {
      cause: result.error,
    });
  return result.data;
}

export async function listEntryMedia(db: NagiDatabase, entryId: string) {
  const result = await db
    .from('entry_media')
    .select('*')
    .eq('entry_id', entryId)
    .order('sort_order')
    .order('id');
  if (result.error) throw new Error('Impossible de charger la galerie.', { cause: result.error });
  return result.data;
}

export async function listRelationTypes(db: NagiDatabase) {
  const result = await db
    .from('relation_types')
    .select('*')
    .order('sort_order')
    .order('name')
    .order('id');
  if (result.error)
    throw new Error('Impossible de charger les types de relation.', { cause: result.error });
  return result.data;
}

export async function listEntryRelations(db: NagiDatabase, entryId: string) {
  const result = await db
    .from('entry_relations')
    .select(
      `id,updated_at,created_by,source_id,target_id,type:relation_types(*),source:entries!entry_relations_source_id_fkey(${cardColumns}),target:entries!entry_relations_target_id_fkey(${cardColumns})`,
    )
    .or(`source_id.eq.${entryId},target_id.eq.${entryId}`)
    .order('id');
  if (result.error)
    throw new Error('Impossible de charger les fiches associées.', { cause: result.error });
  return result.data
    .flatMap((relation) => {
      if (!relation.type) return [];
      const reading = relationReading(
        entryId,
        relation.source_id,
        relation.target_id,
        relation.type,
        relation,
      );
      return reading?.entry
        ? [
            {
              ...reading,
              entry: reading.entry,
              id: relation.id,
              type: relation.type,
              updated_at: relation.updated_at,
              source_id: relation.source_id,
              target_id: relation.target_id,
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        a.type.sort_order - b.type.sort_order ||
        a.type.name.localeCompare(b.type.name, 'fr') ||
        a.entry.title.localeCompare(b.entry.title, 'fr'),
    );
}

export type CatalogRelation = Awaited<ReturnType<typeof listEntryRelations>>[number];

export async function listRelationTypeStats(db: NagiDatabase) {
  const { data, error } = await db
    .from('relation_types')
    .select('*,relations:entry_relations(count)')
    .order('sort_order')
    .order('name')
    .order('id');
  if (error) throw new Error('Impossible de charger les types de relation.');
  return data.map(({ relations, ...type }) => ({ ...type, usage_count: relations[0]?.count ?? 0 }));
}
export type RelationTypeStats = Awaited<ReturnType<typeof listRelationTypeStats>>[number];

export async function searchCatalogEntries(
  db: NagiDatabase,
  search: string,
  exclude: string,
  categoryId?: string,
  filters: {
    countryId?: string;
    cityId?: string;
    neighborhoodId?: string;
    page?: number;
    signal?: AbortSignal;
  } = {},
) {
  let query = db.from('entries').select(cardColumns, { count: 'exact' }).neq('id', exclude);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (filters.countryId) query = query.eq('country_id', filters.countryId);
  if (filters.cityId) query = query.eq('city_id', filters.cityId);
  if (filters.neighborhoodId) query = query.eq('neighborhood_id', filters.neighborhoodId);
  if (search) query = query.ilike('title', destinationNamePattern(search));
  const page = filters.page ?? 0;
  const ordered = query
    .order('title')
    .order('id')
    .range(page * 12, page * 12 + 11);
  const result = await (filters.signal ? ordered.abortSignal(filters.signal) : ordered);
  if (result.error?.code === 'PGRST103') return { rows: [], hasMore: false };
  if (result.error)
    throw new Error('Impossible de rechercher des fiches.', { cause: result.error });
  return { rows: result.data, hasMore: (page + 1) * 12 < (result.count ?? 0) };
}

/** At most six real suggestions, ranked by the current entry's neighbourhood and city. */
export async function suggestRelationEntries(
  db: NagiDatabase,
  current: string,
  signal?: AbortSignal,
) {
  const sourceQuery = db.from('entries').select('city_id,neighborhood_id').eq('id', current);
  const source = await (signal ? sourceQuery.abortSignal(signal) : sourceQuery).maybeSingle();
  if (source.error) throw new Error('Impossible de charger les suggestions.');
  if (!source.data) return [];
  const rows: EntryCardRow[] = [];
  async function append(kind: 'neighborhood_id' | 'city_id' | null, id?: string | null) {
    if (rows.length >= 6 || (kind && !id)) return;
    let query = db.from('entries').select(cardColumns).neq('id', current);
    if (kind) query = query.eq(kind, id!);
    if (rows.length) query = query.not('id', 'in', `(${rows.map((r) => r.id).join(',')})`);
    const ordered = query
      .order('updated_at', { ascending: false })
      .order('id')
      .limit(6 - rows.length);
    const result = await (signal ? ordered.abortSignal(signal) : ordered);
    if (result.error) throw new Error('Impossible de charger les suggestions.');
    rows.push(...result.data);
  }
  await append('neighborhood_id', source.data.neighborhood_id);
  await append('city_id', source.data.city_id);
  await append(null);
  return rows;
}

export type CatalogLocation = {
  id: string;
  name: string;
  has_neighborhoods?: boolean;
  iso_code?: string | null;
};

export async function searchCatalogLocations(
  db: NagiDatabase,
  kind: DestinationKind,
  search: string,
  parentId?: string,
  signal?: AbortSignal,
) {
  if (!parentId && kind !== 'countries') return [];
  const query =
    kind === 'countries'
      ? db.from('countries').select('id,name,iso_code')
      : kind === 'cities'
        ? db.from('cities').select('id,name,has_neighborhoods').eq('country_id', parentId!)
        : db.from('neighborhoods').select('id,name').eq('city_id', parentId!);
  const ordered = (search ? query.ilike('name', destinationNamePattern(search)) : query)
    .order('name')
    .order('id')
    .limit(16);
  const result = await (signal ? ordered.abortSignal(signal) : ordered);
  if (result.error)
    throw new Error('Impossible de rechercher des destinations.', { cause: result.error });
  const rows: CatalogLocation[] = result.data;
  return rows;
}
