import { beforeEach, describe, expect, it, vi } from 'vitest';

const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const mocks = vi.hoisted(() => ({
  viewer: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  revoke: vi.fn(),
  remove: vi.fn(),
  setCookie: vi.fn(),
  after: vi.fn(),
  clean: vi.fn(),
  requireGuild: vi.fn(),
  select: vi.fn(),
  revalidate: vi.fn(),
  ready: vi.fn(),
}));
vi.mock('../apps/web/node_modules/next/headers.js', () => ({
  cookies: async () => ({
    getAll: () =>
      [
        'nagi-auth',
        'nagi-auth.0',
        'sb-ynstekndjombxnvjtznt-auth-token',
        'sb-other-auth-token',
        'other-cookie',
      ].map((name) => ({ name, value: 'session' })),
    set: mocks.setCookie,
  }),
}));
vi.mock('../apps/web/node_modules/next/cache.js', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('../apps/web/node_modules/next/server.js', () => ({ after: mocks.after }));
vi.mock('../apps/web/node_modules/next/navigation.js', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('@/features/auth/session', () => ({ requireViewer: mocks.viewer }));
vi.mock('@/features/spaces/server', () => ({
  requireGuild: mocks.requireGuild,
  spaceServices: async () => ({ preferences: { select: mocks.select } }),
}));
vi.mock('@/features/profiles/banner', () => ({ cleanProfileBanners: mocks.clean }));
vi.mock('@/lib/supabase/server', () => ({
  sessionDatabase: async () => ({
    auth: { getUser: mocks.getUser, getSession: mocks.getSession, signOut: mocks.signOut },
  }),
  serviceDatabase: () => ({
    rpc: mocks.ready,
    auth: { admin: { signOut: mocks.revoke, deleteUser: mocks.remove } },
  }),
}));
vi.mock('@/lib/env', () => ({
  publicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://ynstekndjombxnvjtznt.supabase.co',
    NEXT_PUBLIC_APP_URL: 'https://nagi.test',
  }),
}));

const {
  deleteAccount: deleteBoundAccount,
  saveDefaultSpace,
  signOutOtherSessions,
} = await import('../apps/web/src/features/settings/actions');
const deleteAccount = deleteBoundAccount.bind(null, user);
const state = { error: '' };
function confirmation() {
  const form = new FormData();
  form.set('confirmation', 'SUPPRIMER');
  form.set('understood', 'yes');
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer.mockResolvedValue({ id: user });
  mocks.getUser.mockResolvedValue({ data: { user: { id: user } }, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'verified-session' } } });
  mocks.revoke.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.requireGuild.mockResolvedValue({ viewer: { id: user } });
  mocks.select.mockResolvedValue(undefined);
  mocks.ready.mockResolvedValue({ data: true, error: null });
});

describe('Account deletion', () => {
  it('rejects a page opened for a different account before revoking any sessions', async () => {
    mocks.viewer.mockResolvedValue({ id: other });
    expect((await deleteAccount(state, confirmation())).error).toContain('a changé');
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('keeps sessions and account data intact until the deletion migration is available', async () => {
    mocks.ready.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    expect((await deleteAccount(state, confirmation())).error).toContain('indisponible');
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('requires both confirmations before accessing the destructive API', async () => {
    for (const form of [new FormData(), confirmation()]) {
      form.delete('understood');
      expect((await deleteAccount(state, form)).error).toContain('confirmez');
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('rejects a changed or unverifiable identity and an expired session', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: other } }, error: null });
    expect((await deleteAccount(state, confirmation())).error).toContain('Reconnectez-vous');
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('Auth unavailable'),
    });
    expect((await deleteAccount(state, confirmation())).error).toContain('Reconnectez-vous');
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    expect((await deleteAccount(state, confirmation())).error).toContain('expiré');
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('revokes all sessions before deleting only the authenticated account and clearing its cookies', async () => {
    const form = confirmation();
    form.set('userId', other);
    await expect(deleteAccount(state, form)).rejects.toThrow(
      'redirect:/login?notice=account-deleted',
    );
    expect(mocks.revoke).toHaveBeenCalledWith('verified-session', 'global');
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(user);
    expect(mocks.revoke.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.remove.mock.invocationCallOrder[0]!,
    );
    expect(mocks.setCookie.mock.calls.map((call) => call[0])).toEqual([
      'nagi-auth',
      'nagi-auth.0',
      'sb-ynstekndjombxnvjtznt-auth-token',
    ]);
    expect(mocks.setCookie).toHaveBeenCalledWith(
      'nagi-auth',
      '',
      expect.objectContaining({ maxAge: 0, httpOnly: true, secure: true }),
    );
    expect(mocks.after).toHaveBeenCalledWith(mocks.clean);
  });
  it('stops if session revocation fails and reports deletion failures without claiming success', async () => {
    mocks.revoke.mockResolvedValueOnce({ error: new Error('Unavailable') });
    expect((await deleteAccount(state, confirmation())).error).toContain('sessions');
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.remove.mockResolvedValueOnce({ error: new Error('Storage ownership') });
    expect((await deleteAccount(state, confirmation())).error).toContain('échoué');
    expect(mocks.setCookie).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe('Account preferences and sessions', () => {
  it('revokes other sessions while keeping the current session cookies', async () => {
    expect((await signOutOtherSessions(state)).error).toBe('');
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'others' });
    expect(mocks.setCookie).not.toHaveBeenCalled();
    mocks.signOut.mockResolvedValueOnce({ error: new Error('Unavailable') });
    expect((await signOutOtherSessions(state)).error).toContain('Impossible');
  });
  it('checks fresh membership before saving the selected default space', async () => {
    const form = new FormData();
    expect((await saveDefaultSpace(state, form)).error).toContain('Choisissez');
    expect(mocks.requireGuild).not.toHaveBeenCalled();
    form.set('guildId', '444444444444444444');
    expect((await saveDefaultSpace(state, form)).error).toBe('');
    expect(mocks.requireGuild).toHaveBeenCalledExactlyOnceWith('444444444444444444', 'read', true);
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith(user, '444444444444444444', true);
    mocks.select.mockRejectedValueOnce(new Error('Write failed'));
    expect((await saveDefaultSpace(state, form)).error).toContain('Impossible');
  });
});
