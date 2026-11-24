'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Building2, Globe2, MapPin } from 'lucide-react';
import { cn } from '@nagi/ui';
import type { DestinationKind } from '@nagi/shared';
import { isPrivateImage, privateImageLoader } from '@/features/media/private-loader';
import { PlaceImage } from '@/features/integrations/mapbox/place-image';

const icons = { countries: Globe2, cities: Building2, neighborhoods: MapPin };

export function DestinationCover({
  src,
  kind,
  className,
  iconClassName,
  eager = false,
  id,
}: {
  src?: string | null;
  kind: DestinationKind;
  className?: string;
  iconClassName?: string;
  eager?: boolean;
  id?: string;
}) {
  const [failed, setFailed] = useState<string>();
  const Icon = icons[kind];
  if (id && !src?.startsWith('blob:'))
    return (
      <PlaceImage
        src={src}
        eager={eager}
        photoReference={{
          source: 'nagi',
          id,
          kind: ({ countries: 'country', cities: 'city', neighborhoods: 'neighborhood' } as const)[
            kind
          ],
        }}
        className={className}
        fallback={
          <Icon className={cn('size-6 text-primary-ink/65', iconClassName)} strokeWidth={1.25} />
        }
      />
    );
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative grid place-items-center overflow-hidden bg-linear-to-br from-accent to-muted text-primary-ink/65',
        className,
      )}
    >
      {src && src !== failed ? (
        <Image
          src={src}
          fill
          alt=""
          loader={isPrivateImage(src) ? privateImageLoader : undefined}
          unoptimized={!isPrivateImage(src)}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 420px"
          loading={eager ? 'eager' : 'lazy'}
          className="object-cover"
          onError={() => setFailed(src)}
        />
      ) : (
        <Icon className={cn('size-6', iconClassName)} strokeWidth={1.25} />
      )}
    </div>
  );
}
