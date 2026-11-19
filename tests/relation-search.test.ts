import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServiceDatabase } from '../packages/database/src/client';
import { searchCatalogEntries, suggestRelationEntries } from '../packages/database/src/catalog';

const source = '11111111-1111-4111-8111-111111111111';
const db = () => createServiceDatabase('https://fixture.supabase.test', 'fixture-only-key');
afterEach(() => vi.unstubAllGlobals());
describe('Bounded relation entry queries', () => {
  it('prioritizes neighbourhood then city then other real entries without duplicates', async () => {
    const calls: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.searchParams.get('id') === `eq.${source}`)
        return Response.json([{ city_id: 'tokyo', neighborhood_id: 'shibuya' }]);
      const rows = url.searchParams.has('neighborhood_id')
        ? [{ id: 'parco' }, { id: 'nintendo' }]
        : url.searchParams.has('city_id')
          ? [{ id: 'asakusa' }]
          : [{ id: 'kyoto' }, { id: 'osaka' }, { id: 'sapporo' }];
      return Response.json(rows);
    });
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    expect(
      (await suggestRelationEntries(db(), source, controller.signal)).map((r) => r.id),
    ).toEqual(['parco', 'nintendo', 'asakusa', 'kyoto', 'osaka', 'sapporo']);
    expect(calls).toHaveLength(4);
    expect(calls[1]!.searchParams.get('neighborhood_id')).toBe('eq.shibuya');
    expect(calls[2]!.searchParams.get('city_id')).toBe('eq.tokyo');
    expect(calls[2]!.searchParams.get('id')).toBe(`neq.${source}`);
    expect(calls[2]!.searchParams.getAll('id')).toContain('not.in.(parco,nintendo)');
    expect(calls[3]!.searchParams.getAll('id')).toContain('not.in.(parco,nintendo,asakusa)');
    expect(calls.slice(1).map((u) => u.searchParams.get('limit'))).toEqual(['6', '4', '3']);
    expect(calls[1]!.searchParams.get('order')).toBe('updated_at.desc,id.asc');
    controller.abort();
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.signal?.aborted).toBe(true);
    }
  });
  it('does not fetch any further rows once six local suggestions are available', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return Response.json(
        calls === 1
          ? [{ city_id: 'tokyo', neighborhood_id: 'shibuya' }]
          : Array.from({ length: 6 }, (_, i) => ({ id: `local-${i}` })),
      );
    });
    expect(await suggestRelationEntries(db(), source)).toHaveLength(6);
    expect(calls).toBe(2);
  });
  it('does not query the catalogue when the source is inaccessible', async () => {
    const fetcher = vi.fn(async () => Response.json([]));
    vi.stubGlobal('fetch', fetcher);
    expect(await suggestRelationEntries(db(), source)).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('applies geographic filters and a stable page of twelve to global search', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json([{ id: 'match' }], { headers: { 'Content-Range': '12-23/25' } }),
    );
    vi.stubGlobal('fetch', fetcher);
    const result = await searchCatalogEntries(db(), 'PARCO', source, 'tourism', {
      countryId: 'jp',
      cityId: 'tokyo',
      neighborhoodId: 'shibuya',
      page: 1,
    });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      id: `neq.${source}`,
      category_id: 'eq.tourism',
      country_id: 'eq.jp',
      city_id: 'eq.tokyo',
      neighborhood_id: 'eq.shibuya',
      title: 'ilike.%PARCO%',
      order: 'title.asc,id.asc',
      offset: '12',
      limit: '12',
    });
    expect(result).toEqual({ rows: [{ id: 'match' }], hasMore: true });
  });
});
