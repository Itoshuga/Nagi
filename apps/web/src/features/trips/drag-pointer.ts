'use client';
import { useEffect, useRef } from 'react';

/** Mouseup/touchend can arrive before React commits the last drag-move render.
 * Read the native release position so a stale `over` never becomes a fallback. */
export function useDragPointer(active: boolean) {
  const point = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    if (!active) {
      point.current = undefined;
      return;
    }
    const mouse = (event: MouseEvent) => {
      point.current = { x: event.clientX, y: event.clientY };
    };
    const touch = (event: TouchEvent) => {
      const source = event.touches[0] ?? event.changedTouches[0];
      if (source) point.current = { x: source.clientX, y: source.clientY };
    };
    document.addEventListener('mousemove', mouse, true);
    document.addEventListener('mouseup', mouse, true);
    document.addEventListener('touchmove', touch, { capture: true, passive: true });
    document.addEventListener('touchend', touch, true);
    return () => {
      document.removeEventListener('mousemove', mouse, true);
      document.removeEventListener('mouseup', mouse, true);
      document.removeEventListener('touchmove', touch, true);
      document.removeEventListener('touchend', touch, true);
    };
  }, [active]);
  return point;
}
