import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database, NagiDatabase } from '../packages/database/src/index';
vi.mock('server-only', () => ({}));
vi.mock('../apps/web/node_modules/server-only/index.js', () => ({}));
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  target: vi.fn(),
  read: vi.fn(),
  rpc: vi.fn(),
  gallery: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  serviceDatabase: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@/features/images/server', () => ({
  imageCacheKey: () => 'a'.repeat(64),
  imageTarget: mocks.target,
  readImages: mocks.read,
  imageRows: vi.fn(async () => []),
}));
vi.mock('@/features/images/discovery', () => ({ ensureImageGallery: mocks.gallery }));
vi.mock('@/features/trips/sync-server', () => ({
  TripRequestError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
const { canPreviewImages, candidatePreview, readDevelopmentPreview, selectDevelopmentPreview } =
  await import('../apps/web/src/features/images/preview');
const { imageDevelopmentPreview } = await import('../apps/web/src/features/images/config');
const ref = { source: 'nagi' as const, kind: 'city' as const, id: 'place' };
const scope = { db: {} as NagiDatabase, actor: 'admin', admin: true };
type Row = Database['public']['Tables']['image_candidates']['Row'];
const row = (name: string, id = 'photo'): Row => ({
  id,
  title: name,
  provider: 'serper',
  gallery_key: 'a'.repeat(64),
  url_key: 'b'.repeat(64),
  metadata: {
    imageUrl: 'https://venue.example.org/' + id + '.jpg',
    thumbnailUrl: 'https://thumbs.example.org/' + id + '.jpg',
    link: 'https://venue.example.org/photos',
    source: 'Venue',
  },
  additional_sources: [],
  rights_status: 'unknown',
  availability_status: 'unknown',
  license: null,
  license_url: null,
  creator: null,
  verified_at: null,
  rights_evidence: null,
  is_excluded: false,
  photo_id: null,
  relevance: 300,
  reports: 0,
  reviewed_by: null,
  discovered_at: '2026-11-24',
  updated_at: '2026-11-24',
});
let choices: Record<string, unknown>, rows: Row[];
function builder(table: string) {
  const filters = new Map<string, unknown>();
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.set(column, value);
      return query;
    },
    neq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: async () => ({
      data:
        table === 'image_galleries'
          ? { development_previews: choices }
          : (rows.find((r) => r.id === filters.get('id')) ?? null),
      error: null,
    }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: rows.filter((r) => r.availability_status !== 'unavailable' && !r.is_excluded),
        error: null,
      }).then(resolve),
  };
  return query;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NAGI_IMAGE_PREVIEW_UNVERIFIED', 'true');
  choices = {};
  rows = [row('Tokyo')];
  mocks.from.mockImplementation(builder);
  mocks.target.mockResolvedValue({ context: { name: 'Tokyo' } });
  mocks.gallery.mockResolvedValue({ cache_key: 'a'.repeat(64) });
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  mocks.read.mockResolvedValue({ selected: null });
});
afterEach(() => vi.unstubAllEnvs());
describe('administrator-only development photo previews', () => {
  it.each(['production', 'test'])(
    'cannot be enabled in %s even with the server flag',
    async (nodeEnv) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      expect(imageDevelopmentPreview()).toBe(false);
      expect(await readDevelopmentPreview(scope, ref)).toBeUndefined();
      await expect(
        selectDevelopmentPreview(scope, ref, 'manual', 'photo', 0),
      ).rejects.toMatchObject({ status: 403 });
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.target).not.toHaveBeenCalled();
    },
  );
  it('requires both a server flag and an authorized administrator', async () => {
    expect(canPreviewImages({ ...scope, admin: false })).toBe(false);
    expect(await readDevelopmentPreview({ ...scope, admin: false }, ref)).toBeUndefined();
    await expect(
      selectDevelopmentPreview({ ...scope, admin: false }, ref, 'manual', 'photo', 0),
    ).rejects.toMatchObject({ status: 403 });
    vi.stubEnv('NAGI_IMAGE_PREVIEW_UNVERIFIED', 'false');
    expect(await readDevelopmentPreview(scope, ref)).toBeUndefined();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([
    'Kamakura',
    'Tokyo',
    'Kyoto',
    'Shibuya',
    'Sensō-ji',
    'Shibuya Parco',
    'Pokémon Center SHIBUYA',
  ])(
    'previews %s with unknown rights and no fabricated licence or verification date',
    async (name) => {
      rows = [row(name)];
      const result = await readDevelopmentPreview(scope, ref);
      expect(result?.photos[0]).toMatchObject({
        title: name,
        usageRights: 'development-preview',
        rightsStatus: 'unknown',
        previewUrl: 'https://venue.example.org/photo.jpg',
      });
      expect(result?.photos[0]?.license).toBeUndefined();
      expect(result?.photos[0]).not.toHaveProperty('verifiedAt');
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it('uses real technical availability and accepts an accessible thumbnail when the original URL is unusable', () => {
    const item = row('Tokyo');
    item.metadata = {
      imageUrl: 'http://127.0.0.1/secret',
      thumbnailUrl: 'https://thumbs.example.org/a.jpg',
    };
    expect(candidatePreview(item)?.previewUrl).toBe('https://thumbs.example.org/a.jpg');
    item.availability_status = 'unavailable';
    expect(candidatePreview(item)).toBeUndefined();
  });
  it('restores a private manual choice ahead of new suggestions and isolates another administrator', async () => {
    rows = [row('New suggestion', 'new'), row('Chosen photo', 'chosen')];
    choices = {
      'admin:global': { mode: 'manual', image: 'chosen', revision: 4 },
      'other:global': { mode: 'fallback', revision: 6 },
    };
    const restored = await readDevelopmentPreview(scope, ref);
    expect(restored?.photos.map((r) => r.id)).toEqual(['chosen', 'new']);
    expect(restored?.revision).toBe(4);
    const other = await readDevelopmentPreview({ ...scope, actor: 'other' }, ref);
    expect(other?.photos).toEqual([]);
    expect(other?.mode).toBe('fallback');
  });
  it('checks resource permissions before a service-only preview write and never calls the public selection RPC', async () => {
    mocks.target.mockRejectedValueOnce(new Error('inaccessible visit'));
    await expect(selectDevelopmentPreview(scope, ref, 'manual', 'photo', 0)).rejects.toThrow(
      'inaccessible',
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    await selectDevelopmentPreview(scope, ref, 'manual', 'photo', 2);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('set_image_preview', {
      p_actor: 'admin',
      p_key: 'a'.repeat(64),
      p_mode: 'manual',
      p_image: 'photo',
      p_revision: 2,
      p_visit: null,
    });
  });
});
