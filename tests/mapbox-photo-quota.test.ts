import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ serviceDatabase: () => ({ rpc: mocks.rpc }) }));
beforeEach(() => {
  vi.resetModules();
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'server-test-token');
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'pk.browser-test');
  vi.stubEnv('MAPBOX_ENABLED', 'true');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('Places Details shares the existing account quota and transport', () => {
  it('reserves once for simultaneous detail and photographic requests, without sending the token to the client', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        mapbox_id: 'place',
        name: 'Venue',
        photos: [{ url: 'https://example.org/storefront.jpg' }],
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { retrieveMapboxDetailsData, retrieveMapboxDetails } =
      await import('../apps/web/src/features/integrations/mapbox/server');
    const [raw, place] = await Promise.all([
      retrieveMapboxDetailsData('actor', 'place'),
      retrieveMapboxDetails('actor', 'place'),
    ]);
    expect(raw.mapbox_id).toBe('place');
    expect(place.imageUrl).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'reserve_mapbox_places',
      expect.objectContaining({ p_kind: 'details', p_details_monthly: 900 }),
    );
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.hostname).toBe('api.mapbox.com');
    expect(options.redirect).toBe('error');
    expect(options.cache).toBe('no-store');
    expect(JSON.stringify(place)).not.toContain('server-test-token');
  });
  it('stops subsequent Places requests after 429 without blocking Search Box', async () => {
    const fetcher = vi.fn(
      async () => new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { retrieveMapboxDetailsData, reserveMapbox } =
      await import('../apps/web/src/features/integrations/mapbox/server');
    await expect(retrieveMapboxDetailsData('actor', 'one')).rejects.toMatchObject({ status: 429 });
    await expect(retrieveMapboxDetailsData('actor', 'two')).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(reserveMapbox('actor', 'suggest')).resolves.toBeUndefined();
  });
  it('does not make an external call after the shared monthly reservation is denied', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'mapbox_quota' } });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { retrieveMapboxDetailsData } =
      await import('../apps/web/src/features/integrations/mapbox/server');
    await expect(retrieveMapboxDetailsData('actor', 'place')).rejects.toMatchObject({
      status: 429,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
