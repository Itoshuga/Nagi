import Image from 'next/image';
import Link from 'next/link';
import { profileHref } from '@nagi/shared';
import type { ProfileIdentity } from '@nagi/database';
import { cn } from '@nagi/ui';

export function UserIdentity({
  user,
  compact = false,
  className,
}: {
  user: ProfileIdentity;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      prefetch={false}
      href={profileHref(user.username)}
      aria-label={`Voir le profil de ${user.display_name}`}
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded-lg text-sm font-medium hover:text-primary-ink focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
    >
      <span
        className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs"
        aria-hidden="true"
      >
        {user.avatar_url ? (
          <Image
            src={user.avatar_url}
            alt=""
            width={28}
            height={28}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          user.display_name.slice(0, 1)
        )}
      </span>
      <span className="truncate">
        {user.display_name}
        {!compact && (
          <span className="ml-1.5 font-normal text-muted-foreground">@{user.username}</span>
        )}
      </span>
    </Link>
  );
}
