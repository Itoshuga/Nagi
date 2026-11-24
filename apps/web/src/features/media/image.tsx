'use client';

import Image from 'next/image';
import { useState, type ReactNode, type Ref } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { cn } from '@nagi/ui';
import { isPrivateImage, privateImageLoader } from './private-loader';
import { imageSourceUrl } from '@nagi/shared';

export function EntryImage({
  src,
  fallbackSrc,
  alt = '',
  className,
  sizes = '(max-width: 640px) 100vw, 420px',
  eager = false,
  fit = 'cover',
  fallback,
  children,
  containerRef,
  onError,
}: {
  src?: string | null;
  fallbackSrc?: string | null;
  alt?: string;
  className?: string;
  sizes?: string;
  eager?: boolean;
  fit?: 'cover' | 'contain';
  fallback?: ReactNode;
  children?: ReactNode;
  containerRef?: Ref<HTMLDivElement>;
  onError?: () => void;
}) {
  const safeSource = imageSourceUrl(src);
  const fallbackSource = imageSourceUrl(fallbackSrc);
  const safeFallback = fallbackSource !== safeSource ? fallbackSource : undefined;
  const [failed, setFailed] = useState<string>();
  const [failedFallback, setFailedFallback] = useState<string>();
  const visible =
    safeSource && failed !== safeSource
      ? safeSource
      : safeFallback && failedFallback !== safeFallback
        ? safeFallback
        : undefined;
  return (
    <div
      ref={containerRef}
      className={cn(
        'relative isolate grid place-items-center overflow-hidden bg-gradient-to-br from-accent to-muted',
        className,
      )}
    >
      {visible ? (
        <Image
          draggable={false}
          src={visible}
          alt={alt}
          fill
          sizes={sizes}
          loader={isPrivateImage(visible) ? privateImageLoader : undefined}
          unoptimized={!isPrivateImage(visible)}
          loading={eager ? 'eager' : 'lazy'}
          className={fit === 'contain' ? 'object-contain' : 'object-cover'}
          onError={() => {
            if (visible === safeSource) setFailed(visible);
            else setFailedFallback(visible);
            if (!safeFallback || safeFallback === visible || safeFallback === failedFallback)
              onError?.();
          }}
        />
      ) : (
        (fallback ?? (
          <ImageIcon aria-hidden="true" className="size-1/4 max-w-14 text-primary-ink opacity-45" />
        ))
      )}
      {children}
    </div>
  );
}
