'use client';
import type { ComponentProps } from 'react';
import { EntryImage } from '@/features/media/image';
import { ImageCredits, useResolvedImage } from '@/features/images/components';
import { isPreviewImage, isTemporaryImage, type ImageReference } from '@/features/images/model';
import { PlacePlaceholder } from '@/features/images/place-placeholder';
/** A licensed venue photo or a category pictogram, always visible. */
export function PlaceImage({
  source,
  category,
  photoReference,
  credits = 'summary',
  ...props
}: ComponentProps<typeof EntryImage> & {
  source?: string;
  category?: string;
  photoReference?: ImageReference;
  credits?: 'summary' | 'dialog';
}) {
  const photo = useResolvedImage(photoReference, credits === 'dialog');
  const image = photo.result?.selected;
  return (
    <EntryImage
      {...props}
      fit={image && isTemporaryImage(image) && !image.cropAllowed ? 'contain' : props.fit}
      fallbackSrc={image && isPreviewImage(image) ? image.thumbnailUrl : props.fallbackSrc}
      containerRef={photo.observe}
      src={
        photo.result?.coverHidden ||
        photo.result?.mode === 'fallback' ||
        (photo.result?.mode === 'manual' && !image)
          ? undefined
          : image
            ? credits === 'dialog'
              ? image.previewUrl
              : props.sizes && /^\d+px$/.test(props.sizes) && parseInt(props.sizes) <= 80
                ? (image.smallThumbnailUrl ?? image.thumbnailUrl)
                : image.thumbnailUrl
            : props.src
      }
      onError={() => {
        if (photoReference && image) photo.session.broken(photoReference, image.id);
        props.onError?.();
      }}
      fallback={
        props.fallback ?? (
          <PlacePlaceholder
            category={category ?? (source === 'custom' ? 'lieu personnalisé' : undefined)}
          />
        )
      }
    >
      {image && <ImageCredits image={image} interactive={credits === 'dialog'} />}
    </EntryImage>
  );
}
