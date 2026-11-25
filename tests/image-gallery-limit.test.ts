import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database, NagiDatabase } from '../packages/database/src/index';
import type { PersistentImage } from '../apps/web/src/features/images/model';
const mocks = vi.hoisted(() => ({
  selected: vi.fn(),
  preview: vi.fn(),
  photos: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  serviceDatabase: () => ({ from: builder, rpc: mocks.rpc }),
}));
vi.mock('@/features/images/server', () => ({
  imageCacheKey: () => 'a'.repeat(64),
  imageTarget: async () => ({ context: { name: 'Tokyo' } }),
  imageSelectionId: mocks.selected,
  imageRows: mocks.photos,
}));
vi.mock('@/features/images/preview', () => ({
  canPreviewImages: () => false,
  candidatePreview: vi.fn(),
  developmentPreviewChoice: mocks.preview,
}));
const { readImageGallery } = await import('../apps/web/src/features/images/discovery');
type Row = Database['public']['Tables']['image_candidates']['Row'];
const key = 'a'.repeat(64);
let rows: Row[], fallbacks: PersistentImage[];
const ref = { source: 'nagi' as const, kind: 'city' as const, id: 'city' };
const scope = { db: {} as NagiDatabase, actor: 'admin', admin: true };
function builder(table: string) {
  let limit = 10000,
    pinned: string | undefined;
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: (value: number) => {
      limit = value;
      return query;
    },
    or: (value: string) => {
      pinned = value.split(',')[0]?.slice('id.eq.'.length);
      return query;
    },
    maybeSingle: async () => ({
      data:
        table === 'image_galleries'
          ? {
              cache_key: key,
              state: 'complete',
              pages: 5,
              searched_at: new Date().toISOString(),
              credits: 10,
              development_previews: {},
            }
          : { candidates: fallbacks.map((photo) => photo.id) },
      error: null,
    }),
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve({
        data: rows
          .filter((row) => !pinned || row.id === pinned || row.photo_id === pinned)
          .sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id))
          .slice(0, limit),
        error: null,
      }).then(resolve),
  };
  return query;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.selected.mockResolvedValue(undefined);
  mocks.preview.mockReturnValue(undefined);
  fallbacks = [];
  rows = Array.from(
    { length: 80 },
    (_, index) =>
      ({
        id: 'abc00000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
        gallery_key: key,
        url_key: 'url-' + index,
        provider: 'serper',
        title: 'Photo ' + index,
        relevance: 1000 - index,
        rights_status: 'unknown',
        availability_status: 'unknown',
        is_excluded: false,
        photo_id: null,
        metadata: {
          imageUrl: 'https://images.example.org/' + index + '.jpg',
          thumbnailUrl: 'https://thumbs.example.org/' + index + '.jpg',
        },
        additional_sources: [],
        creator: null,
        license: null,
        license_url: null,
        rights_evidence: null,
        reviewed_by: null,
        verified_at: null,
        reports: 0,
        discovered_at: '2026-11-24T12:00:00Z',
        updated_at: '2026-11-24T12:00:00Z',
      }) as Row,
  );
  mocks.photos.mockImplementation(async (ids: string[]) =>
    fallbacks.filter((photo) => ids.includes(photo.id)),
  );
});
describe('a permanent library of at most ten photos', () => {
  it('caps an eighty-photo legacy gallery and ignores offsets instead of exposing the next page', async () => {
    const first = await readImageGallery(scope, ref),
      next = await readImageGallery(scope, ref, 24);
    expect(first.items).toHaveLength(10);
    expect(first.total).toBe(10);
    expect(first.hasMore).toBe(false);
    expect(next.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id));
    expect(next.offset).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('filters only the same ten retained choices rather than finding a hidden eleventh photo', async () => {
    expect((await readImageGallery(scope, ref, 0, 'Photo 79')).items).toEqual([]);
    expect((await readImageGallery(scope, ref, 0, 'Photo 9')).items).toHaveLength(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('keeps an existing cover in the ten choices without dropping its assignment or adding an eleventh card', async () => {
    const chosen = rows[79]!.id;
    mocks.selected.mockResolvedValue(chosen);
    const gallery = await readImageGallery(scope, ref);
    expect(gallery.items).toHaveLength(10);
    expect(gallery.items[0]?.id).toBe(chosen);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('counts licensed fallback choices inside the same ten-photo cap', async () => {
    rows = rows.slice(0, 7);
    fallbacks = Array.from(
      { length: 6 },
      (_, index) =>
        ({
          id: 'fallback-' + index,
          provider: 'wikimedia',
          usageRights: 'open',
          title: 'Fallback ' + index,
        }) as PersistentImage,
    );
    const gallery = await readImageGallery(scope, ref);
    expect(gallery.items).toHaveLength(7);
    expect(gallery.fallbacks).toHaveLength(3);
    expect(gallery.total).toBe(10);
    expect((await readImageGallery(scope, ref, 0, 'Fallback 5')).total).toBe(0);
  });
  it('reserves one of the ten slots for a previously selected licensed fallback cover', async () => {
    fallbacks = [
      {
        id: 'chosen-fallback',
        provider: 'wikimedia',
        usageRights: 'open',
        title: 'Current cover',
      } as PersistentImage,
    ];
    mocks.selected.mockResolvedValue('chosen-fallback');
    const gallery = await readImageGallery(scope, ref);
    expect(gallery.items).toHaveLength(9);
    expect(gallery.fallbacks.map((photo) => photo.id)).toEqual(['chosen-fallback']);
    expect(gallery.total).toBe(10);
  });
});
