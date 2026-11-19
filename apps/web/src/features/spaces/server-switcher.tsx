'use client';
import Link from 'next/link';
import { Check, ChevronDown, Grid2X2, LoaderCircle, Settings2, Star } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nagi/ui';
import type { DiscordGuild } from '@nagi/shared';
import { GuildAvatar } from './guild-avatar';
import { setDefaultGuild } from './actions';

export function ServerSwitcher({
  guild,
  guilds,
  favorite,
  action,
  pending,
}: {
  guild: DiscordGuild;
  guilds: DiscordGuild[];
  favorite: string | null;
  action: (form: FormData) => void;
  pending: boolean;
}) {
  return (
    <div className="app-server-switcher">
      <form id="nagi-switch-space" action={action} />
      <form id="nagi-default-space" action={setDefaultGuild}>
        <input type="hidden" name="guildId" value={guild.id} />
      </form>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="app-server-trigger"
            aria-label={`Ouvrir le menu de l’espace ${guild.name}`}
            aria-busy={pending}
            disabled={pending}
          >
            <GuildAvatar guild={guild} />
            <span className="app-server-name" title={guild.name}>
              {guild.name}
            </span>
            {pending ? (
              <LoaderCircle
                className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <ChevronDown className="app-menu-chevron size-3 shrink-0" aria-hidden="true" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={12} className="app-menu app-server-menu">
          <div className="app-menu-heading">
            <p className="app-menu-eyebrow">Changer d’espace</p>
            <p className="mt-1 text-xs text-muted-foreground">Vos serveurs, vos projets.</p>
          </div>
          <div className="app-server-list">
            {guilds.map((item) => (
              <DropdownMenuItem
                key={item.id}
                asChild
                disabled={pending}
                onSelect={(event) => event.preventDefault()}
              >
                <button
                  form="nagi-switch-space"
                  type="submit"
                  name="guildId"
                  value={item.id}
                  disabled={pending}
                  className="app-server-option"
                  data-active={item.id === guild.id}
                  aria-current={item.id === guild.id ? 'true' : undefined}
                >
                  <GuildAvatar guild={item} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
                  {favorite === item.id && (
                    <Star
                      aria-label="Par défaut"
                      className="size-3 shrink-0 fill-primary text-primary-ink"
                    />
                  )}
                  {item.id === guild.id && (
                    <Check aria-label="Actif" className="size-4 shrink-0 text-primary-ink" />
                  )}
                </button>
              </DropdownMenuItem>
            ))}
          </div>
          <div className="app-menu-section">
            <DropdownMenuItem asChild disabled={pending}>
              <Link href={`/app/${guild.id}/settings`}>
                <Settings2 className="size-4" />
                Paramètres de l’espace
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              asChild
              disabled={favorite === guild.id || pending}
              onSelect={(event) => event.preventDefault()}
            >
              <button
                type="submit"
                form="nagi-default-space"
                disabled={favorite === guild.id || pending}
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
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {pending && (
        <span role="status" className="sr-only">
          Ouverture de votre espace…
        </span>
      )}
    </div>
  );
}
