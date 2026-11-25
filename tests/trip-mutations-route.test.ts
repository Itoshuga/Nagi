import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  mutate: vi.fn(),
  read: vi.fn(),
  enrich: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../packages/database/src/index', () => ({
  TripSyncService: class {
    mutate = mocks.mutate;
    read = mocks.read;
  },
  enrichTripChanges: mocks.enrich,
}));
vi.mock('@/lib/supabase/server', () => ({ publicCatalogDatabase: () => ({}) }));
vi.mock('@/features/trips/sync-server', () => ({
  tripRequestSession: mocks.session,
  tripRequestFailure: () => ({ status: 403, body: { error: 'Accès refusé' } }),
}));
vi.mock('@/features/integrations/mapbox/server', () => ({
  verifyMapboxReference: mocks.verify,
  MapboxError: class extends Error {},
}));
const { POST } =
  await import('../apps/web/src/app/(app)/app/[guildId]/trips/[tripId]/mutations/route');
const trip = '11111111-1111-4111-8111-111111111111';
const guild = '123456789012345678';
const params = { params: Promise.resolve({ guildId: guild, tripId: trip }) };
const mutation = {
  id: trip,
  base: 0,
  change: { operation: 'patch_item', data: { id: trip, patch: { notes: 'Billets' } } },
  expected: { items: { [trip]: { notes: '' } }, stops: {}, days: {} },
};
function request(body: string, origin = 'https://nagi.test') {
  return new Request(`https://nagi.test/app/${guild}/trips/${trip}/mutations`, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ db: {}, userId: 'actor', timing: 'auth;dur=1' });
  mocks.mutate.mockResolvedValue({ events: [], version: 1 });
  mocks.enrich.mockResolvedValue({ events: [], version: 1 });
});

describe('Authorized and bounded trip mutations', () => {
  it('passes a validated request and both route identifiers to the authorized SQL service', async () => {
    const response = await POST(request(JSON.stringify(mutation)), params);
    expect(response.status).toBe(200);
    expect(mocks.session).toHaveBeenCalledWith(guild);
    expect(mocks.mutate).toHaveBeenCalledWith(guild, trip, mutation);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('rejects a UTF-8 body exceeding the byte budget before authorization or writes', async () => {
    const response = await POST(request(JSON.stringify('日'.repeat(100000))), params);
    expect(response.status).toBe(413);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON before authorization or writes', async () => {
    expect((await POST(request('{broken'), params)).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('refuses cross-origin writes before reading the authenticated session', async () => {
    expect(
      (await POST(request(JSON.stringify(mutation), 'https://foreign.test'), params)).status,
    ).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('does not write when membership verification fails', async () => {
    mocks.session.mockRejectedValue(new Error('Membership revoked'));
    expect((await POST(request(JSON.stringify(mutation)), params)).status).toBe(403);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
