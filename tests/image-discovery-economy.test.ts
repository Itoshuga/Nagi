import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NagiDatabase } from '../packages/database/src/client';
vi.mock('server-only', () => ({}));
vi.mock('../apps/web/node_modules/server-only/index.js', () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), page: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serviceDatabase: () => ({ from: builder, rpc: mocks.rpc }),
}));
vi.mock('@/features/images/server', () => ({ imageCacheKey: () => 'a'.repeat(64) }));
vi.mock('@/features/images/preview', () => ({
  canPreviewImages: () => true,
  candidatePreview: vi.fn(),
}));
vi.mock('@/features/images/serper', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../apps/web/src/features/images/serper')>()),
  serperImagePage: mocks.page,
}));
const { indexImageGallery } = await import('../apps/web/src/features/images/discovery');
let gallery: Record<string, unknown>;
function builder() {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    maybeSingle: async () => ({ data: gallery, error: null }),
    update: (data: unknown) => {
      mocks.update(data);
      return query;
    },
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return query;
}
const scope = { db: {} as NagiDatabase, actor: 'admin', admin: true };
const reference = { source: 'mapbox' as const, id: 'mapbox-place' };
const target = {
  context: {
    name: 'Kamakura (鎌倉市)',
    aliases: ['鎌倉'],
    country: 'Japan',
    language: 'en' as const,
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SERPER_IMAGES_ENABLED', 'true');
  vi.stubEnv('SERPER_API_KEY', 'test-private-key');
  vi.stubEnv('NAGI_IMAGE_RESOLVER_ENABLED', 'true');
  gallery = { cache_key: 'a'.repeat(64), pages: 0, state: 'idle', searched_at: null };
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === 'reserve_image_discovery' ? { lease: 'lease', page: 1, variant: 0 } : true,
    error: null,
  }));
  mocks.page.mockResolvedValue({
    images: Array.from({ length: 10 }, (_, index) => ({
      title: 'Kamakura ' + index,
      imageUrl: `https://images.example.org/${index}.jpg`,
      thumbnailUrl: `https://thumbs.example.org/${index}.jpg`,
    })),
    credits: 1,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe('economical place discovery', () => {
  it.each(['complete', 'more', 'limited', 'unavailable', 'indexing'])(
    'reads the recorded %s attempt without another provider reservation',
    async (state) => {
      gallery = { ...gallery, state, searched_at: new Date().toISOString() };
      await indexImageGallery(scope, reference, target, { continue: true, refresh: true });
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.page).not.toHaveBeenCalled();
    },
  );
  it('coalesces simultaneous first loads into one ten-photo request with no paid aliases or continuation', async () => {
    await Promise.all([
      indexImageGallery(scope, reference, target),
      indexImageGallery(scope, reference, target),
    ]);
    expect(mocks.page).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ q: expect.stringContaining('Kamakura') }),
      1,
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'reserve_image_discovery',
      expect.objectContaining({
        p_pages: 1,
        p_total_pages: 1,
        p_continue: false,
        p_refresh: false,
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'finish_image_discovery',
      expect.objectContaining({ p_variant_count: 1, p_credits: 1, p_items: expect.any(Array) }),
    );
    expect(
      mocks.rpc.mock.calls.find((call) => call[0] === 'finish_image_discovery')?.[1].p_items,
    ).toHaveLength(10);
  });
  it('does not search another known name after an empty provider response', async () => {
    mocks.page.mockResolvedValue({ images: [], credits: 1 });
    await indexImageGallery(scope, reference, target);
    expect(mocks.page).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'finish_image_discovery',
      expect.objectContaining({ p_items: [], p_variant_count: 1 }),
    );
  });
  it('waits for a busy slot through free reservations and still makes exactly one provider request', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { state: 'indexing', reason: 'busy' }, error: null });
    await indexImageGallery(scope, reference, target);
    expect(
      mocks.rpc.mock.calls.filter((call) => call[0] === 'reserve_image_discovery'),
    ).toHaveLength(2);
    expect(mocks.page).toHaveBeenCalledTimes(1);
  });
  it('does not reserve anything for a viewer who already left before indexing', async () => {
    const abort = new AbortController();
    abort.abort();
    await indexImageGallery(scope, reference, target, { signal: abort.signal });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.page).not.toHaveBeenCalled();
  });
  it('saves the paid response even when its viewer closes the modal during the request', async () => {
    let finish!: (value: unknown) => void;
    mocks.page.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const abort = new AbortController();
    const task = indexImageGallery(scope, reference, target, { signal: abort.signal });
    await vi.waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(1));
    abort.abort();
    finish({
      images: [
        {
          imageUrl: 'https://images.example.org/saved.jpg',
          thumbnailUrl: 'https://thumbs.example.org/saved.jpg',
        },
      ],
      credits: 1,
    });
    await task;
    expect(mocks.page).toHaveBeenCalledWith(expect.any(Object), 1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'finish_image_discovery',
      expect.objectContaining({
        p_credits: 1,
        p_items: expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({ imageUrl: 'https://images.example.org/saved.jpg' }),
          }),
        ]),
      }),
    );
    expect(mocks.rpc.mock.calls.some((call) => call[1].p_error)).toBe(false);
  });
});
