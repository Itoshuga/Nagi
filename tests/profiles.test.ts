import { describe, expect, it, vi } from 'vitest';
import {
  profileBioInput,
  profileTitleInput,
  profileCustomizationInput,
  profileHandleInput,
  profileHref,
} from '../packages/shared/src/profiles';
import { SocialProfileStore } from '../packages/database/src/profiles';
import type { NagiDatabase } from '../packages/database/src/client';
import { SocialProfileAccess } from '../packages/discord/src/profiles';
import { DiscordConnectionError } from '../packages/discord/src/api';

const user = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const values = {
  profile_title: 'En quête de ramen 🍜',
  bio: 'J’aime Tokyo. Et les petits matins.\nProchain arrêt : Kyoto !',
  accent: '#73a6df',
  banner_x: 50,
  banner_y: 50,
  dream_country_id: null,
  dream_city_id: null,
};
describe('Social profile plain text validation', () => {
  it('preserves French prose, emojis and multiline biographies', () => {
    expect(profileCustomizationInput.parse(values)).toEqual(values);
    expect(profileBioInput.parse('  Un café à 12h30.\r\nPuis un musée ✈️  ')).toBe(
      'Un café à 12h30.\nPuis un musée ✈️',
    );
    expect(profileTitleInput.safeParse('🍜'.repeat(40)).success).toBe(true);
    expect(profileTitleInput.safeParse('🍜'.repeat(41)).success).toBe(false);
    expect(profileBioInput.safeParse('あ'.repeat(280)).success).toBe(true);
    expect(profileBioInput.safeParse('あ'.repeat(281)).success).toBe(false);
    expect(profileBioInput.safeParse('👩‍🚀 En route !').success).toBe(true);
  });
  it.each([
    'https://example.com',
    'http://example.com',
    'www.example.com',
    'example.fr',
    'bit.ly/nagi',
    'discord.gg/nagi',
    'discord.com/invite/nagi',
    'mailto:hello@example.fr',
    'steam:1234',
    'file:///etc/passwd',
    'tg://resolve?domain=hello',
    '[Voyage](https://example.fr)',
    '<a href="https://example.fr">Bonjour</a>',
    'ｈｔｔｐｓ：／／ｅｘａｍｐｌｅ．ｃｏｍ',
    'example。com',
    'exam\u200bple.com',
    'https : / / example.com',
    'h t t p s : / / example.com',
    'example [dot] com',
    'example (.) com',
    'example point com',
    'example dot com',
    '例え.テスト',
    'example . com',
    'example. com',
    'https%3A%2F%2Fexample.com',
    '%65%78%61%6d%70%6c%65%2e%63%6f%6d',
    'example&#46;com',
    'https&colon;&sol;&sol;example.com',
    '192.168.1.1',
  ])('rejects external links including common obfuscations: %s', (text) => {
    const result = profileBioInput.safeParse(text);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some(
          (issue) =>
            issue.message === 'Les liens externes ne sont pas autorisés dans votre biographie.',
        ),
      ).toBe(true);
    expect(profileTitleInput.safeParse(text).success).toBe(false);
  });
  it.each([
    '<script>alert(1)</script>',
    '<!-- HTML comment -->',
    '<!DOCTYPE html>',
    '||spoiler||',
    '---',
    '<@123456789012345678>',
    '<@!123456789012345678>',
    '<@&123456789012345678>',
    '<#123456789012345678>',
    '@everyone',
    '@here',
    '**bonjour**',
    '_bonjour_',
    '`bonjour`',
    '# Bonjour',
    '> Bonjour',
    '- Bonjour',
    '1. Bonjour',
    'texte\x00',
  ])('rejects HTML, Markdown and interactive mentions: %s', (text) => {
    expect(profileBioInput.safeParse(text).success).toBe(false);
  });
  it('accepts only supported accents, positions, coherent IDs and readable handles', () => {
    expect(profileCustomizationInput.safeParse({ ...values, accent: 'red' }).success).toBe(false);
    expect(profileCustomizationInput.safeParse({ ...values, banner_y: 101 }).success).toBe(false);
    expect(profileCustomizationInput.safeParse({ ...values, dream_city_id: target }).success).toBe(
      false,
    );
    expect(profileTitleInput.safeParse('Deux\nlignes').success).toBe(false);
    expect(profileHandleInput.parse('@Haru')).toBe('haru');
    expect(profileHandleInput.parse('%40haru')).toBe('haru');
    expect(profileHandleInput.safeParse('%40%2fadmin').success).toBe(false);
    expect(profileHandleInput.safeParse('%2540haru').success).toBe(false);
    expect(profileHandleInput.safeParse('@../../admin').success).toBe(false);
    expect(profileHref('haru')).toBe('/app/profile/@haru');
  });
});

describe('Trusted profile services', () => {
  it('validates in the service before any write and rejects foreign banner ownership', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const store = new SocialProfileStore({ rpc } as unknown as NagiDatabase, 'app');
    await expect(store.save(user, 1, { ...values, bio: 'example.com' }, null)).rejects.toThrow();
    await expect(store.save(user, 1, values, `${target}/${target}.webp`)).rejects.toThrow(
      'Bannière invalide',
    );
    expect(rpc).not.toHaveBeenCalled();
    await store.save(user, 1, values, `${user}/${target}.webp`);
    expect(rpc).toHaveBeenCalledWith(
      'save_social_customization',
      expect.objectContaining({
        p_user: user,
        p_revision: 1,
        p_data: expect.objectContaining({ banner_path: `${user}/${target}.webp` }),
      }),
    );
  });
  it('refreshes both memberships before asking the database for the minimal DTO', async () => {
    const calls: string[] = [];
    const discover = vi.fn(async (id: string) => {
      calls.push(id);
      return [];
    });
    const read = vi.fn(async () => {
      expect(calls).toEqual([user, target]);
      return null;
    });
    const access = new SocialProfileAccess({ read } as unknown as SocialProfileStore, { discover });
    expect(await access.read(user, target)).toBeNull();
    expect(read).toHaveBeenCalledWith(user, target);
  });
  it('fails closed on revoked credentials or membership outages, while retaining own profile access', async () => {
    const read = vi.fn().mockResolvedValue({ id: user });
    const discover = vi.fn().mockRejectedValue(new DiscordConnectionError('reconnect'));
    const access = new SocialProfileAccess({ read } as unknown as SocialProfileStore, { discover });
    expect(await access.read(user, target)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(await access.read(user, user)).toEqual({ id: user });
    read.mockClear();
    discover.mockRejectedValue(new Error('Network failure'));
    await expect(access.read(user, target)).rejects.toThrow('Network failure');
    expect(read).not.toHaveBeenCalled();
  });
  it('returns safe conflict feedback without swallowing optimistic concurrency', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'profile_conflict', code: '40001' } });
    const store = new SocialProfileStore({ rpc } as unknown as NagiDatabase, 'app');
    await expect(store.save(user, 1, values, null)).rejects.toThrow('Votre profil a changé');
  });
});
