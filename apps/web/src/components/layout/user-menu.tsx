'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
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
}: {
  viewer: { display_name: string; avatar_url: string | null; role: Role };
}) {
  const avatar = viewer.avatar_url?.startsWith('https://') ? viewer.avatar_url : null;
  return (
    <>
      <form id="nagi-sign-out" action={signOut} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto gap-2.5 px-2 py-1.5"
            aria-label="Ouvrir le menu utilisateur"
          >
            <span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-accent text-xs text-primary-ink">
              {avatar ? (
                <Image src={avatar} alt="" width={32} height={32} unoptimized />
              ) : (
                viewer.display_name.slice(0, 1).toUpperCase()
              )}
            </span>
            <span className="hidden max-w-32 truncate text-xs text-foreground sm:block">
              {viewer.display_name}
            </span>
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <div className="px-3 py-3">
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
            <Link href="/app/profile">
              <UserRound className="size-4" />
              Mon profil
            </Link>
          </DropdownMenuItem>
          {isAdmin(viewer.role) && (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <LayoutDashboard className="size-4" />
                Administration
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
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
