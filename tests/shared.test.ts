import { describe, expect, it, vi } from 'vitest';
import {
  botPresence,
  categoryInputSchema,
  commandScope,
  entryInputSchema,
  isPrivatePath,
  parseEnv,
  relationInputSchema,
  safeNext,
  serviceEnvSchema,
} from '../packages/shared/src';
import { canExecute, resolveRole } from '../packages/permissions/src';
import { createCategory, findActor } from '../packages/database/src/services';
import type { NagiDatabase } from '../packages/database/src/client';
describe('Shared authorization', () => {
  it('resolves owners only from trusted server configuration and admins from profiles', () => {
    expect(resolveRole('123', 'user', ['123'])).toBe('owner');
    expect(resolveRole('123', 'owner', [])).toBe('user');
    expect(resolveRole('123', 'admin', [])).toBe('admin');
    expect(
      canExecute({ discordId: '1', role: 'owner' }, { adminOnly: true, ownerOnly: false }),
    ).toBe(true);
    expect(
      canExecute({ discordId: '1', role: 'admin' }, { adminOnly: true, ownerOnly: true }),
    ).toBe(false);
  });
  it('fails closed on permission lookup failure', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ error: new Error('offline') }) }),
        }),
      }),
    } as unknown as NagiDatabase;
    await expect(findActor(db, '1', ['1'])).rejects.toThrow('permissions');
  });
});
describe('Route boundaries and OAuth redirect validation', () => {
  it.each(['/app', '/app/profile', '/admin', '/admin/users'])('protects %s', (path) =>
    expect(isPrivatePath(path)).toBe(true),
  );
  it.each(['/', '/login', '/application', '/administrator'])(
    'does not match unrelated path %s',
    (path) => expect(isPrivatePath(path)).toBe(false),
  );
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/app\\@evil.test',
    '/app\nhttps://evil.test',
    '/login',
    'javascript:alert(1)',
  ])('blocks redirect %s', (value) => expect(safeNext(value)).toBe('/app'));
  it('keeps safe internal destinations', () =>
    expect(safeNext('/admin/categories?sort=name')).toBe('/admin/categories?sort=name'));
});
describe('Model validation and shared services', () => {
  it('rejects malformed slugs, unexpected role fields and self-relations', () => {
    expect(categoryInputSchema.safeParse({ name: 'Valid', slug: 'Invalid Slug' }).success).toBe(
      false,
    );
    expect(
      categoryInputSchema.safeParse({ name: 'Valid', slug: 'valid', role: 'admin' }).success,
    ).toBe(false);
    expect(entryInputSchema.safeParse({ city_id: 'bad-id' }).success).toBe(false);
    const id = '11111111-1111-4111-8111-111111111111';
    expect(relationInputSchema.safeParse({ source_id: id, target_id: id }).success).toBe(false);
  });
  it('authorizes and validates before any privileged database write', async () => {
    const from = vi.fn();
    const db = { from } as unknown as NagiDatabase;
    await expect(
      createCategory(db, { discordId: '1', role: 'user' }, { name: 'Nature', slug: 'nature' }),
    ).rejects.toThrow('administrateur');
    await expect(
      createCategory(db, { discordId: '1', role: 'admin' }, { name: 'Nature', slug: 'BAD' }),
    ).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it('writes validated values through the same service for either backend', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'id', name: 'Nature' }, error: null });
    const insert = vi.fn().mockReturnValue({ select: () => ({ single }) });
    const db = { from: vi.fn().mockReturnValue({ insert }) } as unknown as NagiDatabase;
    await expect(
      createCategory(db, { discordId: '1', role: 'admin' }, { name: ' Nature ', slug: 'nature' }),
    ).resolves.toMatchObject({ name: 'Nature' });
    expect(insert).toHaveBeenCalledWith({ name: 'Nature', slug: 'nature', position: 0 });
  });
});
describe('Heartbeat and server configuration', () => {
  it('does not mistake a stale connection flag for an online bot', () => {
    const now = Date.now();
    expect(botPresence(new Date(now - 10000).toISOString(), true, now)).toBe('online');
    expect(botPresence(new Date(now - 60000).toISOString(), true, now)).toBe('unavailable');
    expect(botPresence(new Date(now - 100000).toISOString(), true, now)).toBe('offline');
    expect(botPresence(null, true, now)).toBe('offline');
    expect(botPresence('invalid', true, now)).toBe('offline');
  });
  it('requires a guild ID and redacts invalid secrets in validation errors', () => {
    const env = {
      SUPABASE_SERVICE_ROLE_KEY: 'do-not-print-this',
      DISCORD_APPLICATION_ID: '123456789012345678',
    };
    expect(() => parseEnv(serviceEnvSchema, env)).toThrow('DISCORD_DEV_GUILD_ID');
    try {
      parseEnv(serviceEnvSchema, env);
    } catch (error) {
      expect(String(error)).not.toContain('do-not-print-this');
    }
    expect(commandScope({ DISCORD_COMMAND_SCOPE: 'global' })).toBe('global');
  });
});
