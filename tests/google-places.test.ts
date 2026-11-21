import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), config: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../apps/web/node_modules/server-only/index.js', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ serviceDatabase: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/features/integrations/google-places/config', () => ({
  googlePlacesConfig: mocks.config,
}));
const { verifyGooglePlace, googlePlaceCoordinates, searchGooglePlaces } =
  await import('../apps/web/src/features/integrations/google-places/server');
const actor = '11111111-1111-4111-8111-111111111111',
  id = 'google-place-example';
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  mocks.config.mockReturnValue({
    enabled: true,
    configured: true,
    key: 'SERVER_SECRET_TEST_ONLY',
    userDaily: 150,
    globalDaily: 2000,
    userMinute: 20,
    minCharacters: 3,
  });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllGlobals());
describe('Restricted Google Places server adapter', () => {
  it.each(['Senso-ji', 'Sensō-ji', '浅草寺'])(
    'searches %s without rewriting or requesting display content for a map-linked UI',
    async (query) => {
      fetcher.mockResolvedValue(
        Response.json({
          suggestions: [{ placePrediction: { placeId: id, text: { text: 'DO_NOT_EXPOSE' } } }],
        }),
      );
      const result = await searchGooglePlaces(actor, {
        operation: 'search',
        kind: 'autocomplete',
        query,
        session: actor,
        type: '',
        context: { region: 'jp' },
      });
      expect(result.ids).toEqual([id]);
      expect(JSON.stringify(result)).not.toContain('DO_NOT_EXPOSE');
      expect(fetcher).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places:autocomplete',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'SERVER_SECRET_TEST_ONLY',
            'X-Goog-FieldMask': 'suggestions.placePrediction.placeId',
          }),
          cache: 'no-store',
        }),
      );
      expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
        input: query,
        sessionToken: actor,
        languageCode: 'fr',
        regionCode: 'jp',
      });
      expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(query);
    },
  );
  it('uses one IDs-only Text Search for a thematic query, without per-result REST details', async () => {
    fetcher.mockResolvedValue(Response.json({ places: [{ id }, { id: 'second-place-example' }] }));
    expect(
      (
        await searchGooglePlaces(actor, {
          operation: 'search',
          kind: 'text_search',
          query: 'Restaurants à Shibuya',
          session: actor,
          type: 'restaurant',
          context: {},
        })
      ).ids,
    ).toEqual([id, 'second-place-example']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![1].headers['X-Goog-FieldMask']).toBe('places.id');
  });
  it('terminates an Autocomplete token with a narrow verification even for a recently known ID', async () => {
    mocks.rpc.mockResolvedValue({
      data: { place_id: id, available: true, verified_at: new Date().toISOString() },
      error: null,
    });
    fetcher.mockResolvedValue(Response.json({ id }));
    await verifyGooglePlace(actor, id, actor);
    expect(fetcher.mock.calls[0]![0]).toBe(
      `https://places.googleapis.com/v1/places/${id}?sessionToken=${actor}`,
    );
    expect(fetcher.mock.calls[0]![1].headers['X-Goog-FieldMask']).toBe('id,movedPlaceId');
  });
  it('shares concurrent verification of one reference without conflating trip occurrences', async () => {
    fetcher.mockResolvedValue(Response.json({ id }));
    await Promise.all([verifyGooglePlace(actor, id), verifyGooglePlace(actor, id)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('makes no request when optional integration is disabled', async () => {
    mocks.config.mockReturnValue({ enabled: false, configured: false });
    await expect(verifyGooglePlace(actor, id)).rejects.toMatchObject({
      status: 503,
      code: 'configuration',
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses a recent ID-only verification without another paid request', async () => {
    mocks.rpc.mockResolvedValue({
      data: { place_id: id, available: true, verified_at: new Date().toISOString() },
      error: null,
    });
    await expect(verifyGooglePlace(actor, id)).resolves.toMatchObject({ place_id: id });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses fixed New API endpoint, secret header, narrow mask and persists only reference metadata', async () => {
    fetcher.mockResolvedValue(
      Response.json({
        id,
        displayName: { text: 'DO_NOT_PERSIST' },
        formattedAddress: 'DO_NOT_PERSIST',
      }),
    );
    await verifyGooglePlace(actor, id);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      `https://places.googleapis.com/v1/places/${id}`,
      expect.objectContaining({
        headers: {
          'X-Goog-Api-Key': 'SERVER_SECRET_TEST_ONLY',
          'X-Goog-FieldMask': 'id,movedPlaceId',
        },
        cache: 'no-store',
        redirect: 'error',
      }),
    );
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('DO_NOT_PERSIST');
    expect(mocks.rpc).toHaveBeenCalledWith('google_place_reference', {
      p_id: id,
      p_available: true,
    });
  });
  it('reserves quota before calling Google and never retries a quota failure', async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: null,
      error: name === 'reserve_google_places' ? { message: 'google_quota' } : null,
    }));
    await expect(verifyGooglePlace(actor, id)).rejects.toMatchObject({
      status: 429,
      code: 'quota',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sanitizes provider errors and retains an unavailable reference without changing the trip', async () => {
    fetcher.mockResolvedValue(new Response('secret provider details', { status: 404 }));
    await expect(verifyGooglePlace(actor, id)).rejects.toMatchObject({
      status: 404,
      code: 'unavailable',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('google_places_error', { p_code: 'places_http_404' });
    expect(mocks.rpc).toHaveBeenCalledWith('google_place_reference', {
      p_id: id,
      p_available: false,
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('secret provider details');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('resolves moved IDs with a bounded chain and returns short-lived coordinates without persisting them', async () => {
    fetcher
      .mockResolvedValueOnce(Response.json({ id, movedPlaceId: 'google-place-replacement' }))
      .mockResolvedValueOnce(
        Response.json({
          id: 'google-place-replacement',
          location: { latitude: 35, longitude: 139 },
        }),
      );
    const now = Date.now(),
      point = await googlePlaceCoordinates(actor, id);
    expect(point).toMatchObject({ latitude: 35, longitude: 139 });
    expect(point!.expiresAt).toBeGreaterThanOrEqual(now + 599000);
    expect(point!.expiresAt).toBeLessThanOrEqual(Date.now() + 600000);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('latitude');
    expect(fetcher.mock.calls[0]![1].headers['X-Goog-FieldMask']).toBe('id,location,movedPlaceId');
  });
  it('rejects moved-ID cycles without an unbounded paid loop', async () => {
    fetcher.mockResolvedValue(Response.json({ id, movedPlaceId: id }));
    await expect(googlePlaceCoordinates(actor, id)).rejects.toMatchObject({ code: 'moved_place' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
