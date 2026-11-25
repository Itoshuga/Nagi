import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  rpc: vi.fn(),
  refresh: vi.fn(),
  types: vi.fn(),
}));
vi.mock('@/features/auth/session', () => ({ requireAdmin: mocks.admin }));
vi.mock('@/lib/supabase/server', () => ({ sessionDatabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock('@/features/catalog/mutations', () => ({
  refreshRelations: mocks.refresh,
  refreshRelationTypes: mocks.types,
  catalogError: (_error: unknown, message: string) => ({ ok: false, message }),
}));
const {
  saveEntryRelation,
  deleteEntryRelation,
  saveRelationType,
  toggleRelationType,
  orderRelationTypes,
  deleteRelationType,
} = await import('../apps/web/src/features/relations/actions');
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222',
  c = '33333333-3333-4333-8333-333333333333',
  type = '44444444-4444-4444-8444-444444444444',
  edge = '55555555-5555-4555-8555-555555555555';
const stamp = '2026-11-19T14:00:00.000Z';
function form(data: Record<string, string | undefined>) {
  const f = new FormData();
  Object.entries(data).forEach(([k, v]) => {
    if (v !== undefined) f.set(k, v);
  });
  return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: a });
  mocks.rpc.mockResolvedValue({ data: { id: edge, entries: [a, b, c] }, error: null });
});
describe('Authorized semantic relation actions', () => {
  it('uses the selected orientation, new associated entry and version, invalidating old and new endpoints from the transaction receipt', async () => {
    const result = await saveEntryRelation(
      b,
      edge,
      form({ target: c, type, direction: 'inverse', updated_at: stamp, created_by: 'forged' }),
    );
    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('catalog_edit_relation', {
      p_entry: b,
      p_id: edge,
      p_other: c,
      p_type: type,
      p_direction: 'inverse',
      p_expected: stamp,
      p_delete: false,
    });
    expect(mocks.refresh).toHaveBeenCalledWith([a, b, c]);
  });
  it('rejects missing directions, self links and malformed editor metadata before writing', async () => {
    for (const data of [
      { target: b, type },
      { target: a, type, direction: 'forward' },
      { target: b, type, direction: 'forward', updated_at: 'not-a-date' },
    ])
      expect((await saveEntryRelation(a, edge, form({ updated_at: stamp, ...data }))).ok).toBe(
        false,
      );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('requires explicit removal confirmation and preserves failure feedback without invalidating caches', async () => {
    expect((await deleteEntryRelation(b, edge, form({ updated_at: stamp }))).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'catalog_relation_changed' },
    });
    expect(
      (await deleteEntryRelation(b, edge, form({ updated_at: stamp, confirm: 'yes' }))).ok,
    ).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('validates type icons and keeps symmetric inverse labels derived from the direct label', async () => {
    const data = {
      name: 'Proximité',
      slug: 'proximite',
      forward_label: 'À proximité',
      inverse_label: '',
      is_symmetric: 'true',
      is_acyclic: 'false',
      is_enabled: 'true',
      sort_order: '0',
      icon: 'map-pin',
    };
    expect((await saveRelationType(null, form({ ...data, icon: 'not-in-the-library' }))).ok).toBe(
      false,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await saveRelationType(null, form(data))).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'catalog_save_relation_type',
      expect.objectContaining({
        p_data: expect.objectContaining({
          inverse_label: 'À proximité',
          is_enabled: true,
          icon: 'map-pin',
        }),
      }),
    );
    expect(mocks.types).toHaveBeenCalledTimes(1);
  });
  it('checks global admin permission before every mutation', async () => {
    mocks.admin.mockRejectedValue(new Error('forbidden'));
    for (const run of [
      () => saveEntryRelation(a, null, new FormData()),
      () => deleteEntryRelation(a, edge, new FormData()),
      () => saveRelationType(null, new FormData()),
      () => toggleRelationType(type, false, stamp),
      () => orderRelationTypes([type]),
      () => deleteRelationType(type, new FormData()),
    ])
      await expect(run()).rejects.toThrow('forbidden');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
