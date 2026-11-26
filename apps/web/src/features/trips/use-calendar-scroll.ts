'use client';
import { useEffect, type RefObject } from 'react';

/** The sticky strip is not part of the visible time grid's upper scroll edge. */
export function useCalendarScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  pointerRef: RefObject<{ x: number; y: number } | undefined>,
  active: boolean,
  surface: string,
) {
  useEffect(() => {
    const element = scrollRef.current;
    const header = element?.querySelector<HTMLElement>('.trip-calendar-head');
    if (!element || !header) return;
    const update = () => {
      element.style.scrollPaddingTop = `${header.offsetHeight + 8}px`;
    };
    const observer = new ResizeObserver(update);
    observer.observe(header);
    update();
    return () => observer.disconnect();
  }, [scrollRef, surface]);
  useEffect(() => {
    const element = scrollRef.current;
    if (!active || !element || !pointerRef.current) return;
    const header = element.querySelector<HTMLElement>('.trip-calendar-head');
    let frame = 0,
      previous = performance.now(),
      edgeSince = 0,
      direction = '';
    function tick(now: number) {
      const point = pointerRef.current;
      const factor = Math.min(32, now - previous) / (1000 / 60);
      previous = now;
      if (point) {
        const rect = element!.getBoundingClientRect();
        if (
          point.x >= rect.left &&
          point.x <= rect.right &&
          point.y >= rect.top &&
          point.y <= rect.bottom
        ) {
          const top = Math.max(rect.top, header?.getBoundingClientRect().bottom ?? rect.top);
          const edgeY = Math.min(44, Math.max(0, rect.bottom - top) / 3);
          const edgeX = Math.min(44, rect.width / 4);
          const near = (value: number, start: number, end: number, edge: number) =>
            edge <= 0
              ? 0
              : value < start + edge
                ? -(start + edge - value) / edge
                : value > end - edge
                  ? (value - end + edge) / edge
                  : 0;
          const y = point.y < top ? 0 : near(point.y, top, rect.bottom, edgeY) * 6 * factor;
          const x = near(point.x, rect.left, rect.right, edgeX) * 6 * factor;
          const nextDirection = `${Math.sign(x)}:${Math.sign(y)}`;
          if (nextDirection !== direction) {
            direction = nextDirection;
            edgeSince = now;
          }
          // Crossing the sticky header's edge is not an intent to scroll.
          if ((x || y) && now - edgeSince >= 160) element!.scrollBy(x, y);
        } else {
          direction = '';
          edgeSince = now;
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scrollRef, pointerRef, active, surface]);
}
