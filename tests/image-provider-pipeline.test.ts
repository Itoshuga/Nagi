import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NagiDatabase } from '../packages/database/src/client';
import {
  emptyResolution,
  imageMatcherRevision,
  type OpenImage,
  type SerperImage,
} from '../apps/web/src/features/images/model';
vi.mock('server-only', () => ({}));
vi.mock('../apps/web/node_modules/server-only/index.js', () => ({}));
const mocks = vi.hoisted(() => ({
  photos: vi.fn(),
  open: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
  approved: vi.fn(),
  index: vi.fn(),
  preview: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  serviceDatabase: () => ({ from: builder, rpc: mocks.rpc }),
}));
vi.mock('@/features/images/proof', () => ({
  readImageProof: () => ({ name: 'Venue', language: 'fr', aliases: [] }),
}));
vi.mock('@/features/images/providers', () => ({
  resolveImages: mocks.open,
  commonsFiles: vi.fn(),
}));
vi.mock('@/features/images/provider-photos', () => ({
  mapboxPhotosAllowed: () => true,
  mapboxPhotoAdapter: { resolve: mocks.photos },
}));
vi.mock('@/features/images/discovery', () => ({
  approvedDiscoveryPhotos: mocks.approved,
  indexImageGallery: mocks.index,
  ensureImageGallery: vi.fn(),
}));
vi.mock('@/features/images/preview', () => ({ readDevelopmentPreview: mocks.preview }));
vi.mock('@/features/trips/sync-server', () => ({ TripRequestError: class extends Error {} }));
const { readImages } = await import('../apps/web/src/features/images/server');
let cache: Record<string, unknown> | null;
let assigned: Record<string, unknown> | null;
let galleryRow: Record<string, unknown> | null;
let entryRow: Record<string, unknown> | null;
const openPhoto = {
  id: 'open-photo',
  provider: 'wikimedia',
  usageRights: 'open',
  title: 'Venue',
  imageUrl: 'https://upload.wikimedia.org/test.jpg',
  verifiedAt: new Date().toISOString(),
} as OpenImage;
const reviewed = {
  id: 'serper-reviewed',
  provider: 'serper',
  sourceId: 'serper:photo',
  sourceUrl: 'https://venue.example.org/',
  imageUrl: 'https://venue.example.org/storefront.jpg',
  thumbnailUrl: 'https://venue.example.org/thumb.jpg',
  previewUrl: 'https://venue.example.org/storefront.jpg',
  title: 'Venue',
  usageRights: 'permission-granted',
  rightsStatus: 'permission_granted',
  verifiedAt: new Date().toISOString(),
  attribution: 'Venue owner',
} as SerperImage;
function builder(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    gt: vi.fn(() => query),
    or: vi.fn(() => query),
    upsert: vi.fn((data: unknown) => {
      mocks.upsert(data);
      return query;
    }),
    update: vi.fn((data: unknown) => {
      mocks.update(data);
      return query;
    }),
    maybeSingle: vi.fn(async () => ({
      data:
        table === 'image_resolution_cache'
          ? cache
          : table === 'entries'
            ? entryRow
            : table === 'trip_items'
              ? { id: 'visit', source: 'mapbox', external_place_id: 'place', trip_id: 'trip' }
              : table === 'image_galleries'
                ? galleryRow
                : assigned,
      error: null,
    })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: table === 'external_images' ? [{ metadata: openPhoto }] : [],
        error: null,
      }).then(resolve),
  };
  return query;
}
const scope = {
  db: { from: builder, rpc: mocks.rpc } as unknown as NagiDatabase,
  actor: 'actor',
  trip: 'trip',
};
const reference = {
  source: 'mapbox' as const,
  id: 'place',
  proof: 'signed',
  priority: 'selected' as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NAGI_IMAGE_RESOLVER_ENABLED', 'true');
  vi.stubEnv('SERPER_IMAGES_ENABLED', 'true');
  vi.stubEnv('SERPER_API_KEY', 'test-server-key');
  mocks.approved.mockResolvedValue([]);
  mocks.index.mockResolvedValue(undefined);
  mocks.preview.mockResolvedValue(undefined);
  cache = null;
  assigned = null;
  galleryRow = null;
  entryRow = null;
  mocks.rpc.mockResolvedValue({ data: 'lease', error: null });
  mocks.open.mockResolvedValue({
    ...emptyResolution,
    selected: openPhoto,
    candidates: [openPhoto],
    confidence: 'high',
    reasons: ['license-verified'],
  });
});
afterEach(() => vi.unstubAllEnvs());
describe('Serper primary discovery with exclusively open-source fallback', () => {
  it('keeps a place pending while another worker fills its gallery instead of caching an empty fallback', async () => {
    galleryRow = {
      state: 'indexing',
      lease_until: new Date(Date.now() + 30000).toISOString(),
      searched_at: new Date().toISOString(),
    };
    const pending = await readImages(scope, reference);
    expect(pending).toMatchObject({
      status: 'pending',
      retryAfter: 1,
      reasons: ['serper:waiting'],
    });
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.index).not.toHaveBeenCalled();
    galleryRow = { state: 'complete', searched_at: new Date().toISOString() };
    mocks.approved.mockResolvedValue([reviewed]);
    expect((await readImages(scope, reference)).selected?.id).toBe(reviewed.id);
  });
  it('displays cached unknown Serper photos in an authorized development preview before the licensed fallback', async () => {
    const preview = {
      ...reviewed,
      usageRights: 'development-preview',
      rightsStatus: 'unknown',
      license: undefined,
    };
    mocks.preview.mockResolvedValue({
      enabled: true,
      mode: 'automatic',
      revision: 0,
      photos: [preview],
    });
    cache = {
      expires_at: new Date(Date.now() + 100000).toISOString(),
      confidence: 'high',
      reasons: ['license-verified'],
      candidates: [openPhoto.id],
      selected: openPhoto.id,
    };
    const result = await readImages({ ...scope, admin: true }, reference);
    expect(result.selected).toBe(preview);
    expect(result.previewEnabled).toBe(true);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.index).not.toHaveBeenCalled();
  });
  it('preserves a public uploaded cover until an administrator explicitly chooses a private preview', async () => {
    const preview = { ...reviewed, usageRights: 'development-preview', rightsStatus: 'unknown' };
    entryRow = { id: 'entry', title: 'Venue', cover_image_url: 'uploaded-cover', category: null };
    mocks.preview.mockResolvedValue({
      enabled: true,
      mode: 'automatic',
      revision: 0,
      photos: [preview],
    });
    expect(
      (await readImages({ ...scope, admin: true }, { source: 'nagi', id: 'entry' })).selected,
    ).toBeNull();
    mocks.preview.mockResolvedValue({
      enabled: true,
      mode: 'manual',
      revision: 1,
      photos: [preview],
    });
    expect(
      (await readImages({ ...scope, admin: true }, { source: 'nagi', id: 'entry' })).selected,
    ).toBe(preview);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('uses an already reviewed Serper candidate before fallback and never queries Mapbox photos', async () => {
    mocks.approved.mockResolvedValue([reviewed]);
    expect((await readImages(scope, reference, true)).selected).toBe(reviewed);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.index).not.toHaveBeenCalled();
    expect(mocks.photos).not.toHaveBeenCalled();
  });
  it('indexes one page for a selected place, then falls back when no candidate has established rights', async () => {
    const result = await readImages(scope, reference, true);
    expect(mocks.index).toHaveBeenCalledTimes(1);
    expect(result.selected?.id).toBe(openPhoto.id);
    expect(result.candidates.map((photo) => photo.id)).toEqual([openPhoto.id]);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.photos).not.toHaveBeenCalled();
  });
  it('reuses existing selected open images before spending Serper credits', async () => {
    cache = {
      expires_at: new Date(Date.now() + 100000).toISOString(),
      confidence: 'high',
      reasons: ['license-verified'],
      candidates: [openPhoto.id],
      selected: openPhoto.id,
    };
    expect((await readImages(scope, reference, true)).selected?.id).toBe(openPhoto.id);
    expect(mocks.photos).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('starts primary discovery once even when the older fallback cache contains a miss', async () => {
    cache = {
      expires_at: new Date(Date.now() + 100000).toISOString(),
      confidence: 'none',
      reasons: [imageMatcherRevision],
      candidates: [],
      selected: null,
    };
    expect((await readImages(scope, reference)).status).toBe('pending');
    expect(mocks.index).not.toHaveBeenCalled();
    mocks.index.mockImplementation(async () => {
      mocks.approved.mockResolvedValue([reviewed]);
    });
    expect((await readImages(scope, reference, true)).selected).toBe(reviewed);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it.each(['manual', 'fallback'])('preserves an explicit %s choice', async (mode) => {
    assigned = { mode, image_id: mode === 'manual' ? openPhoto.id : null, revision: 4 };
    const result = await readImages(scope, { ...reference, visit: 'visit' }, true);
    expect(result.mode).toBe(mode);
    expect(result.selected?.id ?? null).toBe(mode === 'manual' ? openPhoto.id : null);
    expect(mocks.photos).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('does not replace an uploaded cover', async () => {
    entryRow = {
      id: 'entry',
      title: 'Venue',
      cover_image_url: 'uploaded-cover',
      category: null,
    };
    await readImages(scope, { source: 'nagi', id: 'entry' }, true);
    expect(mocks.photos).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('can disable new resolution without losing a manually chosen image', async () => {
    vi.stubEnv('NAGI_IMAGE_RESOLVER_ENABLED', 'false');
    assigned = { mode: 'manual', image_id: openPhoto.id, revision: 4 };
    expect((await readImages(scope, { ...reference, visit: 'visit' }, true)).selected?.id).toBe(
      openPhoto.id,
    );
    expect(mocks.photos).not.toHaveBeenCalled();
  });
});
