'use client';

import type { MouseEvent, TouchEvent } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { TripDragData } from './planner-dnd';

// Keep quick clicks and native controls intact. Sensors distinguish a drag;
// the handle retains keyboard activation without hijacking Space on detail buttons.
export function useTripCardDrag(id: string, data: TripDragData, disabled: boolean) {
  const drag = useDraggable({ id, data, disabled });
  const allowed = (event: MouseEvent | TouchEvent) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return false;
    if (
      event.nativeEvent
        .composedPath()
        .some((node) => node instanceof Element && node.matches('gmp-place-link'))
    )
      return false;
    if (
      event.target.closest(
        'input,textarea,select,a,[contenteditable="true"],[role="dialog"],[role="menu"],[role="menuitem"]',
      )
    )
      return false;
    const button = event.target.closest('button');
    return !button || button.matches('.trip-step-main');
  };
  return {
    ...drag,
    cardListeners: {
      onMouseDown: (event: MouseEvent) => {
        if (allowed(event)) drag.listeners?.onMouseDown?.(event);
      },
      onTouchStart: (event: TouchEvent) => {
        if (allowed(event)) drag.listeners?.onTouchStart?.(event);
      },
      onDragStartCapture: (event: React.DragEvent) => event.preventDefault(),
    },
  };
}
