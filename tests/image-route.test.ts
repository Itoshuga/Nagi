import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../apps/web/node_modules/server-only/index.js', () => ({}));
const mocks = vi.hoisted(() => ({ read: vi.fn(), select: vi.fn(), broken: vi.fn() }));
vi.mock('@/features/images/server', () => ({
  readImages: mocks.read,
  selectImage: mocks.select,
  reportBrokenImage: mocks.broken,
}));
vi.mock('@/features/trips/sync-server', () => ({
  tripRequestFailure: () => ({ status: 403, body: { error: 'Accès refusé' } }),
}));
const { imageRoute } = await import('../apps/web/src/features/images/route');
const reference = { source: 'mapbox', id: 'saved-reference', proof: 'signed-context' };
const request = (body: unknown, origin = 'https://nagi.test') =>
  new Request('https://nagi.test/images', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => vi.clearAllMocks());
describe('image endpoints', () => {
  it.each(['refresh', 'continue'])(
    'rejects a forged %s request before any permission or provider call',
    async (flag) => {
      const scope = vi.fn();
      expect(
        (await imageRoute(request({ operation: 'index', reference, [flag]: true }), scope)).status,
      ).toBe(400);
      expect(scope).not.toHaveBeenCalled();
    },
  );
  it('rejects cross-origin and oversized requests before authorising or calling providers', async () => {
    const scope = vi.fn();
    expect(
      (await imageRoute(request({ operation: 'read', reference }, 'https://attacker.test'), scope))
        .status,
    ).toBe(403);
    expect(
      (await imageRoute(request({ operation: 'read', reference, extra: 'x'.repeat(40000) }), scope))
        .status,
    ).toBe(413);
    expect(scope).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('does not accept arbitrary URLs or provider operations as a fetch proxy', async () => {
    const scope = vi.fn();
    expect(
      (await imageRoute(request({ operation: 'fetch', url: 'http://169.254.169.254/' }), scope))
        .status,
    ).toBe(400);
    expect(scope).not.toHaveBeenCalled();
  });
  it('rejects persistent selection of a session-only provider image', async () => {
    const scope = vi.fn();
    expect(
      (
        await imageRoute(
          request({
            operation: 'select',
            reference,
            mode: 'manual',
            image: 'mapbox-photo:00000000000000000000000000000000',
            revision: 0,
          }),
          scope,
        )
      ).status,
    ).toBe(400);
    expect(scope).not.toHaveBeenCalled();
  });
  it('authorises every cache read before returning metadata', async () => {
    const scope = vi.fn().mockRejectedValue(new Error('forbidden'));
    expect((await imageRoute(request({ operation: 'read', reference }), scope)).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('keeps responses private and sends only the validated reference to the service', async () => {
    const scope = { actor: 'member' };
    mocks.read.mockResolvedValue({ selected: null, candidates: [], status: 'ready' });
    const response = await imageRoute(
      request({ operation: 'read', reference, url: 'file:///secret', api_key: 'untrusted' }),
      vi.fn().mockResolvedValue(scope),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.read).toHaveBeenCalledWith(scope, reference, false, undefined, false);
  });
});
