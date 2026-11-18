'use client';
import { useSearchParams } from 'next/navigation';
import type { DiscordGuild, Role } from '@nagi/shared';
import { ServerHeader } from '@/features/spaces/server-header';
import { AppHeader } from './app-header';

export function AccountHeader({
  viewer,
  guilds,
  defaultGuildId,
  lastActiveGuildId,
}: {
  viewer: { username?: string; display_name: string; avatar_url: string | null; role: Role };
  guilds: DiscordGuild[];
  defaultGuildId: string | null;
  lastActiveGuildId: string | null;
}) {
  const params = useSearchParams();
  // URL context can select only an already verified space; it never grants access.
  const guild = [params.get('guild'), lastActiveGuildId, defaultGuildId]
    .map((id) => guilds.find((item) => item.id === id))
    .find(Boolean);
  return guild ? (
    <ServerHeader
      key={guild.id}
      guild={guild}
      guilds={guilds}
      favorite={defaultGuildId}
      viewer={viewer}
    />
  ) : (
    <AppHeader viewer={viewer} context={<span className="app-account-context">Mon profil</span>} />
  );
}
