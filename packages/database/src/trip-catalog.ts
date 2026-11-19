import { destinationNamePattern, relationReading, type TripPlaceQuery } from '@nagi/shared';
import type { NagiDatabase } from './client';
import { cardColumns, catalogEntriesById, type EntryCardRow } from './catalog';

export async function tripCatalogLinks(db: NagiDatabase, entries: string[], signal?: AbortSignal) {
  if (!entries.length) return [];
  const ids = entries.slice(0, 40).join(',');
  const query = db
    .from('entry_relations')
    .select(
      `id,source_id,target_id,type:relation_types(*),source:entries!entry_relations_source_id_fkey(${cardColumns}),target:entries!entry_relations_target_id_fkey(${cardColumns})`,
    )
    .or(`source_id.in.(${ids}),target_id.in.(${ids})`)
    .order('id')
    .limit(100);
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw new Error('Les suggestions sont indisponibles.');
  return result.data.flatMap((r) => {
    if (!r.type || !r.source || !r.target) return [];
    return [r.source_id, r.target_id]
      .filter((id) => entries.includes(id))
      .flatMap((id) => {
        const reading = relationReading(id, r.source_id, r.target_id, r.type!, r);
        return reading?.entry
          ? [
              {
                entry: reading.entry,
                label: reading.label,
                from: id === r.source_id ? r.source!.title : r.target!.title,
                fromId: id,
              },
            ]
          : [];
      });
  });
}
export type TripCatalogLink = Awaited<ReturnType<typeof tripCatalogLinks>>[number];

export async function searchTripPlaces(
  db: NagiDatabase,
  values: TripPlaceQuery,
  context: { country: string | null; entries: string[] },
  signal?: AbortSignal,
) {
  const filtered = Boolean(
    values.q || values.category || values.country || values.city || values.neighborhood,
  );
  if (filtered || values.page > 0) {
    let query = db.from('entries').select(cardColumns, { count: 'exact' });
    if (values.q) {
      const normalized = values.q
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('fr');
      query = query.ilike('search_key', destinationNamePattern(normalized));
    }
    if (values.category) query = query.eq('category_id', values.category);
    if (values.country) query = query.eq('country_id', values.country);
    if (values.city) query = query.eq('city_id', values.city);
    if (values.neighborhood) query = query.eq('neighborhood_id', values.neighborhood);
    const ordered = query
      .order('title')
      .order('id')
      .range(values.page * 12, values.page * 12 + 11);
    const result = await (signal ? ordered.abortSignal(signal) : ordered);
    if (result.error?.code === 'PGRST103') return { rows: [], hasMore: false, links: [] };
    if (result.error) throw new Error('La recherche est indisponible.');
    return { rows: result.data, hasMore: (values.page + 1) * 12 < (result.count ?? 0), links: [] };
  }
  // One batched relation read, never a query per step. Every recommendation is an actual edge.
  const [linked, current] = await Promise.all([
    tripCatalogLinks(db, context.entries, signal),
    catalogEntriesById(db, context.entries.slice(0, 40), signal),
  ]);
  const links = linked
    .filter(
      (r, i) =>
        !context.entries.includes(r.entry.id) &&
        linked.findIndex((other) => other.entry.id === r.entry.id) === i,
    )
    .slice(0, 6);
  const rows: EntryCardRow[] = links.map((r) => r.entry);
  const city = [...current.values()].find((e) => e.city)?.city?.id;
  async function append(kind?: 'city_id' | 'country_id', id?: string | null) {
    if (rows.length >= 12 || (kind && !id)) return;
    let q = db.from('entries').select(cardColumns);
    if (kind) q = q.eq(kind, id!);
    const exclude = [...context.entries, ...rows.map((r) => r.id)];
    if (exclude.length) q = q.not('id', 'in', `(${exclude.join(',')})`);
    const ordered = q
      .order('updated_at', { ascending: false })
      .order('id')
      .limit(12 - rows.length);
    const result = await (signal ? ordered.abortSignal(signal) : ordered);
    if (result.error) throw new Error('Les suggestions sont indisponibles.');
    rows.push(...result.data);
  }
  await append('city_id', city);
  await append('country_id', context.country);
  if (!context.country && !city) await append();
  return { rows, hasMore: false, links, suggested: true };
}

export async function nearbyTripPlaces(
  db: NagiDatabase,
  bounds: {
    south: number;
    north: number;
    west: number;
    east: number;
  },
  signal?: AbortSignal,
) {
  let query = db
    .from('entries')
    .select(cardColumns)
    .eq('published', true)
    .gte('latitude', bounds.south)
    .lte('latitude', bounds.north);
  query =
    bounds.west <= bounds.east
      ? query.gte('longitude', bounds.west).lte('longitude', bounds.east)
      : query.or(`longitude.gte.${bounds.west},longitude.lte.${bounds.east}`);
  const ordered = query.order('title').order('id').limit(81);
  const result = await (signal ? ordered.abortSignal(signal) : ordered);
  if (result.error) throw new Error('Les lieux proches sont indisponibles.');
  return { rows: result.data.slice(0, 80), hasMore: result.data.length > 80 };
}
