import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireGuild: vi.fn(),
  select: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('../apps/web/src/features/spaces/server', () => ({
  requireGuild: mocks.requireGuild,
  spaceServices: async () => ({ preferences: { select: mocks.select } }),
  discoverSpaces: vi.fn(),
}));
vi.mock('../apps/web/node_modules/next/cache.js', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('../apps/web/node_modules/next/navigation.js', () => ({ redirect: mocks.redirect }));
const { rememberSelectedGuild } = await import('../apps/web/src/features/spaces/actions');
const guild = '444444444444444444';
const user = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireGuild.mockResolvedValue({ viewer: { id: user } });
  mocks.select.mockResolvedValue(undefined);
});

describe('Remembering a space after navigation', () => {
  it('keeps the preference write bound to fresh membership and the authenticated account', async () => {
    expect(await rememberSelectedGuild(guild)).toEqual({ error: '' });
    expect(mocks.requireGuild).toHaveBeenCalledExactlyOnceWith(guild, 'read', true);
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith(user, guild);
    // The selected page is already open; do not redirect or invalidate the whole app layout.
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith('/app');
  });

  it('does not write or invalidate anything when membership is refused or expired', async () => {
    mocks.requireGuild.mockRejectedValue(new Error('Access denied'));
    await expect(rememberSelectedGuild(guild)).rejects.toThrow('Access denied');
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(['', 'invalid', '../admin', '123'])(
    'rejects malformed space identifiers: %s',
    async (id) => {
      expect((await rememberSelectedGuild(id)).error).not.toBe('');
      expect(mocks.requireGuild).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
    },
  );

  it('reports a failed preference write without claiming success or invalidating caches', async () => {
    mocks.select.mockRejectedValue(new Error('Unavailable'));
    expect((await rememberSelectedGuild(guild)).error).toContain('mémorisé');
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
