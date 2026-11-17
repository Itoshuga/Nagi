import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCommands, validateCommand } from '../apps/bot/src/handlers/load-commands';
import {
  synchronizeCommands,
  type DiscordRegistryApi,
} from '../apps/bot/src/handlers/sync-commands';
import { commandAccess } from '../apps/bot/src/middlewares/access';
import { handleInteraction } from '../apps/bot/src/handlers/interaction';
import type { NagiCommand } from '../apps/bot/src/types/command';
import type { NagiDatabase } from '../packages/database/src/client';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
function command(name = 'ping', overrides: Partial<NagiCommand> = {}): NagiCommand {
  return {
    name,
    description: 'A command',
    category: 'general',
    isEnabled: true,
    isMaintenance: false,
    ownerOnly: false,
    adminOnly: false,
    data: { toJSON: () => ({ name, description: 'A command' }) },
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'nagi-commands-'));
  temporary.push(directory);
  return directory;
}
function source(name: string, enabled = true) {
  return `export default {name:'${name}',description:'A command',category:'general',isEnabled:${enabled},isMaintenance:false,ownerOnly:false,adminOnly:false,data:{toJSON:()=>({name:'${name}',description:'A command'})},async execute(){}};`;
}
function api(remote: unknown[] = []): DiscordRegistryApi {
  return { get: vi.fn().mockResolvedValue(remote), replace: vi.fn().mockResolvedValue([]) };
}
const scope = 'guild:123456789012345678';
const signal = new AbortController().signal;
describe('Automatic command loading', () => {
  it('discovers modules recursively and excludes disabled commands from the deployment', async () => {
    const dir = await fixture();
    await mkdir(join(dir, 'nested'));
    await writeFile(join(dir, 'ping.mjs'), source('ping'));
    await writeFile(join(dir, 'nested', 'disabled.mjs'), source('disabled', false));
    const registry = await loadCommands(dir);
    expect([...registry.all.keys()]).toEqual(['disabled', 'ping']);
    expect([...registry.enabled.keys()]).toEqual(['ping']);
  });
  it('rejects malformed modules, imports that fail, and inconsistent builders', async () => {
    const dir = await fixture();
    await writeFile(join(dir, 'bad.mjs'), 'export default {name:"bad"}');
    await expect(loadCommands(dir)).rejects.toThrow();
    await writeFile(join(dir, 'throw.mjs'), 'throw new Error("broken import")');
    await expect(loadCommands(dir)).rejects.toThrow();
    expect(() =>
      validateCommand(
        command('ping', { data: { toJSON: () => ({ name: 'other', description: 'A command' }) } }),
        'test',
      ),
    ).toThrow('incohérentes');
  });
  it('rejects duplicates even when a duplicate is disabled', async () => {
    const dir = await fixture();
    await writeFile(join(dir, 'a.mjs'), source('ping'));
    await writeFile(join(dir, 'b.mjs'), source('ping', false));
    await expect(loadCommands(dir)).rejects.toThrow('dupliquée');
  });
  it('never clears a remote registry when the local command directory cannot be loaded', async () => {
    const dir = await fixture();
    const discord = api([{ name: 'old' }]);
    await expect(
      (async () =>
        synchronizeCommands(discord, scope, await loadCommands(join(dir, 'missing')), signal))(),
    ).rejects.toThrow();
    expect(discord.replace).not.toHaveBeenCalled();
    expect((await loadCommands(dir)).enabled.size).toBe(0);
  });
  it('removes the last command after a successful empty directory scan', async () => {
    const dir = await fixture();
    const discord = api([{ name: 'obsolete', description: 'Old' }]);
    await synchronizeCommands(discord, scope, await loadCommands(dir), signal);
    expect(discord.replace).toHaveBeenCalledWith(scope, [], signal);
  });
  it('loads the real source commands without a central command list', async () => {
    const registry = await loadCommands(
      new URL('../apps/bot/src/commands/', import.meta.url).pathname,
    );
    expect([...registry.enabled.keys()].sort()).toEqual(['help', 'ping', 'status']);
    expect(registry.enabled.get('status')?.adminOnly).toBe(true);
  });
});
describe('Discord registry reconciliation', () => {
  it('replaces the exact scope and removes obsolete remote commands', async () => {
    const discord = api([{ name: 'obsolete', description: 'Old' }]);
    const ping = command();
    const registry = { all: new Map([['ping', ping]]), enabled: new Map([['ping', ping]]) };
    expect(await synchronizeCommands(discord, scope, registry, signal)).toEqual({
      changed: true,
      count: 1,
    });
    expect(discord.replace).toHaveBeenCalledWith(scope, [ping.data.toJSON()], signal);
  });
  it('removes disabled commands, including the last explicitly disabled command', async () => {
    const discord = api([{ name: 'ping', description: 'A command' }]);
    await synchronizeCommands(
      discord,
      scope,
      { all: new Map([['ping', command('ping', { isEnabled: false })]]), enabled: new Map() },
      signal,
    );
    expect(discord.replace).toHaveBeenCalledWith(scope, [], signal);
  });
  it('is idempotent despite Discord IDs and server-provided defaults', async () => {
    const ping = command();
    const discord = api([
      {
        ...ping.data.toJSON(),
        id: 'remote',
        version: 'v1',
        type: 1,
        options: [],
        nsfw: false,
        default_member_permissions: null,
      },
    ]);
    const result = await synchronizeCommands(
      discord,
      scope,
      { all: new Map([['ping', ping]]), enabled: new Map([['ping', ping]]) },
      signal,
    );
    expect(result.changed).toBe(false);
    expect(discord.replace).not.toHaveBeenCalled();
  });
  it('updates descriptions/options, propagates failures, and refuses invalid scopes', async () => {
    const ping = command();
    const discord = api([{ name: 'ping', description: 'Old description' }]);
    discord.replace = vi.fn().mockRejectedValue(new Error('network'));
    const registry = { all: new Map([['ping', ping]]), enabled: new Map([['ping', ping]]) };
    await expect(synchronizeCommands(discord, scope, registry, signal)).rejects.toThrow('network');
    await expect(synchronizeCommands(discord, 'guild:wrong', registry, signal)).rejects.toThrow(
      'Scope',
    );
  });
  it('does not deploy after losing the lease', async () => {
    const controller = new AbortController();
    controller.abort();
    const discord = api();
    const ping = command();
    await expect(
      synchronizeCommands(
        discord,
        scope,
        { all: new Map([['ping', ping]]), enabled: new Map([['ping', ping]]) },
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(discord.replace).not.toHaveBeenCalled();
  });
});
describe('Centralized access and maintenance', () => {
  const actor = { discordId: '123456789012345678', role: 'user' as const };
  it('rejects user admin access, then handles maintenance before execution', () => {
    expect(commandAccess(command('status', { adminOnly: true }), actor)).toBe('forbidden');
    expect(commandAccess(command('ping', { isMaintenance: true }), actor)).toBe('maintenance');
    expect(commandAccess(command('ping', { isEnabled: false }), actor)).toBe('disabled');
  });
  it('acknowledges ephemerally and never executes a command under maintenance', async () => {
    const ping = command('ping', { isMaintenance: true });
    const editReply = vi.fn().mockResolvedValue(undefined);
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      commandName: 'ping',
      user: { id: actor.discordId },
      deferReply,
      editReply,
    } as unknown as Parameters<typeof handleInteraction>[0];
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { role: 'user' }, error: null }) }),
        }),
      }),
    } as unknown as NagiDatabase;
    await handleInteraction(
      interaction,
      new Map([['ping', ping]]),
      {
        db,
        client: {} as Parameters<typeof handleInteraction>[2]['client'],
        applicationId: actor.discordId,
        scope,
      },
      [],
    );
    expect(deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(ping.execute).not.toHaveBeenCalled();
    expect(editReply.mock.calls[0]?.[0].embeds[0].data.title).toBe(
      'Commande temporairement indisponible',
    );
  });
});
