import Image from 'next/image';
import { guildInitials } from '@nagi/shared';
export function GuildAvatar({
  guild,
  large = false,
}: {
  guild: { name: string; icon_url: string | null };
  large?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={
        large
          ? 'guild-bubble'
          : 'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-extrabold text-primary-ink'
      }
    >
      {guild.icon_url ? (
        <Image
          src={guild.icon_url}
          alt=""
          width={large ? 144 : 40}
          height={large ? 144 : 40}
          className="size-full object-cover"
          unoptimized
        />
      ) : (
        guildInitials(guild.name)
      )}
    </span>
  );
}
