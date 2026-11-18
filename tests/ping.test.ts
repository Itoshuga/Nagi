import { afterEach, describe, expect, it, vi } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import ping from '../apps/bot/src/commands/general/ping';
import { handleInteraction } from '../apps/bot/src/handlers/interaction';
import { validateCommand } from '../apps/bot/src/handlers/load-commands';
import { checkDatabase, milliseconds } from '../apps/bot/src/services/health';
import type { CommandContext, NagiCommand } from '../apps/bot/src/types/command';
import type { NagiDatabase } from '../packages/database/src/client';

afterEach(() => vi.restoreAllMocks());
const applicationId = '123456789012345678';
const scope = 'guild:987654321098765432';
function fixture() {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'user' }, error: null }),
  };
  const from = vi.fn().mockReturnValue(query);
  const db = { from } as unknown as NagiDatabase;
  const rawClient = {
    isReady: vi.fn().mockReturnValue(true),
    ws: { ping: 48.2 },
    uptime: 3661000,
    guilds: { cache: { size: 2 } },
    user: {
      displayAvatarURL: vi.fn().mockReturnValue('https://cdn.discordapp.com/embed/avatars/0.png'),
    },
  };
  const client = rawClient as unknown as CommandContext['client'];
  const interaction = {
    commandName: 'ping',
    user: {
      id: '111111111111111111',
      username: 'camille',
      displayAvatarURL: vi.fn().mockReturnValue('https://cdn.discordapp.com/embed/avatars/1.png'),
    },
    createdAt: new Date('2026-08-17T00:42:00.000Z'),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
  const context = { db, client, applicationId, scope };
  async function run(command: NagiCommand = ping) {
    await handleInteraction(
      interaction as unknown as Parameters<typeof handleInteraction>[0],
      new Map([['ping', command]]),
      context,
      [],
    );
    const payload = interaction.editReply.mock.calls[0]?.[0];
    const embed = payload?.embeds[0]?.toJSON();
    const section = (name: string) =>
      embed.description
        .split('\n\n')
        .find((block: string) => block.startsWith(name + '.\n')) as string;
    return { payload, embed, section };
  }
  return { query, from, db, rawClient, interaction, context, run };
}

describe('Public /ping diagnostics', () => {
  it('replies publicly with the bot thumbnail and a dated requester footer', async () => {
    const f = fixture();
    f.interaction.deferReply.mockImplementation(async () => {
      await delay(20);
    });
    const { payload, embed, section } = await f.run();
    expect(f.interaction.deferReply).toHaveBeenCalledWith({});
    expect(f.from).toHaveBeenCalledExactlyOnceWith('bot_runtime');
    expect(f.query.select).toHaveBeenCalledWith('application_id');
    expect(f.query.eq).toHaveBeenCalledWith('application_id', applicationId);
    expect(f.query.eq).toHaveBeenCalledWith('scope', scope);
    expect(f.query.limit).toHaveBeenCalledWith(1);
    expect(f.query.abortSignal.mock.calls[0]![0]).toBeInstanceOf(AbortSignal);
    expect(embed.title).toContain('Aye Sir !!');
    expect(embed.title).toBe('Aye Sir !! Nagi au rapport.');
    expect(embed.description).toContain(
      'J’ai inspecté toutes les machines et bonne nouvelle !\nÇa ronronne comme il faut !',
    );
    expect(embed.footer).toEqual({
      text: 'Demandé par @camille • 17/08/2026, 02:42',
      icon_url: 'https://cdn.discordapp.com/embed/avatars/1.png',
    });
    expect(f.interaction.user.displayAvatarURL).toHaveBeenCalledWith({
      extension: 'png',
      size: 64,
    });
    expect(embed.timestamp).toBeUndefined();
    expect(embed.fields).toBeUndefined();
    expect(embed.color).toBe(0x73a6df);
    expect(section('Discord')).toContain('> A répondu `🟢 Connecté` en **48ms**.');
    expect(Number(section('API Discord').match(/\d+/)?.[0])).toBeGreaterThanOrEqual(10);
    expect(section('Supabase')).toContain('🟢 Connecté');
    expect(embed.thumbnail.url).toBe('https://cdn.discordapp.com/embed/avatars/0.png');
    expect(payload.allowedMentions).toEqual({ parse: [] });
    expect(JSON.stringify(embed).length).toBeLessThan(6000);
  });

  it.each(['reported error', 'thrown error'])(
    'still answers during a database outage (%s)',
    async (failure) => {
      const f = fixture();
      const secret = 'postgresql://private:password@private-host/database';
      if (failure === 'reported error')
        f.query.abortSignal.mockResolvedValue({ data: null, error: { message: secret } });
      else f.query.abortSignal.mockRejectedValue(new Error(secret));
      const { embed, section } = await f.run();
      expect(f.interaction.deferReply).toHaveBeenCalledWith({});
      expect(embed.color).toBe(0xa87a36);
      expect(embed.description).toContain('Un voyant clignote');
      expect(embed.footer.text).toBe('Demandé par @camille • 17/08/2026, 02:42');
      expect(section('Supabase')).toContain('Indisponible');
      expect(section('Discord')).toContain('Connecté');
      expect(JSON.stringify(embed)).not.toContain(secret);
      expect(f.query.maybeSingle).not.toHaveBeenCalled();
    },
  );

  it('aborts an unresponsive database and publishes a timeout diagnosis', async () => {
    const f = fixture();
    let signal: AbortSignal | undefined;
    f.query.abortSignal.mockImplementation((requestSignal: AbortSignal) => {
      signal = requestSignal;
      return new Promise((_resolve, reject) =>
        requestSignal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }),
      );
    });
    const { embed, section } = await f.run();
    expect(signal?.aborted).toBe(true);
    expect(embed.color).toBe(0xa87a36);
    expect(section('Supabase')).toContain('Délai dépassé');
    expect(f.interaction.deferReply).toHaveBeenCalledWith({});
  });

  it('reports gateway reconnects and unknown heartbeat values honestly', async () => {
    const f = fixture();
    f.rawClient.isReady.mockReturnValue(false);
    f.rawClient.ws.ping = -1;
    const { embed, section } = await f.run();
    expect(section('Discord')).toContain('Reconnexion');
    expect(section('Discord')).not.toContain('A répondu');
    expect(section('Discord')).not.toContain('-1ms');
    expect(embed.color).toBe(0xa87a36);
  });

  it('uses the request time in Paris, including winter time and date rollover', async () => {
    const f = fixture();
    f.interaction.createdAt = new Date('2026-12-31T23:42:00.000Z');
    const { embed } = await f.run();
    expect(embed.footer.text).toBe('Demandé par @camille • 01/01/2027, 00:42');
    expect(embed.thumbnail.url).toBe('https://cdn.discordapp.com/embed/avatars/0.png');
    expect(embed.timestamp).toBeUndefined();
  });

  it('keeps maintenance responses private and does not execute the probe', async () => {
    const f = fixture();
    const execute = vi.fn();
    const { embed } = await f.run({ ...ping, isMaintenance: true, execute });
    expect(f.interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(embed.title).toBe('Commande temporairement indisponible');
    expect(execute).not.toHaveBeenCalled();
    expect(f.from).not.toHaveBeenCalled();
  });

  it('preserves private replies and profile-based access for ordinary commands', async () => {
    const f = fixture();
    const execute = vi.fn().mockResolvedValue(undefined);
    await f.run({
      ...ping,
      ephemeral: undefined,
      requiresProfile: undefined,
      execute: async (interaction, context) => {
        await execute(context);
        await interaction.editReply({ embeds: [] });
      },
    });
    expect(f.interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(f.from).toHaveBeenCalledWith('profiles');
    expect(execute.mock.calls[0]?.[0].actor.role).toBe('user');
  });

  it('never bypasses privileged permissions when Supabase fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const f = fixture();
    f.query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'private database error' },
    });
    const execute = vi.fn();
    const { embed } = await f.run({ ...ping, adminOnly: true, execute });
    expect(f.interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(f.from).toHaveBeenCalledWith('profiles');
    expect(execute).not.toHaveBeenCalled();
    expect(embed.title).toBe('Une erreur est survenue');
    expect(JSON.stringify(embed)).not.toContain('private database error');
  });
});

describe('Diagnostic contracts', () => {
  it('treats an empty successful database read as reachable', async () => {
    const f = fixture();
    const health = await checkDatabase(f.db, applicationId, scope);
    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.timedOut).toBe(false);
  });

  it('validates optional command metadata and rejects profile bypass on protected commands', () => {
    expect(() => validateCommand(ping, 'ping')).not.toThrow();
    for (const value of [
      { ...ping, ephemeral: 'public' },
      { ...ping, requiresProfile: 'no' },
      { ...ping, adminOnly: true },
      { ...ping, ownerOnly: true },
    ])
      expect(() => validateCommand(value, 'bad')).toThrow();
  });

  it('formats zero and missing latencies without inventing measurements', () => {
    expect(milliseconds(0)).toBe('0ms');
    expect(milliseconds(-1)).toBe('Non mesurée');
    expect(milliseconds(Number.NaN)).toBe('Non mesurée');
    expect(milliseconds(undefined)).toBe('Non mesurée');
  });
});
