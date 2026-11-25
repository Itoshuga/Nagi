'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { DragOverlay, useDndContext, type Modifier } from '@dnd-kit/core';
import type { TripPlanItem, TripPlanStop } from '@nagi/database';
import { isCatalogDrag, type CatalogEntry } from './catalog-drag';
import { Copy } from 'lucide-react';
import { PlaceImage } from '@/features/integrations/mapbox/place-image';
import { useResolvedImage } from '@/features/images/components';
import { isTemporaryImage, type ImageReference } from '@/features/images/model';
import { usePlacePresentation } from '@/features/integrations/mapbox/components';

// The preview is narrower than the source row. Keep its centre on the pointer,
// regardless of where the user originally grabbed the card.
const followPointer: Modifier = ({
  activatorEvent,
  activeNodeRect,
  overlayNodeRect,
  transform,
  windowRect,
}) => {
  if (!activatorEvent || !activeNodeRect || !overlayNodeRect) return transform;
  const point =
    'touches' in activatorEvent
      ? ((activatorEvent as TouchEvent).touches[0] ??
        (activatorEvent as TouchEvent).changedTouches[0])
      : 'clientX' in activatorEvent
        ? (activatorEvent as MouseEvent)
        : null;
  if (!point) return transform;
  const left = point.clientX + transform.x - overlayNodeRect.width / 2;
  const top = point.clientY + transform.y - overlayNodeRect.height / 2;
  return {
    ...transform,
    x:
      (windowRect
        ? Math.max(windowRect.left, Math.min(left, windowRect.right - overlayNodeRect.width))
        : left) - activeNodeRect.left,
    y:
      (windowRect
        ? Math.max(windowRect.top, Math.min(top, windowRect.bottom - overlayNodeRect.height))
        : top) - activeNodeRect.top,
  };
};
const modifiers = [followPointer];
const subscribe = () => () => {};
const clientContainer = () => document.body;
const serverContainer = () => null;

export function TripDragOverlay({
  item,
  entry,
  reduced,
}: {
  item?: TripPlanItem | TripPlanStop;
  entry?: CatalogEntry;
  reduced: boolean | null;
}) {
  const { title, imageUrl, category } = usePlacePresentation(item, entry ?? item?.entry);
  const { active } = useDndContext();
  const reference = isCatalogDrag(active?.data.current) ? active.data.current.reference : undefined;
  const photoReference: ImageReference | undefined = item
    ? {
        source: item.source ?? 'nagi',
        id:
          item.source === 'mapbox'
            ? item.external_place_id!
            : item.source === 'custom'
              ? item.id
              : item.entry_id!,
        visit: item.id,
      }
    : reference?.source === 'mapbox'
      ? { source: 'mapbox', id: reference.placeId }
      : entry
        ? { source: 'nagi', id: entry.id }
        : undefined;
  // Subscribe to an already-resolved cover without observing or loading it.
  const cached = useResolvedImage(photoReference).result;
  const image = cached?.selected;
  const src =
    cached?.coverHidden || cached?.mode === 'fallback'
      ? undefined
      : (image?.smallThumbnailUrl ?? image?.thumbnailUrl ?? imageUrl);
  const container = useSyncExternalStore<HTMLElement | null>(
    subscribe,
    clientContainer,
    serverContainer,
  );
  if (!container) return null;
  return createPortal(
    <DragOverlay
      modifiers={modifiers}
      style={{ width: 'max-content', height: 'auto', pointerEvents: 'none' }}
      dropAnimation={reduced ? null : { duration: 150, easing: 'ease-out' }}
    >
      {(item || entry) && (
        <div className="trip-drag-preview">
          <PlaceImage
            src={src}
            fit={image && isTemporaryImage(image) && !image.cropAllowed ? 'contain' : 'cover'}
            source={item?.source}
            category={category}
            className="size-10 shrink-0 rounded-lg"
            sizes="40px"
          />
          <span>{title}</span>
          {entry && <Copy className="size-3 shrink-0" aria-label="Nouvelle visite" />}
        </div>
      )}
    </DragOverlay>,
    container,
  );
}
