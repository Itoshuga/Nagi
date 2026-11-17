'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActionState } from 'react';
import { Check, ChevronDown, Grid2X2, Star } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@nagi/ui';
import type { DiscordGuild, Role } from '@nagi/shared';
import { Logo } from '@/components/shared/logo';
import { UserMenu } from '@/components/layout/user-menu';
import { GuildAvatar } from './guild-avatar';
import { selectGuild, setDefaultGuild } from './actions';

export function ServerHeader({
  guild,
  guilds,
  favorite,
  viewer,
}: {
  guild: DiscordGuild;
  guilds: DiscordGuild[];
  favorite: string | null;
  viewer: { display_name: string; avatar_url: string | null; role: Role };
}) {
  const pathname = usePathname();
  const [state, action, pending] = useActionState(selectGuild, { error: '' });
  const base = `/app/${guild.id}`;
  return (
    <header className="border-b border-border bg-white/90">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-7">
          <div className="hidden sm:block">
            <Logo href="/app" />
          </div>
          <form id="nagi-switch-space" action={action} />
          <form id="nagi-default-space" action={setDefaultGuild}>
            <input type="hidden" name="guildId" value={guild.id} />
          </form>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto min-w-0 gap-3 rounded-2xl p-1.5"
                aria-label={`Changer d’espace, ${guild.name}`}
                disabled={pending}
              >
                <GuildAvatar guild={guild} />
                <span className="min-w-0 text-left">
                  <span className="block text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    Espace Discord
                  </span>
                  <span className="mt-0.5 block max-w-36 truncate text-sm font-extrabold text-foreground sm:max-w-56">
                    {guild.name}
                  </span>
                </span>
                <ChevronDown className="size-3.5 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto">
              <p className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Vos espaces
              </p>
              {guilds.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  asChild
                  onSelect={(event) => event.preventDefault()}
                >
                  <button
                    form="nagi-switch-space"
                    type="submit"
                    name="guildId"
                    value={item.id}
                    disabled={pending}
                    className="w-full text-left"
                  >
                    <GuildAvatar guild={item} />
                    <span className="flex-1 truncate font-semibold">{item.name}</span>
                    {favorite === item.id && (
                      <Star
                        aria-label="Par défaut"
                        className="size-3 fill-primary text-primary-ink"
                      />
                    )}
                    {item.id === guild.id && <Check aria-label="Actif" className="size-4" />}
                  </button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                asChild
                onSelect={(event) => event.preventDefault()}
                disabled={favorite === guild.id}
              >
                <button
                  type="submit"
                  form="nagi-default-space"
                  disabled={favorite === guild.id}
                  className="w-full text-left"
                >
                  <Star className="size-4" />
                  {favorite === guild.id
                    ? 'Votre serveur par défaut'
                    : 'Définir comme serveur par défaut'}
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/select-server">
                  <Grid2X2 className="size-4" />
                  Tous mes espaces
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <UserMenu viewer={viewer} />
      </div>
      {state.error && (
        <p role="alert" className="px-5 pb-3 text-center text-sm text-destructive">
          {state.error}
        </p>
      )}
      <nav
        aria-label="Navigation de l’espace"
        className="mx-auto flex max-w-7xl gap-0.5 overflow-x-auto px-3 pb-4 sm:gap-1 sm:px-8"
      >
        {[
          ['', 'Vue d’ensemble'],
          ['/trips', 'Voyages'],
          ['/discover', 'Découvrir'],
          ['/settings', 'Paramètres'],
        ].map(([path, label]) => (
          <Link
            key={path}
            href={`${base}${path}`}
            className="space-nav-link"
            aria-current={
              (path === '' ? pathname === base : pathname.startsWith(`${base}${path}`))
                ? 'page'
                : undefined
            }
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
