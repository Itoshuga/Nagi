'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, LayoutDashboard, LogOut, Settings2, UserRound } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nagi/ui';
import { isAdmin } from '@nagi/permissions';
import type { Role } from '@nagi/shared';
import { signOut } from '@/features/auth/actions';
export function UserMenu({
  viewer,
  variant = 'default',
  guildId,
}: {
  viewer: { display_name: string; avatar_url: string | null; role: Role };
  variant?: 'default' | 'app';
  guildId?: string;
}) {
  const app = variant === 'app';
  const avatar = viewer.avatar_url?.startsWith('https://') ? viewer.avatar_url : null;
  return (
    <>
      <form id="nagi-sign-out" action={signOut} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={app ? 'app-account-trigger' : 'h-auto gap-2.5 px-2 py-1.5'}
            aria-label="Ouvrir le menu utilisateur"
          >
            <span className="app-account-avatar flex size-8 items-center justify-center overflow-hidden rounded-full bg-accent text-xs text-primary-ink">
              {avatar ? (
                <Image
                  src={avatar}
                  alt=""
                  width={32}
                  height={32}
                  className={app ? 'size-full object-cover' : undefined}
                  unoptimized
                />
              ) : (
                viewer.display_name.slice(0, 1).toUpperCase()
              )}
            </span>
            <span
              className={
                app
                  ? 'app-account-name'
                  : 'hidden max-w-32 truncate text-xs text-foreground sm:block'
              }
            >
              {viewer.display_name}
            </span>
            <ChevronDown
              className={app ? 'app-menu-chevron size-3' : 'size-3'}
              aria-hidden="true"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className={app ? 'app-menu app-user-menu' : undefined}>
          <div className={app ? 'app-menu-heading' : 'px-3 py-3'}>
            <p className="max-w-52 truncate text-sm font-medium">{viewer.display_name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {viewer.role === 'owner'
                ? 'Propriétaire'
                : viewer.role === 'admin'
                  ? 'Administrateur'
                  : 'Explorateur'}
            </p>
          </div>
          <DropdownMenuItem asChild>
            <Link
              href={
                app && guildId
                  ? `/app/profile?guild=${encodeURIComponent(guildId)}`
                  : '/app/profile'
              }
            >
              <UserRound className="size-4" />
              {app ? 'Mon compte' : 'Mon profil'}
            </Link>
          </DropdownMenuItem>
          {app && guildId && (
            <DropdownMenuItem asChild>
              <Link href={`/app/${guildId}/settings`}>
                <Settings2 className="size-4" />
                Paramètres<span className="ml-auto text-[10px] text-muted-foreground">Espace</span>
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin(viewer.role) && (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <LayoutDashboard className="size-4" />
                Administration
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className={app ? 'app-menu-sign-out' : undefined}
            asChild
            onSelect={(event) => event.preventDefault()}
          >
            <button
              form="nagi-sign-out"
              className="flex w-full items-center gap-2 text-left"
              type="submit"
            >
              <LogOut className="size-4" />
              Se déconnecter
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
