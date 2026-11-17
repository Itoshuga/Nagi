'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActionState } from 'react';
import { Compass, House, MapPinned } from 'lucide-react';
import type { DiscordGuild, Role } from '@nagi/shared';
import { AppHeader } from '@/components/layout/app-header';
import { ServerSwitcher } from './server-switcher';
import { selectGuild } from './actions';

const links = [
  { path: '', label: 'Vue d’ensemble', icon: House },
  { path: '/trips', label: 'Voyages', icon: MapPinned },
  { path: '/discover', label: 'Découvrir', icon: Compass },
];
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
  function navigation(mobile: boolean) {
    return links.map(({ path, label, icon: Icon }) => {
      const href = `${base}${path}`;
      const active =
        path === ''
          ? pathname === base
          : pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (path === '/discover' && pathname.startsWith(`${base}/fiches/`));
      return (
        <Link
          key={path}
          href={href}
          className={mobile ? 'app-mobile-link' : 'app-nav-link'}
          aria-current={active ? 'page' : undefined}
        >
          {mobile && <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />}
          <span>{label}</span>
        </Link>
      );
    });
  }
  return (
    <AppHeader
      viewer={viewer}
      guildId={guild.id}
      context={
        <ServerSwitcher
          key={guild.id}
          guild={guild}
          guilds={guilds}
          favorite={favorite}
          action={action}
          pending={pending}
        />
      }
      navigation={navigation(false)}
      mobileNavigation={
        <nav aria-label="Navigation mobile de l’espace" className="app-mobile-navigation">
          {navigation(true)}
        </nav>
      }
      feedback={
        state.error && (
          <p role="alert" className="app-header-error">
            {state.error}
          </p>
        )
      }
    />
  );
}
