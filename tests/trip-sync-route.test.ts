import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  enrich: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock('../packages/database/src/index', () => ({
  TripService: class {},
  TripSyncService: class {
    read = mocks.read;
  },
  enrichTripChanges: mocks.enrich,
}));
vi.mock('@/lib/supabase/server', () => ({ publicCatalogDatabase: () => ({}) }));
vi.mock('@/features/trips/sync-server', () => ({
  tripRequestSession: async () => ({
    db: {
      auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) },
      realtime: { setAuth: vi.fn() },
      channel: mocks.channel,
      removeChannel: mocks.removeChannel,
    },
  }),
  tripRequestFailure: () => ({ status: 503, body: { error: 'Indisponible' } }),
}));
const { GET } = await import('../apps/web/src/app/(app)/app/[guildId]/trips/[tripId]/sync/route');
const tripId = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ guildId: '123456789012345678', tripId }) };
const payload = { version: 0, events: [], can_edit: true, can_manage: false, reset: false };
const channel = { on: vi.fn(), subscribe: mocks.subscribe };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.read.mockResolvedValue(payload);
  mocks.enrich.mockResolvedValue({ ...payload, entries: [], connections: [] });
  mocks.channel.mockReturnValue(channel);
  mocks.removeChannel.mockResolvedValue('ok');
  channel.on.mockReturnValue(channel);
});
afterEach(() => vi.useRealTimers());

function request(signal?: AbortSignal) {
  return new Request(`https://nagi.test/app/123456789012345678/trips/${tripId}/sync`, {
    headers: { accept: 'text/event-stream' },
    signal,
  });
}

describe('Trip SSE resource lifecycle', () => {
  it('returns a temporary failure without timers or a channel when initial enrichment fails', async () => {
    mocks.enrich.mockRejectedValue(new Error('Catalogue unavailable'));
    const response = await GET(request(), params);
    expect(response.status).toBe(503);
    expect(mocks.channel).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('releases the channel and both timers if subscription setup throws', async () => {
    mocks.subscribe.mockImplementation(() => {
      throw new Error('Realtime unavailable');
    });
    const response = await GET(request(), params);
    expect(response.status).toBe(503);
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('closes its resources when the consumer cancels the stream', async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(vi.getTimerCount()).toBe(2);
    await response.body!.cancel();
    expect(mocks.removeChannel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('closes its resources when the browser aborts the request', async () => {
    const browser = new AbortController();
    const response = await GET(request(browser.signal), params);
    browser.abort();
    expect(mocks.removeChannel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await response.body!.cancel();
  });
});
