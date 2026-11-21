'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin } from 'lucide-react';
import type { TripPlanItem } from '@nagi/database';
import { GooglePlaceView } from '@/features/integrations/google-places/components';

/** Keep real event geometry. The complete official label stays outside a short
 * block, rather than clipping Google's attribution to a fourteen-pixel row. */
export function CalendarPlaceTitle({
  item,
  availableHeight,
}: {
  item: TripPlanItem;
  availableHeight?: number;
}) {
  const anchor = useRef<HTMLSpanElement>(null),
    [floating, setFloating] = useState(availableHeight !== undefined && availableHeight < 68);
  const [visible, setVisible] = useState(false),
    [position, setPosition] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const popup = useRef<HTMLDivElement>(null),
    closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const google = item.source === 'google' && item.google_place_id;
  useEffect(() => {
    const node = anchor.current,
      parent = node?.parentElement;
    if (!google || !node || !parent || availableHeight === undefined) return;
    let active = true;
    const resize = () => {
      if (!active || node.parentElement !== parent || !parent.isConnected) return;
      setFloating(availableHeight < 68 || parent.getBoundingClientRect().width < 180);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [google, availableHeight]);
  useEffect(() => {
    const node = anchor.current;
    if (!floating || !node || !google) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(node);
    const parent = node.closest('button') ?? node;
    const show = (event: Event) => {
      if ('buttons' in event && (event as PointerEvent).buttons) return;
      clearTimeout(closing.current);
      const rect = parent.getBoundingClientRect();
      setPosition({
        left: Math.max(12, Math.min(rect.left, innerWidth - 252)),
        top: rect.top > 84 ? rect.top - 8 : rect.bottom + 8,
        below: rect.top <= 84,
      });
    };
    const hide = () => {
      closing.current = setTimeout(() => {
        if (!popup.current?.contains(document.activeElement)) setPosition(null);
      }, 120);
    };
    const down = () => setPosition(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPosition(null);
        e.stopPropagation();
      }
    };
    parent.addEventListener('pointerenter', show);
    parent.addEventListener('pointerleave', hide);
    parent.addEventListener('focus', show);
    parent.addEventListener('blur', hide);
    parent.addEventListener('pointerdown', down);
    parent.addEventListener('keydown', key);
    return () => {
      observer.disconnect();
      clearTimeout(closing.current);
      parent.removeEventListener('pointerenter', show);
      parent.removeEventListener('pointerleave', hide);
      parent.removeEventListener('focus', show);
      parent.removeEventListener('blur', hide);
      parent.removeEventListener('pointerdown', down);
      parent.removeEventListener('keydown', key);
    };
  }, [floating, google]);
  if (!google) return <strong>{item.entry?.title ?? 'Fiche indisponible'}</strong>;
  return (
    <span
      ref={anchor}
      className={floating ? 'trip-google-calendar-anchor' : 'trip-google-calendar-inline'}
    >
      {floating ? (
        <>
          <MapPin className="size-3" aria-hidden="true" />
          {item.notes && <span>{item.notes.split('\n')[0]}</span>}
        </>
      ) : (
        <GooglePlaceView placeId={google} occurrence={item.id} appearance="thumbnail" />
      )}
      {floating &&
        visible &&
        createPortal(
          <div
            ref={popup}
            className="trip-google-calendar-caption"
            style={{
              left: position?.left ?? 12,
              top: position?.top ?? 12,
              visibility: position ? 'visible' : 'hidden',
              transform: position?.below ? 'none' : 'translateY(-100%)',
            }}
            onPointerEnter={() => clearTimeout(closing.current)}
            onPointerLeave={() => setPosition(null)}
            onFocus={() => clearTimeout(closing.current)}
            onBlur={() => setPosition(null)}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <GooglePlaceView placeId={google} occurrence={item.id} appearance="thumbnail" eager />
          </div>,
          document.body,
        )}
    </span>
  );
}
