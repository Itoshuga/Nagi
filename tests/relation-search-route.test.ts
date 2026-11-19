import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  database: vi.fn(),
  search: vi.fn(),
  locations: vi.fn(),
  suggestions: vi.fn(),
}));
vi.mock('@/features/auth/session', () => ({ requireAdmin: mocks.admin }));
vi.mock('@/lib/supabase/server', () => ({ sessionDatabase: mocks.database }));
vi.mock('../packages/database/src/index', () => ({
  searchCatalogEntries: mocks.search,
  searchCatalogLocations: mocks.locations,
  suggestRelationEntries: mocks.suggestions,
}));
const { GET } = await import('../apps/web/src/app/(admin)/admin/relations/search/route');
const source = '11111111-1111-4111-8111-111111111111';
const country = '22222222-2222-4222-8222-222222222222';
const city = '33333333-3333-4333-8333-333333333333';
const neighborhood = '44444444-4444-4444-8444-444444444444';
const db = { fixture: true };
function request(params: Record<string, string>, signal?: AbortSignal) {
  return new Request(`https://nagi.test/admin/relations/search?${new URLSearchParams(params)}`, {
    signal,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: 'admin' });
  mocks.database.mockResolvedValue(db);
  mocks.suggestions.mockResolvedValue([{ id: 'local' }]);
  mocks.search.mockResolvedValue({ rows: [{ id: 'global' }], hasMore: true });
  mocks.locations.mockResolvedValue([{ id: city, name: 'Tokyo' }]);
});
describe('Admin relation search endpoint', () => {
  it('checks admin access before opening any database or doing a search', async () => {
    mocks.admin.mockRejectedValue(new Error('forbidden'));
    await expect(GET(request({ exclude: source }))).rejects.toThrow('forbidden');
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.suggestions).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    {},
    { exclude: 'invalid' },
    { exclude: source, page: '-1' },
    { exclude: source, page: '1.5' },
    { exclude: source, q: 'x'.repeat(181) },
    { exclude: source, city: 'invalid' },
    { mode: 'locations' },
    { mode: 'locations', kind: 'other' },
  ])('refuses malformed search parameters without querying the database: %j', async (params) => {
    const response = await GET(request(params));
    expect(response.status).toBe(400);
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it('only requests bounded contextual suggestions for an unfiltered first page', async () => {
    const req = request({ exclude: source, q: '  ' });
    const response = await GET(req);
    expect(await response.json()).toEqual({
      rows: [{ id: 'local' }],
      hasMore: false,
      suggested: true,
    });
    expect(mocks.suggestions).toHaveBeenCalledWith(db, source, req.signal);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('forwards all filters, pagination and cancellation to the catalogue search', async () => {
    const req = request({ exclude: source, q: ' PARCO ', country, city, neighborhood, page: '2' });
    const response = await GET(req);
    expect(mocks.search).toHaveBeenCalledWith(db, 'PARCO', source, undefined, {
      countryId: country,
      cityId: city,
      neighborhoodId: neighborhood,
      page: 2,
      signal: req.signal,
    });
    expect(mocks.suggestions).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      rows: [{ id: 'global' }],
      hasMore: true,
      suggested: false,
    });
  });
  it('searches the catalogue rather than suggestions when only a category is chosen', async () => {
    await GET(request({ exclude: source, category: country }));
    expect(mocks.search).toHaveBeenCalledWith(db, '', source, country, expect.any(Object));
    expect(mocks.suggestions).not.toHaveBeenCalled();
  });
  it('keeps destination lookup under the same admin session and cancellation', async () => {
    const req = request({ mode: 'locations', kind: 'cities', parent: country, q: 'Tok' });
    const response = await GET(req);
    expect(mocks.locations).toHaveBeenCalledWith(db, 'cities', 'Tok', country, req.signal);
    expect(await response.json()).toEqual({ rows: [{ id: city, name: 'Tokyo' }], hasMore: false });
  });
  it('reports failures without leaking database details', async () => {
    mocks.suggestions.mockRejectedValue(new Error('private database detail'));
    const response = await GET(request({ exclude: source }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database detail');
  });
  it('distinguishes an obsolete aborted request from a database outage', async () => {
    const controller = new AbortController();
    controller.abort();
    mocks.suggestions.mockRejectedValue(new Error('aborted'));
    const response = await GET(request({ exclude: source }, controller.signal));
    expect(response.status).toBe(499);
  });
});
