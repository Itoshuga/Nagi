import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), config: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../apps/web/node_modules/server-only/index.js', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ serviceDatabase: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/features/integrations/mapbox/config', () => ({ mapboxConfig: mocks.config }));
const { searchMapbox, resolveMapbox, verifyMapboxReference, retrieveMapboxDetails } =
  await import('../apps/web/src/features/integrations/mapbox/server');
const { readMapboxProof, issueMapboxProof } =
  await import('../apps/web/src/features/integrations/mapbox/proof');
const { mapboxSearchPlaces, mapboxPlaceDetails } =
  await import('../apps/web/src/features/integrations/mapbox/model');
const actor = '11111111-1111-4111-8111-111111111111',
  trip = '22222222-2222-4222-8222-222222222222',
  id = 'dXJuOm1ieHBvaToTEST';
const suggestion = (value = id) => ({
  mapbox_id: value,
  name: 'Provider title',
  feature_type: 'poi',
  poi_category: ['Temple'],
});
const feature = (value = id) => ({
  properties: suggestion(value),
  geometry: { type: 'Point', coordinates: [139.7, 35.6] },
});
const input = (query = '浅草寺') => ({
  operation: 'search' as const,
  kind: 'suggest' as const,
  query,
  session: trip,
  category: '' as const,
  context: { proximity: [139.7, 35.6] as [number, number] },
});
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.stubEnv('NAGI_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  mocks.config.mockReturnValue({
    enabled: true,
    configured: true,
    token: 'SERVER_TEST_ONLY',
    userDaily: 500,
    globalDaily: 5000,
    userMinute: 60,
    detailsMonthly: 900,
    minCharacters: 3,
    photos: false,
  });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe('Mapbox adapter and signed references', () => {
  it.each(['Sensō-ji', 'Senso-ji', '浅草寺', '渋谷PARCO'])(
    'preserves %s and pairs suggest/retrieve without extra details',
    async (query) => {
      fetcher
        .mockResolvedValueOnce(Response.json({ suggestions: [suggestion()] }))
        .mockResolvedValueOnce(Response.json({ features: [feature()] }));
      const result = await searchMapbox(actor, trip, input(query));
      expect(result.places[0]).toMatchObject({ id, title: 'Provider title', query });
      expect(result.places[0]?.coordinates).toBeUndefined();
      const place = await resolveMapbox(actor, trip, {
        placeId: id,
        query,
        proof: result.places[0]!.proof,
      });
      const urls = fetcher.mock.calls.map((c) => new URL(c[0]));
      expect(urls[0]?.searchParams.get('q')).toBe(query);
      expect(urls[0]?.searchParams.get('country')).toBeNull();
      expect(urls[0]?.searchParams.get('proximity')).toBe('139.7,35.6');
      expect(urls[1]?.searchParams.get('session_token')).toBe(
        urls[0]?.searchParams.get('session_token'),
      );
      expect(urls[1]?.pathname).toBe('/search/searchbox/v1/retrieve/' + id);
      expect(place.coordinates).toEqual({ longitude: 139.7, latitude: 35.6 });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('Provider title');
      expect(JSON.stringify(result)).not.toContain('SERVER_TEST_ONLY');
    },
  );
  it('uses standalone forward without a session or per-result details', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ features: [feature()] }));
    const result = await searchMapbox(actor, trip, { ...input(), kind: 'forward' });
    expect(result.places[0]?.coordinates).toBeDefined();
    const url = new URL(fetcher.mock.calls[0]![0]);
    expect(url.pathname).toMatch(/forward$/);
    expect(url.searchParams.has('session_token')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await verifyMapboxReference(actor, trip, {
      placeId: id,
      query: '浅草寺',
      proof: result.places[0]!.proof,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenLastCalledWith('mapbox_place_reference', {
      p_actor: actor,
      p_id: id,
      p_query: '浅草寺',
    });
  });
  it('caps both search modes at six results even if the provider sends more', async () => {
    for (const kind of ['suggest', 'forward'] as const) {
      fetcher.mockResolvedValueOnce(
        Response.json(
          kind === 'suggest'
            ? { suggestions: Array.from({ length: 10 }, (_, i) => suggestion('place-' + i)) }
            : { features: Array.from({ length: 10 }, (_, i) => feature('place-' + i)) },
        ),
      );
      const result = await searchMapbox(actor, trip, { ...input('Example search'), kind });
      expect(result.places).toHaveLength(6);
      expect(new URL(fetcher.mock.calls.at(-1)![0]).searchParams.get('limit')).toBe('6');
    }
  });
  it('recommends an idle refinement for a near name instead of treating it as the requested temple', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({ suggestions: [{ ...suggestion(), name: 'Sensō-Ji Paros' }] }),
    );
    const result = await searchMapbox(actor, trip, input('Senso-Ji'));
    expect(result.refine).toBe(true);
    expect(result.places[0]?.title).toBe('Sensō-Ji Paros');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not refine an exact match or recursively refine a completed forward request', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({ suggestions: [{ ...suggestion(), name: 'Sensō-ji' }] }),
    );
    expect((await searchMapbox(actor, trip, input('Senso-Ji'))).refine).toBe(false);
    fetcher.mockResolvedValueOnce(Response.json({ features: [feature()] }));
    expect(
      (await searchMapbox(actor, trip, { ...input('Senso-Ji'), kind: 'forward' })).refine,
    ).toBe(false);
  });
  it('reopens saved IDs with a fresh exact-ID matched session, never an approximate substitution', async () => {
    fetcher
      .mockResolvedValueOnce(Response.json({ features: [] }))
      .mockResolvedValueOnce(Response.json({ suggestions: [suggestion('different')] }));
    await expect(
      resolveMapbox(actor, trip, { placeId: id, query: 'Old search' }),
    ).rejects.toMatchObject({ status: 422, code: 'reassociate' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('deduplicates simultaneous cold resolutions and keeps provider data out of persistence', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ features: [feature()] }));
    const ref = { placeId: id, query: 'A temple' };
    const [a, b] = await Promise.all([
      resolveMapbox(actor, trip, ref),
      resolveMapbox(actor, trip, ref),
    ]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls.every((c) => c[0] === 'reserve_mapbox_places')).toBe(true);
  });
  it('binds proofs to actor, trip, ID and original input; rejects tampering and expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const proof = issueMapboxProof({ actor, trip, id, query: 'A temple', kind: 'resolved' });
    expect(readMapboxProof(proof, actor, trip, id, 'A temple')).not.toBeNull();
    for (const args of [
      [trip, trip, id, 'A temple'],
      [actor, actor, id, 'A temple'],
      [actor, trip, 'other', 'A temple'],
      [actor, trip, id, 'Other'],
    ] as const)
      expect(readMapboxProof(proof, args[0], args[1], args[2], args[3])).toBeNull();
    expect(readMapboxProof(proof + 'x', actor, trip, id, 'A temple')).toBeNull();
    vi.advanceTimersByTime(600001);
    expect(readMapboxProof(proof, actor, trip, id, 'A temple')).toBeNull();
  });
  it('expires suggestion proofs before the provider inactivity window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const proof = issueMapboxProof({
      actor,
      trip,
      id,
      query: 'A temple',
      kind: 'suggestion',
      session: trip,
    });
    vi.advanceTimersByTime(170001);
    expect(readMapboxProof(proof, actor, trip, id, 'A temple')).toBeNull();
  });
  it.each([401, 403, 429, 404, 500])(
    'sanitizes HTTP %s without logging bodies or tokens',
    async (status) => {
      fetcher.mockResolvedValueOnce(new Response('SERVER_TEST_ONLY private body', { status }));
      let error: unknown;
      try {
        await searchMapbox(actor, trip, input());
      } catch (e) {
        error = e;
      }
      expect(error).toMatchObject({ status: status === 404 ? 404 : status === 429 ? 429 : 503 });
      expect(String(error)).not.toMatch(/SERVER_TEST_ONLY|private body/);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mocks.rpc).toHaveBeenCalledWith('mapbox_error', { p_code: `suggest_http_${status}` });
    },
  );
  it('reserves quota before calling the provider and makes no automatic retry', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'mapbox_quota' } });
    await expect(searchMapbox(actor, trip, input())).rejects.toMatchObject({
      status: 429,
      code: 'quota',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('disables the integration without accessing the provider', async () => {
    mocks.config.mockReturnValue({ enabled: false, configured: true });
    await expect(searchMapbox(actor, trip, input())).rejects.toMatchObject({
      code: 'configuration',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('loads optional details separately without enabling media by default', async () => {
    fetcher.mockResolvedValue(
      Response.json({
        mapbox_id: id,
        name: 'Temple',
        coordinates: { longitude: 139, latitude: 35 },
        photos: [{ url: 'https://example.test/a.jpg' }],
        website: 'https://example.test',
      }),
    );
    const place = await retrieveMapboxDetails(actor, id);
    expect(place.imageUrl).toBeUndefined();
    expect(place.website).toBe('https://example.test/');
    expect(new URL(fetcher.mock.calls[0]![0]).pathname).toContain('/places/v1/details/retrieve/');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ cache: 'no-store', redirect: 'error' });
  });
});
describe('Provider presentation boundaries', () => {
  it('prioritizes an exact establishment title over a broad district result without rewriting either', () => {
    const places = mapboxSearchPlaces(
      {
        suggestions: [
          { mapbox_id: 'district', name: 'Shibuya-ku', feature_type: 'locality' },
          { mapbox_id: 'poi', name: 'Pokémon Center Shibuya', feature_type: 'poi' },
        ],
      },
      'suggest',
      'Pokémon Center SHIBUYA',
    );
    expect(places.map((p) => p.id)).toEqual(['poi', 'district']);
    expect(places[0]?.title).toBe('Pokémon Center Shibuya');
  });
  it('rejects missing IDs, nonphysical categories, invalid coordinates and duplicates', () => {
    expect(mapboxSearchPlaces(null, 'suggest', 'typed')).toEqual([]);
    expect(
      mapboxSearchPlaces(
        {
          suggestions: [
            suggestion(),
            suggestion(),
            { ...suggestion('category'), feature_type: 'category' },
            { name: 'Missing' },
          ],
        },
        'suggest',
        'typed',
      ),
    ).toHaveLength(1);
    expect(
      mapboxSearchPlaces(
        { features: [{ ...feature(), geometry: { coordinates: [999, 35] } }] },
        'forward',
        'typed',
      ),
    ).toEqual([]);
  });
  it('handles missing optional details and rejects executable/local media and links', () => {
    const place = mapboxPlaceDetails(
      {
        mapbox_id: id,
        name: 'Temple',
        website: 'javascript:alert(1)',
        photos: [{ url: 'http://127.0.0.1/a.jpg' }],
      },
      true,
    );
    expect(place).toMatchObject({ id, title: 'Temple' });
    expect(place?.coordinates).toBeUndefined();
    expect(place?.website).toBeUndefined();
    expect(place?.imageUrl).toBeUndefined();
  });
});
