import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NagiDatabase } from '../packages/database/src/client';
import { imageMatcherRevision } from '../apps/web/src/features/images/model';
const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ serviceDatabase: () => ({ from: mocks.from }) }));
vi.mock('@/features/images/proof', () => ({
  readImageProof: () => ({ name: 'Shibuya PARCO', aliases: [], language: 'fr' }),
}));
vi.mock('@/features/images/providers', () => ({
  resolveImages: mocks.resolve,
  commonsFiles: vi.fn(),
}));
vi.mock('@/features/trips/sync-server', () => ({ TripRequestError: class extends Error {} }));
const { readImages } = await import('../apps/web/src/features/images/server');
let cache: Record<string, unknown>;
function builder(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    gt: vi.fn(() => query),
    or: vi.fn(() => query),
    update: vi.fn((data) => {
      mocks.update(data);
      return query;
    }),
    maybeSingle: vi.fn(async () => ({
      data: table === 'image_resolution_cache' ? cache : null,
      error: null,
    })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: table === 'external_images' ? [{ metadata: { id: 'photo', title: 'PARCO' } }] : [],
        error: null,
      }).then(resolve),
  };
  return query;
}
const scope = { db: { from: builder } as unknown as NagiDatabase, actor: 'actor', trip: 'trip' };
const reference = { source: 'mapbox' as const, id: 'place', proof: 'signed' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(builder);
  cache = {
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    confidence: 'none',
    coordinate_evidence: false,
    reasons: ['no-reliable-photo'],
    candidates: [],
    selected: null,
    lease_until: null,
  };
});
describe('adopting broader image matching without resetting choices', () => {
  it('expires an older negative cache on read so the next job can try the broader matcher', async () => {
    expect((await readImages(scope, reference)).status).toBe('pending');
    expect(mocks.update).toHaveBeenCalledWith({ expires_at: new Date(0).toISOString() });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('reuses a new negative result rather than searching on every render', async () => {
    cache.reasons = ['no-reliable-photo', imageMatcherRevision];
    expect((await readImages(scope, reference)).status).toBe('ready');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('retains a previously verified positive association', async () => {
    Object.assign(cache, {
      confidence: 'high',
      reasons: ['entity-photo', 'license-verified'],
      candidates: ['photo'],
      selected: 'photo',
    });
    expect((await readImages(scope, reference)).selected?.id).toBe('photo');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not change another job’s active lease', async () => {
    cache.lease_until = new Date(Date.now() + 60000).toISOString();
    expect((await readImages(scope, reference)).status).toBe('pending');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
