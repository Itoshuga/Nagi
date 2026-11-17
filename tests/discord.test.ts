import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DiscordApi,
  DiscordConnectionError,
  DiscordGuildService,
  DiscordUserService,
  guildIcon,
} from '../packages/discord/src/api';
import { TokenCipher, DiscordTokenService } from '../packages/discord/src/vault';
import { GuildMembershipService } from '../packages/discord/src/membership';
import { GuildPreferencesService } from '../packages/database/src/collaboration';
import type { NagiDatabase } from '../packages/database/src/client';
import { guildInitials, tripInputSchema } from '../packages/shared/src/collaboration';
import { hasGuildAdministration } from '../packages/permissions/src/index';
import { startGuildRegistry } from '../apps/bot/src/services/guild-registry';
const app = '111111111111111111';
const a = '222222222222222222';
const b = '333333333333333333';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const guild = (id: string, name = 'Space', permissions = '0') => ({
  id,
  name,
  icon: null,
  icon_url: null,
  owner: false,
  permissions,
  members_can_create_trips: true,
});
const expires = () => new Date(Date.now() + 3600000).toISOString();
const cipher = () => new TokenCipher(randomBytes(32).toString('base64'));
function rpcDb(
  handler: (name: string, args: Record<string, unknown>) => unknown | Promise<unknown>,
) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => ({
    data: await handler(name, args),
    error: null,
  }));
  return { rpc, db: { rpc } as unknown as NagiDatabase };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Discord API and normalization', () => {
  it('retrieves identity, animated avatars, optional banner and accent', async () => {
    const network = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: a,
        username: 'handle',
        global_name: 'Display',
        avatar: 'a_avatar',
        banner: 'banner',
        accent_color: 7579359,
      }),
    );
    const user = await new DiscordUserService(new DiscordApi(network)).current('access');
    expect(user.global_name).toBe('Display');
    expect(user.avatar_url).toContain('/a_avatar.gif');
    expect(user.banner_url).toContain('/banner.png');
    expect(user.accent_color).toBe(7579359);
    expect(new Headers(network.mock.calls[0]![1]?.headers).get('Authorization')).toBe(
      'Bearer access',
    );
  });
  it('supports accounts without custom names, avatars or banners', async () => {
    const user = await new DiscordUserService(
      new DiscordApi(async () => Response.json({ id: a, username: 'handle' })),
    ).current('access');
    expect(user.global_name ?? user.username).toBe('handle');
    expect(user.avatar_url).toMatch(/embed\/avatars\/[0-5]\.png$/);
    expect(user.banner_url).toBeNull();
    expect(guildIcon(a, 'a_icon')).toContain('.gif');
    expect(guildInitials('  Café Montréal ')).toBe('CM');
  });
  it('paginates a bot inventory, deduplicates and checks application ownership', async () => {
    const first = Array.from({ length: 200 }, (_, i) => guild(String(BigInt(a) + BigInt(i))));
    const network = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/oauth2/applications/@me')) return Response.json({ id: app });
      return Response.json(url.searchParams.has('after') ? [first[199], guild(b)] : first);
    });
    const service = new DiscordGuildService(new DiscordApi(network), app);
    const all = await service.list('bot-token', 'Bot');
    expect(all).toHaveLength(201);
    expect(String(network.mock.calls[2]![0])).toContain(`after=${BigInt(a) + 199n}`);
    const common = service.intersect(
      [guild(a, 'Old', '32'), guild('444444444444444444')],
      [guild(a, 'Current')],
    );
    expect(common).toEqual([guild(a, 'Current', '32')]);
  });
  it('rejects a bot token for another application', async () => {
    const api = new DiscordApi(async () => Response.json({ id: b }));
    await expect(new DiscordGuildService(api, app).list('wrong-token', 'Bot')).rejects.toThrow(
      'ne correspond pas',
    );
  });
  it('distinguishes revoked user grants, bot configuration and temporary outages without leaking bodies', async () => {
    for (const [status, kind, reason] of [
      [401, 'Bearer', 'reconnect'],
      [401, 'Bot', 'unavailable'],
      [503, 'Bearer', 'unavailable'],
      [429, 'Bearer', 'unavailable'],
    ] as const) {
      const api = new DiscordApi(async () =>
        Response.json({ message: 'SECRET MUST NOT LEAK', retry_after: 60 }, { status }),
      );
      await expect(api.request('/users/@me', 'PRIVATE', kind)).rejects.toMatchObject({ reason });
      await expect(api.request('/users/@me', 'PRIVATE', kind)).rejects.not.toThrow('SECRET');
    }
  });
  it('refreshes using the OAuth secret in a form without an empty bearer header', async () => {
    const network = vi.fn<typeof fetch>(async () =>
      Response.json({
        access_token: 'next',
        refresh_token: 'next-refresh',
        expires_in: 3600,
        scope: 'identify guilds',
      }),
    );
    const result = await new DiscordApi(network).refresh('refresh', app, 'secret');
    expect(result.accessToken).toBe('next');
    const init = network.mock.calls[0]![1]!;
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(new URLSearchParams(String(init.body)).get('client_secret')).toBe('secret');
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
  });
  it('rejects a grant for another app, missing guild scope or expired token', async () => {
    for (const grant of [
      { application: { id: b }, scopes: ['identify', 'guilds'], expires: expires() },
      { application: { id: app }, scopes: ['identify'], expires: expires() },
      { application: { id: app }, scopes: ['identify', 'guilds'], expires: '2020-01-01T00:00:00Z' },
    ]) {
      await expect(
        new DiscordApi(async () => Response.json(grant)).grant('access', app),
      ).rejects.toMatchObject({ reason: 'reconnect' });
    }
  });
});
describe('Encrypted Discord token lifecycle', () => {
  it('authenticates encrypted tokens against their user and rejects tampering', () => {
    const vault = cipher();
    const encrypted = vault.encrypt(userId, {
      accessToken: 'PRIVATE-ACCESS',
      refreshToken: 'PRIVATE-REFRESH',
    });
    expect(encrypted).not.toContain('PRIVATE');
    expect(vault.decrypt(userId, encrypted).accessToken).toBe('PRIVATE-ACCESS');
    expect(() => vault.decrypt('other-user', encrypted)).toThrow(DiscordConnectionError);
    expect(() => vault.decrypt(userId, encrypted.replace('v1.', 'v2.'))).toThrow(
      DiscordConnectionError,
    );
    expect(() => vault.decrypt(userId, encrypted.slice(0, -6) + 'broken')).toThrow(
      DiscordConnectionError,
    );
  });
  it('uses an unexpired Discord token independently of the Supabase session', async () => {
    const vault = cipher();
    const { db, rpc } = rpcDb(() => ({
      version: 1,
      encrypted_tokens: vault.encrypt(userId, { accessToken: 'access', refreshToken: 'refresh' }),
      expires_at: expires(),
      scopes: ['identify', 'guilds'],
    }));
    const api = new DiscordApi();
    const refresh = vi.spyOn(api, 'refresh');
    expect(await new DiscordTokenService(db, api, vault, app, 'secret').accessToken(userId)).toBe(
      'access',
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('read_discord_credentials', { p_user_id: userId });
  });
  it('refreshes expired tokens once and stores only the new encrypted grant', async () => {
    const vault = cipher();
    const { db, rpc } = rpcDb((name) =>
      name === 'read_discord_credentials'
        ? {
            version: 1,
            encrypted_tokens: vault.encrypt(userId, {
              accessToken: 'expired',
              refreshToken: 'refresh',
            }),
            expires_at: '2020-01-01',
            scopes: ['identify', 'guilds'],
          }
        : true,
    );
    const api = new DiscordApi();
    vi.spyOn(api, 'refresh').mockResolvedValue({
      accessToken: 'fresh',
      refreshToken: 'rotated',
      expiresAt: expires(),
      scopes: ['identify', 'guilds'],
    });
    expect(await new DiscordTokenService(db, api, vault, app, 'secret').accessToken(userId)).toBe(
      'fresh',
    );
    const saved = rpc.mock.calls.find(([name]) => name === 'finish_discord_refresh')![1];
    expect(vault.decrypt(userId, String(saved.p_encrypted_tokens))).toEqual({
      accessToken: 'fresh',
      refreshToken: 'rotated',
    });
    expect(rpc.mock.calls.some(([name]) => name === 'release_discord_refresh')).toBe(true);
  });
  it('revokes invalid refresh grants and requires reconnection without exposing the upstream body', async () => {
    const vault = cipher();
    const { db, rpc } = rpcDb((name) =>
      name === 'read_discord_credentials'
        ? {
            version: 2,
            encrypted_tokens: vault.encrypt(userId, {
              accessToken: 'expired',
              refreshToken: 'revoked',
            }),
            expires_at: '2020-01-01',
            scopes: [],
          }
        : true,
    );
    const api = new DiscordApi(async () =>
      Response.json({ error: 'invalid_grant' }, { status: 400 }),
    );
    await expect(
      new DiscordTokenService(db, api, vault, app, 'secret').accessToken(userId),
    ).rejects.toMatchObject({ reason: 'reconnect' });
    expect(rpc).toHaveBeenCalledWith('revoke_discord_credentials', {
      p_user_id: userId,
      p_version: 2,
    });
  });
  it('requires reconnection for old sessions or expired grants without a refresh token', async () => {
    const vault = cipher();
    for (const row of [
      null,
      {
        version: 1,
        encrypted_tokens: vault.encrypt(userId, { accessToken: 'expired', refreshToken: null }),
        expires_at: '2020-01-01',
        scopes: [],
      },
    ]) {
      const { db } = rpcDb(() => row);
      await expect(
        new DiscordTokenService(db, new DiscordApi(), vault, app, 'secret').accessToken(userId),
      ).rejects.toMatchObject({ reason: 'reconnect' });
    }
  });
  it('waits for an in-flight refresh and reuses its version instead of rotating twice', async () => {
    const vault = cipher();
    let reads = 0;
    const { db } = rpcDb((name) =>
      name === 'read_discord_credentials'
        ? {
            version: ++reads,
            encrypted_tokens: vault.encrypt(userId, {
              accessToken: reads === 1 ? 'expired' : 'refreshed-by-other-request',
              refreshToken: 'refresh',
            }),
            expires_at: reads === 1 ? '2020-01-01' : expires(),
            scopes: ['identify', 'guilds'],
          }
        : false,
    );
    const api = new DiscordApi();
    const refresh = vi.spyOn(api, 'refresh');
    expect(
      await new DiscordTokenService(db, api, vault, app, 'secret').accessToken(userId, true),
    ).toBe('refreshed-by-other-request');
    expect(refresh).not.toHaveBeenCalled();
  });
  it('validates the provider identity before capturing credentials', async () => {
    const { db, rpc } = rpcDb(() => null);
    const api = new DiscordApi(async (input) =>
      Response.json(
        String(input).endsWith('/oauth2/@me')
          ? { application: { id: app }, expires: expires(), scopes: ['identify', 'guilds'] }
          : { id: b, username: 'other' },
      ),
    );
    await expect(
      new DiscordTokenService(db, api, cipher(), app, 'secret').capture(
        userId,
        a,
        'access',
        'refresh',
      ),
    ).rejects.toMatchObject({ reason: 'reconnect' });
    expect(rpc).not.toHaveBeenCalled();
    await new DiscordTokenService(db, api, cipher(), app, 'secret').capture(
      userId,
      b,
      'access',
      'refresh',
    );
    expect(rpc.mock.calls[0]![0]).toBe('save_discord_credentials');
    expect(JSON.stringify(rpc.mock.calls[0]![1])).not.toContain('"access"');
  });
});
describe('Membership verification and preferences', () => {
  function membershipFixture(botFails = false) {
    const api = new DiscordApi();
    const guilds = new DiscordGuildService(api, app);
    const list = vi.spyOn(guilds, 'list').mockImplementation(async (_token, kind) => {
      if (kind === 'Bot' && botFails) throw new DiscordConnectionError('unavailable');
      return kind === 'Bot' ? [guild(a)] : [guild(a), guild(b)];
    });
    const tokens = new DiscordTokenService({} as NagiDatabase, api, cipher(), app, 'secret');
    vi.spyOn(tokens, 'accessToken').mockResolvedValue('user-token');
    const { db, rpc } = rpcDb((name) =>
      name === 'read_discord_guild_snapshot'
        ? {
            verified_at: new Date().toISOString(),
            bot_verified_at: new Date().toISOString(),
            guilds: [guild(a)],
          }
        : null,
    );
    return {
      service: new GuildMembershipService(db, guilds, tokens, app, 'bot-token'),
      list,
      rpc,
      tokens,
    };
  }
  it('uses only a short, user-scoped cache and forces live verification for writes', async () => {
    const { service, list, rpc } = membershipFixture();
    expect(await service.discover(userId)).toEqual([guild(a)]);
    expect(list).not.toHaveBeenCalled();
    expect(await service.discover(userId, true)).toEqual([guild(a)]);
    expect(list).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith(
      'record_discord_memberships',
      expect.objectContaining({ p_user_id: userId }),
    );
    await service.discover('another-user');
    expect(rpc).toHaveBeenLastCalledWith('read_discord_guild_snapshot', {
      p_user_id: 'another-user',
      p_application_id: app,
    });
    await expect(service.authorize(userId, b)).rejects.toMatchObject({ reason: 'forbidden' });
    await expect(service.authorize(userId, a, 'manage')).rejects.toMatchObject({
      reason: 'forbidden',
    });
  });
  it('does not persist partial data when either Discord inventory fails', async () => {
    const { service, rpc } = membershipFixture(true);
    await expect(service.discover(userId, true)).rejects.toMatchObject({ reason: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('changes the active space without changing an existing favorite', async () => {
    const write = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq: write }));
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { default_guild_id: a }, error: null }) }),
        }),
        update,
      }),
    } as unknown as NagiDatabase;
    const preferences = new GuildPreferencesService(db);
    await preferences.select(userId, b);
    expect(update).toHaveBeenLastCalledWith({ default_guild_id: a, last_active_guild_id: b });
    await preferences.select(userId, b, true);
    expect(update).toHaveBeenLastCalledWith({ default_guild_id: b, last_active_guild_id: b });
  });
  it('sets the first choice as the default and rejects invalid trip dates and payloads', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert,
      }),
    } as unknown as NagiDatabase;
    await new GuildPreferencesService(db).select(userId, a);
    expect(insert).toHaveBeenCalledWith({
      user_id: userId,
      default_guild_id: a,
      last_active_guild_id: a,
    });
    expect(tripInputSchema.parse({ title: '  Weekend ' })).toMatchObject({
      title: 'Weekend',
      start_date: null,
      end_date: null,
    });
    expect(tripInputSchema.safeParse({ title: ' ', start_date: '2027-02-01' }).success).toBe(false);
    expect(tripInputSchema.safeParse({ title: 'Trip', start_date: '2027-02-30' }).success).toBe(
      false,
    );
    expect(
      tripInputSchema.safeParse({ title: 'Trip', start_date: '2027-03-02', end_date: '2027-03-01' })
        .success,
    ).toBe(false);
    expect(tripInputSchema.safeParse({ title: 'Trip', guild_id: b }).success).toBe(false);
    expect(hasGuildAdministration('8')).toBe(true);
    expect(hasGuildAdministration('32')).toBe(true);
    expect(hasGuildAdministration('0', true)).toBe(true);
    expect(hasGuildAdministration('9007199254740992')).toBe(false);
  });
});

describe('Bot guild events', () => {
  it('reconciles and serializes joins, metadata changes and removals without deleting trips', async () => {
    const network = vi.fn<typeof fetch>(async (input) =>
      Response.json(String(input).endsWith('/oauth2/applications/@me') ? { id: app } : [guild(a)]),
    );
    vi.stubGlobal('fetch', network);
    const { db, rpc } = rpcDb(() => null);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const events = new EventEmitter();
    const registry = startGuildRegistry(
      events as unknown as Parameters<typeof startGuildRegistry>[0],
      db,
      app,
      'fixture-bot-token',
    );
    events.emit('guildCreate', guild(b, 'New'));
    events.emit('guildUpdate', guild(b, 'New'), guild(b, 'Renamed'));
    events.emit('guildUnavailable', guild(a));
    events.emit('guildDelete', guild(b, 'Renamed'));
    await registry.stop();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reconcile_discord_guilds',
      'set_discord_guild_presence',
      'set_discord_guild_presence',
      'set_discord_guild_presence',
    ]);
    expect(rpc.mock.calls[1]![1].p_present).toBe(true);
    expect(rpc.mock.calls[3]![1].p_present).toBe(false);
    expect(events.listenerCount('guildDelete')).toBe(0);
    expect(network).toHaveBeenCalledTimes(2);
  });
});
