'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { cn } from '@nagi/ui';
import { isPrivateImage, privateImageLoader } from './private-loader';
import { imageSourceUrl } from '@nagi/shared';

export function EntryImage({
  src,
  alt = '',
  className,
  sizes = '(max-width: 640px) 100vw, 420px',
  eager = false,
  fit = 'cover',
  fallback,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  sizes?: string;
  eager?: boolean;
  fit?: 'cover' | 'contain';
  fallback?: ReactNode;
}) {
  src = imageSourceUrl(src);
  return (
    <div
      className={cn(
        'relative isolate grid place-items-center overflow-hidden bg-gradient-to-br from-accent to-muted',
        className,
      )}
    >
      {src ? (
        <Image
          draggable={false}
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          loader={isPrivateImage(src) ? privateImageLoader : undefined}
          unoptimized={!isPrivateImage(src)}
          loading={eager ? 'eager' : 'lazy'}
          className={fit === 'contain' ? 'object-contain' : 'object-cover'}
        />
      ) : (
        (fallback ?? (
          <ImageIcon aria-hidden="true" className="size-1/4 max-w-14 text-primary-ink opacity-45" />
        ))
      )}
    </div>
  );
}
