import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { ProfileIdentity } from '@nagi/database';
import { isPrivateImage, privateImageLoader } from '@/features/media/private-loader';

export function ProfileBanner({
  src,
  x = 50,
  y = 50,
  compact = false,
}: {
  src: string | null;
  x?: number;
  y?: number;
  compact?: boolean;
}) {
  return (
    <div className={`profile-banner${compact ? ' profile-banner-preview' : ''}`}>
      {src ? (
        <Image
          src={src}
          alt="Bannière du profil"
          fill
          loader={isPrivateImage(src) ? privateImageLoader : undefined}
          unoptimized={!isPrivateImage(src)}
          loading={compact ? 'lazy' : 'eager'}
          sizes="(max-width: 640px) 100vw, 1040px"
          className="object-cover"
          style={{ objectPosition: `${x}% ${y}%` }}
        />
      ) : (
        <div className="profile-banner-art" aria-hidden="true">
          <span className="profile-banner-orbit" />
          <span className="profile-banner-word">nagi.</span>
          <span className="profile-banner-caption">Un espace à soi.</span>
        </div>
      )}
    </div>
  );
}
export function ProfileAvatar({ user, small = false }: { user: ProfileIdentity; small?: boolean }) {
  return (
    <div className={`profile-avatar${small ? ' profile-avatar-small' : ''}`}>
      {user.avatar_url ? (
        <Image
          src={user.avatar_url}
          alt={`Avatar de ${user.display_name}`}
          width={144}
          height={144}
          className="size-full object-cover"
          unoptimized
        />
      ) : (
        <span>{user.display_name.slice(0, 1)}</span>
      )}
    </div>
  );
}
export const accentStyle = (accent: string) => ({ '--profile-accent': accent }) as CSSProperties;
