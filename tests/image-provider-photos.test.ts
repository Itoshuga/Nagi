import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ details: vi.fn() }));
vi.mock('@/features/integrations/mapbox/server', () => ({
  retrieveMapboxDetailsData: mocks.details,
}));
const { mapboxPhotoAdapter, mapboxPhotoCandidates, mapboxPhotosAllowed } =
  await import('../apps/web/src/features/images/provider-photos');
const { imageContextSchema } = await import('../apps/web/src/features/images/model');
const context = imageContextSchema.parse({
  name: 'Shibuya Parco',
  city: 'Tokyo',
  latitude: 35.6621,
  longitude: 139.6986,
});
const reference = { source: 'mapbox' as const, id: 'mapbox-parco', priority: 'selected' as const };
const details = () => ({
  mapbox_id: reference.id,
  name: context.name,
  coordinates: { latitude: context.latitude, longitude: context.longitude },
  website: 'https://venue.example.org/',
  photos: [
    { url: 'https://venue.example.org/logo.png', width: 2000, height: 2000 },
    { url: 'https://venue.example.org/image-1.jpg', width: 1000, height: 800 },
    { url: 'https://venue.example.org/storefront.jpg', width: null, height: null },
  ],
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MAPBOX_PLACES_PHOTOS_ENABLED', 'true');
  vi.stubEnv(
    'MAPBOX_PLACES_PHOTO_RIGHTS_REFERENCE',
    'Synthetic test authorization, no real photo rights',
  );
  vi.stubEnv('MAPBOX_PLACES_PHOTO_ALLOWED_ORIGINS', 'https://venue.example.org');
  vi.stubEnv('MAPBOX_PLACES_PHOTOS_VISIBLE_RESULTS', 'false');
  vi.stubEnv('MAPBOX_PLACES_PHOTO_CROPPING_ALLOWED', 'false');
  vi.stubEnv('NAGI_IMAGE_RESOLVER_ENABLED', 'true');
});
afterEach(() => vi.unstubAllEnvs());
describe('Mapbox photographic rights and exact establishment matching', () => {
  it('requires an enabled provider, an authorization reference and exact allowed origins', async () => {
    vi.stubEnv('MAPBOX_PLACES_PHOTO_RIGHTS_REFERENCE', '');
    expect(
      (await mapboxPhotoAdapter.resolve('rights-test', reference, context)).candidates,
    ).toEqual([]);
    expect(mocks.details).not.toHaveBeenCalled();
    vi.stubEnv('MAPBOX_PLACES_PHOTO_RIGHTS_REFERENCE', 'test');
    vi.stubEnv('MAPBOX_PLACES_PHOTO_ALLOWED_ORIGINS', '');
    expect(mapboxPhotoCandidates(details(), reference.id, context).reason).toBe(
      'mapbox:rights-not-configured',
    );
  });
  it('does not spend Places quota for ordinary visible search cards by default', async () => {
    expect(mapboxPhotosAllowed({ ...reference, source: 'nagi' })).toBe(false);
    expect(mapboxPhotosAllowed({ ...reference, priority: 'visible' })).toBe(false);
    await mapboxPhotoAdapter.resolve(
      'visibility-test',
      { ...reference, priority: 'visible' },
      context,
    );
    expect(mocks.details).not.toHaveBeenCalled();
    expect(mapboxPhotosAllowed({ ...reference, priority: 'visible', visit: 'visit' })).toBe(true);
    vi.stubEnv('MAPBOX_PLACES_PHOTOS_VISIBLE_RESULTS', 'true');
    expect(mapboxPhotosAllowed({ ...reference, priority: 'visible' })).toBe(true);
  });
  it('waits for a confirmed location before spending selected-place photo quota', async () => {
    expect(
      (
        await mapboxPhotoAdapter.resolve('unlocated-test', reference, {
          ...context,
          latitude: undefined,
          longitude: undefined,
        })
      ).reason,
    ).toBe('mapbox:location-pending');
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it('ranks a storefront ahead of the first asset, accepting absent dimensions without inventing credits', () => {
    const result = mapboxPhotoCandidates(details(), reference.id, context);
    expect(result.selected?.imageUrl).toContain('storefront');
    expect(result.selected).toMatchObject({
      usageRights: 'provider-restricted',
      persistence: 'session',
      cropAllowed: false,
    });
    expect(result.selected).not.toHaveProperty('license');
    expect(result.selected).not.toHaveProperty('creator');
    expect(result.selected).not.toHaveProperty('width');
    expect(result.candidates).toHaveLength(2);
  });
  it.each([
    { mapbox_id: 'another-place' },
    { name: 'Pokémon Center SHIBUYA' },
    { coordinates: { latitude: 48.8584, longitude: 2.2945 } },
    { permanently_closed: true },
    { status: 'inactive' },
  ])('rejects another establishment, contradictory location or a closed venue: %j', (changes) => {
    expect(
      mapboxPhotoCandidates({ ...details(), ...changes }, reference.id, context).selected,
    ).toBeNull();
    expect(
      mapboxPhotoCandidates({ ...details(), ...changes }, reference.id, context).candidates,
    ).toHaveLength(0);
  });
  it('keeps unidentified or location-free assets as manual proposals', () => {
    const data = { ...details(), photos: [{ url: 'https://venue.example.org/image-1.jpg' }] };
    expect(mapboxPhotoCandidates(data, reference.id, context).selected).toBeNull();
    expect(
      mapboxPhotoCandidates({ ...details(), coordinates: undefined }, reference.id, context)
        .selected,
    ).toBeNull();
  });
  it.each([
    'file:///photo.jpg',
    'data:image/png;base64,x',
    'http://venue.example.org/photo.jpg',
    'https://127.0.0.1/photo.jpg',
    'https://venue.example.org.attacker.test/photo.jpg',
    'https://user:pass@venue.example.org/photo.jpg',
  ])('discards an unsafe or unauthorized source %s', (url) => {
    expect(
      mapboxPhotoCandidates({ ...details(), photos: [{ url }] }, reference.id, context).candidates,
    ).toHaveLength(0);
  });
  it('rejects logos, menus, products and inadequate images and deduplicates URLs', () => {
    const photos = [
      'menu.jpg',
      'product.jpg',
      'logo.svg',
      'flyer.png',
      'small.jpg',
      'storefront.jpg',
      'storefront.jpg',
    ].map((name) => ({
      url: 'https://venue.example.org/' + name,
      ...(name === 'small.jpg' ? { width: 32, height: 32 } : {}),
    }));
    expect(
      mapboxPhotoCandidates({ ...details(), photos }, reference.id, context).candidates,
    ).toHaveLength(1);
  });
  it('deduplicates simultaneous requests for multiple occurrences of one venue', async () => {
    mocks.details.mockResolvedValue(details());
    await Promise.all([
      mapboxPhotoAdapter.resolve('concurrency-test', { ...reference, visit: 'one' }, context),
      mapboxPhotoAdapter.resolve('concurrency-test', { ...reference, visit: 'two' }, context),
    ]);
    expect(mocks.details).toHaveBeenCalledTimes(1);
  });
  it('does not repeatedly retry an unavailable venue', async () => {
    mocks.details.mockRejectedValue({ code: 'quota' });
    expect((await mapboxPhotoAdapter.resolve('quota-test', reference, context)).reason).toBe(
      'mapbox:quota',
    );
    expect((await mapboxPhotoAdapter.resolve('quota-test', reference, context)).reason).toBe(
      'mapbox:recently-attempted',
    );
    expect(mocks.details).toHaveBeenCalledTimes(1);
  });
});
