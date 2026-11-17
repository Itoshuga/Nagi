import { destinationNamePattern, type DestinationKind } from '@nagi/shared';
import type { NagiDatabase } from './client';
import type { Database } from './database.types';

type Tables = Database['public']['Tables'];
export type Country = Tables['countries']['Row'];
export type City = Tables['cities']['Row'];
export type Neighborhood = Tables['neighborhoods']['Row'];
export type Destination = Country | City | Neighborhood;

type Count = { count: number }[] | null;
type Parent = { id: string; name: string };
export type DestinationListRow = Destination & {
  parent?: (Parent & { country?: Parent | null }) | null;
  children?: Count;
  entries?: Count;
};

export function relatedCount(embedded?: Count) {
  return embedded?.[0]?.count ?? 0;
}

export type DestinationFilters = {
  page: number;
  search?: string;
  publication?: boolean;
  parentId?: string;
};

export const destinationPageSize = 18;

/** Uses the caller's Supabase session, including RLS on embedded rows. */
export class GeographyService {
  constructor(private readonly db: NagiDatabase) {}

  async list(kind: DestinationKind, filters: DestinationFilters, discover = false) {
    const count = { count: 'exact' } as const;
    let query =
      kind === 'countries'
        ? this.db.from(kind).select('*, children:cities(count)', count)
        : discover
          ? this.db.from(kind).select('*', count)
          : kind === 'cities'
            ? this.db
                .from(kind)
                .select(
                  '*, parent:countries(id,name), children:neighborhoods(count), entries!entries_city_id_fkey(count)',
                  count,
                )
            : this.db
                .from(kind)
                .select(
                  '*, parent:cities(id,name,country:countries(id,name)), entries(count)',
                  count,
                );

    if (discover) {
      query = query.eq('is_published', true);
      if (kind === 'countries') query = query.filter('children.is_published', 'eq', true);
    } else if (filters.publication !== undefined) {
      query = query.eq('is_published', filters.publication);
    }
    if (filters.parentId && kind !== 'countries') {
      query = query.filter(kind === 'cities' ? 'country_id' : 'city_id', 'eq', filters.parentId);
    }
    if (filters.search) query = query.ilike('name', destinationNamePattern(filters.search));

    const start = (filters.page - 1) * destinationPageSize;
    const result = await query
      .order('sort_order')
      .order('name')
      .order('id')
      .range(start, start + destinationPageSize - 1);
    if (result.error?.code === 'PGRST103' && filters.page > 1)
      return { rows: [], count: result.count ?? 0 };
    if (result.error)
      throw new Error('Impossible de charger les destinations.', { cause: result.error });
    const rows: DestinationListRow[] = result.data;
    return { rows, count: result.count ?? 0 };
  }

  async total(kind: DestinationKind) {
    const result = await this.db.from(kind).select('id', { count: 'exact', head: true });
    if (result.error)
      throw new Error('Impossible de compter les destinations.', { cause: result.error });
    return result.count ?? 0;
  }

  async get(kind: DestinationKind, id: string) {
    const result = await this.db.from(kind).select('*').eq('id', id).maybeSingle();
    if (result.error)
      throw new Error('Impossible de charger cette destination.', { cause: result.error });
    return result.data;
  }

  async countryOptions() {
    const result = await this.db
      .from('countries')
      .select('id,name,iso_code')
      .order('name')
      .order('id')
      .limit(500);
    if (result.error) throw new Error('Impossible de charger les pays.', { cause: result.error });
    return result.data;
  }

  async eligibleCities(search: string) {
    const result = await this.db
      .from('cities')
      .select('id,name,countries(name)')
      .eq('has_neighborhoods', true)
      .ilike('name', destinationNamePattern(search))
      .order('name')
      .order('id')
      .limit(12);
    if (result.error)
      throw new Error('Impossible de rechercher les villes.', { cause: result.error });
    return result.data;
  }

  async countEntries(destination: City | Neighborhood) {
    const result = await this.db
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('country_id' in destination ? 'city_id' : 'neighborhood_id', destination.id);
    if (result.error)
      throw new Error('Impossible de vérifier les fiches associées.', { cause: result.error });
    return result.count ?? 0;
  }

  async publishedCountry(slug: string) {
    const result = await this.db
      .from('countries')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (result.error) throw new Error('Impossible de charger le pays.', { cause: result.error });
    return result.data;
  }

  async publishedCity(countrySlug: string, citySlug: string) {
    const result = await this.db
      .from('cities')
      .select('*,country:countries!inner(*)')
      .eq('slug', citySlug)
      .eq('is_published', true)
      .eq('country.slug', countrySlug)
      .eq('country.is_published', true)
      .maybeSingle();
    if (result.error) throw new Error('Impossible de charger la ville.', { cause: result.error });
    return result.data;
  }

  async publishedNeighborhood(countrySlug: string, citySlug: string, slug: string) {
    const result = await this.db
      .from('neighborhoods')
      .select('*,city:cities!inner(*,country:countries!inner(*))')
      .eq('slug', slug)
      .eq('is_published', true)
      .eq('city.slug', citySlug)
      .eq('city.is_published', true)
      .eq('city.has_neighborhoods', true)
      .eq('city.country.slug', countrySlug)
      .eq('city.country.is_published', true)
      .maybeSingle();
    if (result.error)
      throw new Error('Impossible de charger le quartier.', { cause: result.error });
    return result.data;
  }

  async publishedEntries(
    cityId: string,
    neighborhoodId: string | null,
    categoryId: string,
    page: number,
  ) {
    let query = this.db
      .from('entries')
      .select('id,title,description', { count: 'exact' })
      .eq('city_id', cityId)
      .eq('category_id', categoryId)
      .eq('published', true);
    query = neighborhoodId
      ? query.eq('neighborhood_id', neighborhoodId)
      : query.is('neighborhood_id', null);
    const start = (page - 1) * destinationPageSize;
    const result = await query
      .order('title')
      .order('id')
      .range(start, start + destinationPageSize - 1);
    if (result.error?.code === 'PGRST103' && page > 1)
      return { rows: [], count: result.count ?? 0 };
    if (result.error) throw new Error('Impossible de charger les fiches.', { cause: result.error });
    return { rows: result.data, count: result.count ?? 0 };
  }
}
