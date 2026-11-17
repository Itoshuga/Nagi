import { z } from 'zod';
import { discordGuildSchema, discordUserSchema, type DiscordGuild } from '@nagi/shared';

export class DiscordConnectionError extends Error {
  constructor(
    public readonly reason: 'reconnect' | 'unavailable' | 'forbidden',
    public readonly code?: number,
  ) {
    super(
      reason === 'reconnect'
        ? 'Reconnectez Discord pour retrouver vos espaces.'
        : reason === 'forbidden'
          ? 'Cet espace Discord ne vous est plus accessible.'
          : 'Discord est temporairement indisponible. Réessayez dans quelques instants.',
    );
    this.name = 'DiscordConnectionError';
  }
}
const grantSchema = z.object({
  application: z.object({ id: z.string() }),
  scopes: z.array(z.string()),
  expires: z.iso.datetime({ offset: true }),
});
const refreshSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.string(),
});
export class DiscordApi {
  private verifiedBotToken: string | undefined;
  constructor(private readonly network: typeof fetch = fetch) {}
  async request(
    path: string,
    token: string,
    kind: 'Bearer' | 'Bot',
    method = 'GET',
    form?: URLSearchParams,
  ): Promise<unknown> {
    const signal = AbortSignal.timeout(12000);
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await this.network(`https://discord.com/api/v10${path}`, {
          method,
          headers: {
            ...(token ? { Authorization: `${kind} ${token}` } : {}),
            ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          },
          ...(form ? { body: form } : {}),
          signal,
          cache: 'no-store',
        });
      } catch {
        throw new DiscordConnectionError('unavailable');
      }
      if (response.status === 204) return null;
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) return body;
      const value = body as { retry_after?: number; code?: number; error?: string } | null;
      if (
        response.status === 429 &&
        attempt < 2 &&
        typeof value?.retry_after === 'number' &&
        value.retry_after <= 3
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.ceil(value.retry_after! * 1000) + 100),
        );
        continue;
      }
      if (value?.error === 'invalid_grant' || (response.status === 401 && kind === 'Bearer'))
        throw new DiscordConnectionError('reconnect', value?.code);
      if (response.status === 403 || response.status === 404)
        throw new DiscordConnectionError(
          kind === 'Bearer' ? 'reconnect' : 'forbidden',
          value?.code,
        );
      throw new DiscordConnectionError('unavailable', value?.code);
    }
    throw new DiscordConnectionError('unavailable');
  }
  async verifyBot(token: string, applicationId: string) {
    if (this.verifiedBotToken === token) return;
    const app = z
      .object({ id: z.string() })
      .parse(await this.request('/oauth2/applications/@me', token, 'Bot'));
    if (app.id !== applicationId)
      throw new Error('Le token du bot ne correspond pas à DISCORD_APPLICATION_ID.');
    this.verifiedBotToken = token;
  }
  async grant(token: string, applicationId: string) {
    const grant = grantSchema.parse(await this.request('/oauth2/@me', token, 'Bearer'));
    if (
      grant.application.id !== applicationId ||
      Date.parse(grant.expires) <= Date.now() ||
      !['identify', 'guilds'].every((scope) => grant.scopes.includes(scope))
    )
      throw new DiscordConnectionError('reconnect');
    return { scopes: grant.scopes, expiresAt: grant.expires };
  }
  async refresh(refreshToken: string, applicationId: string, secret: string) {
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: applicationId,
      client_secret: secret,
      refresh_token: refreshToken,
    });
    const result = refreshSchema.parse(
      await this.request('/oauth2/token', '', 'Bearer', 'POST', form),
    );
    const scopes = result.scope.split(/\s+/);
    if (!['identify', 'guilds'].every((scope) => scopes.includes(scope)))
      throw new DiscordConnectionError('reconnect');
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
      scopes,
    };
  }
}
export function guildIcon(id: string, hash: string | null) {
  return hash
    ? `https://cdn.discordapp.com/icons/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=256`
    : null;
}
export class DiscordUserService {
  constructor(private readonly api: DiscordApi) {}
  async current(token: string) {
    const user = discordUserSchema.parse(await this.api.request('/users/@me', token, 'Bearer'));
    const defaultAvatar =
      user.discriminator === '0'
        ? Number((BigInt(user.id) >> 22n) % 6n)
        : Number(user.discriminator) % 5;
    return {
      ...user,
      avatar_url: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${defaultAvatar}.png`,
      banner_url: user.banner
        ? `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${user.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024`
        : null,
    };
  }
}
export class DiscordGuildService {
  constructor(
    private readonly api: DiscordApi,
    private readonly applicationId: string,
  ) {}
  async list(token: string, kind: 'Bearer' | 'Bot'): Promise<DiscordGuild[]> {
    if (kind === 'Bot') await this.api.verifyBot(token, this.applicationId);
    const result = new Map<string, DiscordGuild>();
    let after = '';
    for (let page = 0; page < 500; page++) {
      const query = new URLSearchParams({ limit: '200', ...(after ? { after } : {}) });
      const guilds = z
        .array(discordGuildSchema)
        .parse(await this.api.request(`/users/@me/guilds?${query}`, token, kind));
      for (const guild of guilds)
        result.set(guild.id, {
          ...guild,
          icon_url: guildIcon(guild.id, guild.icon),
          members_can_create_trips: true,
        });
      if (guilds.length < 200) return [...result.values()];
      const next = guilds.reduce(
        (max, guild) => (BigInt(guild.id) > BigInt(max) ? guild.id : max),
        '0',
      );
      if (next === after) throw new DiscordConnectionError('unavailable');
      after = next;
    }
    throw new DiscordConnectionError('unavailable');
  }
  intersect(user: readonly DiscordGuild[], bot: readonly DiscordGuild[]) {
    const installed = new Map(bot.map((guild) => [guild.id, guild]));
    return user
      .flatMap((guild) => {
        const common = installed.get(guild.id);
        return common
          ? [{ ...guild, name: common.name, icon: common.icon, icon_url: common.icon_url }]
          : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
}
