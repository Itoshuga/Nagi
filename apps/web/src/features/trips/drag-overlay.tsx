'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { DragOverlay, type Modifier } from '@dnd-kit/core';
import type { TripPlanItem, TripPlanStop } from '@nagi/database';
import { EntryImage } from '@/features/media/image';

// The preview is narrower than the original timeline row. Anchor its own centre
// to the initial mouse/touch position instead of retaining the row's left edge.
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
  reduced,
}: {
  item?: TripPlanItem | TripPlanStop;
  reduced: boolean | null;
}) {
  const container = useSyncExternalStore<HTMLElement | null>(
    subscribe,
    clientContainer,
    serverContainer,
  );
  if (!container) return null;
  return createPortal(
    <DragOverlay
      modifiers={modifiers}
      style={{ width: 'max-content', height: 'auto' }}
      dropAnimation={reduced ? null : { duration: 150, easing: 'ease-out' }}
    >
      {item && (
        <div className="trip-drag-preview">
          <EntryImage
            src={item.entry?.cover_image_url}
            className="size-10 shrink-0 rounded-lg"
            sizes="40px"
          />
          <span>{item.entry?.title ?? 'Étape'}</span>
        </div>
      )}
    </DragOverlay>,
    container,
  );
}
