import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  database: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  revalidate: vi.fn(),
  tag: vi.fn(),
}));
vi.mock('@/features/auth/session', () => ({ requireAdmin: mocks.admin }));
vi.mock('@/features/catalog/queries', () => ({ publishedCatalogTag: 'published-catalog' }));
vi.mock('@/lib/supabase/server', () => ({ sessionDatabase: mocks.database }));
vi.mock('../apps/web/node_modules/next/cache.js', () => ({
  revalidatePath: mocks.revalidate,
  updateTag: mocks.tag,
}));
const { importCountries } = await import('../apps/web/src/features/geography/import-actions');
function form(
  value: unknown = [
    { displayOrder: 1, name: 'Japon', iso: 'jp' },
    { displayOrder: 2, name: 'France', iso: 'fr' },
  ],
) {
  const data = new FormData();
  data.set(
    'file',
    new File([JSON.stringify(value)], 'countries.json', { type: 'application/json' }),
  );
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ role: 'admin' });
  mocks.database.mockResolvedValue({ from: mocks.from });
  mocks.from.mockReturnValue({ upsert: mocks.upsert });
  mocks.upsert.mockReturnValue({ select: mocks.select });
  mocks.select.mockResolvedValue({ data: [{ id: 'new' }], error: null });
});
describe('Admin country import action', () => {
  it('requires an admin before reading or writing any import data', async () => {
    mocks.admin.mockRejectedValue(new Error('forbidden'));
    await expect(importCountries(form())).rejects.toThrow('forbidden');
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it('inserts only normalized drafts in one bulk statement, skipping existing ISO codes', async () => {
    expect(await importCountries(form())).toEqual({ created: 1, skipped: 1 });
    expect(mocks.from).toHaveBeenCalledWith('countries');
    expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith(
      [
        {
          name: 'Japon',
          slug: 'japon',
          iso_code: 'JP',
          sort_order: 1,
          is_published: false,
          description: null,
          cover_image_url: null,
        },
        {
          name: 'France',
          slug: 'france',
          iso_code: 'FR',
          sort_order: 2,
          is_published: false,
          description: null,
          cover_image_url: null,
        },
      ],
      { onConflict: 'iso_code', ignoreDuplicates: true },
    );
    expect(mocks.revalidate).toHaveBeenCalledWith('/admin/countries');
    expect(mocks.tag).toHaveBeenCalledWith('published-catalog');
  });
  it('rejects a missing, empty or oversized file without touching the database', async () => {
    const values = [new FormData(), new FormData(), new FormData()];
    values[1]!.set('file', new File([], 'empty.json'));
    values[2]!.set('file', new File(['x'.repeat(1024 * 1024 + 1)], 'large.json'));
    for (const data of values) expect(await importCountries(data)).toHaveProperty('error');
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it('validates every row on the server and refuses publication injection', async () => {
    expect(
      await importCountries(
        form([
          { displayOrder: 1, name: 'Japon', iso: 'JP' },
          { displayOrder: 2, name: 'France', iso: 'FR', is_published: true },
        ]),
      ),
    ).toHaveProperty('error');
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it('reports a conflicting address without claiming any partial import', async () => {
    mocks.select.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'countries_slug_key' },
    });
    const result = await importCountries(form());
    expect(result.error).toContain('Aucun pays');
    expect(result.created).toBeUndefined();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('does not refresh the catalog when reimporting only existing countries', async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    expect(await importCountries(form())).toEqual({ created: 0, skipped: 2 });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
