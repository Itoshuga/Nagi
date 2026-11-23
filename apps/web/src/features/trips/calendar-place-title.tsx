'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin } from 'lucide-react';
import type { TripPlanItem } from '@nagi/database';
import { GooglePlaceView } from '@/features/integrations/google-places/components';
import { calendarGoogleTitleHeight, calendarGoogleTitleWidth } from './calendar-presentation';

/** Keep real event geometry. Only genuinely small blocks use a floating card;
 * ordinary week columns show the official name and attribution inline. */
export function CalendarPlaceTitle({
  item,
  availableHeight,
  availableWidth,
}: {
  item: TripPlanItem;
  availableHeight?: number;
  availableWidth?: number;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [minimumHeight, setMinimumHeight] = useState(calendarGoogleTitleHeight);
  const constrained = availableHeight !== undefined;
  const floating =
    constrained &&
    (availableHeight < minimumHeight || (availableWidth ?? Infinity) < calendarGoogleTitleWidth);
  const [visible, setVisible] = useState(false),
    [position, setPosition] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const popup = useRef<HTMLDivElement>(null),
    closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const google = item.source === 'google' && item.google_place_id;
  useEffect(() => {
    const node = anchor.current?.querySelector('.trip-google-place');
    if (!google || !node || floating || !constrained) return;
    // Official layouts can vary with fonts or provider content. Move a card
    // that cannot fit into the popover instead of clipping its attribution.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setMinimumHeight(Math.max(calendarGoogleTitleHeight, entry.contentRect.height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [google, floating, constrained]);
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
  const popupOpen = position !== null;
  useEffect(() => {
    if (!popupOpen) return;
    const close = () => setPosition(null);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [popupOpen]);
  if (!google) return <strong>{item.entry?.title ?? 'Fiche indisponible'}</strong>;
  return (
    <span
      ref={anchor}
      className={floating ? 'trip-google-calendar-anchor' : 'trip-google-calendar-inline'}
    >
      {floating ? (
        <>
          <MapPin className="size-3" aria-hidden="true" />
          <span>{item.notes?.split('\n')[0] || 'Voir le lieu'}</span>
        </>
      ) : (
        <GooglePlaceView placeId={google} occurrence={item.id} appearance="label" />
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
            <GooglePlaceView placeId={google} occurrence={item.id} appearance="label" eager />
          </div>,
          document.body,
        )}
    </span>
  );
}
