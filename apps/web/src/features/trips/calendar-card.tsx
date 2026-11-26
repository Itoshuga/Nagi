'use client';
import { memo, useRef, type MouseEvent, type TouchEvent } from 'react';
import { useDraggable, useDroppable, useDndMonitor } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { cn } from '@nagi/ui';
import { calendarEventColor, formatTripDuration } from '@nagi/shared';
import type { TripPlanItem } from '@nagi/database';
import { usePlacePresentation } from '@/features/integrations/mapbox/components';
import { CalendarPlaceTitle } from './calendar-place-title';
import { calendarColorStyle } from './calendar-color-style';
import { useCalendarColors } from './calendar-colors';
import { itemDuration, type WorkspaceViewProps } from './planner-model';

export function useCalendarCardDrag(
  item: TripPlanItem,
  disabled: boolean,
  zone: 'timed' | 'unscheduled' | 'overview',
) {
  const drag = useDraggable({
    id: item.id,
    data: { type: 'calendar-item', id: item.id, zone },
    disabled,
  });
  const suppressUntil = useRef(0);
  useDndMonitor({
    onDragEnd: ({ active }) => {
      if (active.id === item.id) suppressUntil.current = Date.now() + 300;
    },
    onDragCancel: ({ active }) => {
      if (active.id === item.id) suppressUntil.current = Date.now() + 300;
    },
  });
  function allowed(event: MouseEvent | TouchEvent) {
    if (disabled || event.defaultPrevented || !(event.target instanceof Element)) return false;
    const button = event.target.closest('button');
    return !button || button.matches('.trip-calendar-event-copy,.trip-calendar-compact-copy');
  }
  return {
    ...drag,
    cardListeners: {
      onMouseDown: (event: MouseEvent) => {
        if (event.button === 0 && allowed(event)) drag.listeners?.onMouseDown?.(event);
      },
      onTouchStart: (event: TouchEvent) => {
        if (allowed(event)) drag.listeners?.onTouchStart?.(event);
      },
      onClickCapture: (event: MouseEvent) => {
        if (Date.now() < suppressUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onDragStartCapture: (event: React.DragEvent) => event.preventDefault(),
    },
  };
}

export const CalendarCompactEvent = memo(function CalendarCompactEvent({
  item,
  props,
  zone,
  insertion,
}: {
  item: TripPlanItem;
  props: WorkspaceViewProps;
  zone: 'unscheduled' | 'overview';
  insertion?: boolean;
}) {
  const drag = useCalendarCardDrag(item, !props.canEdit || props.busy, zone);
  const drop = useDroppable({
    id: `calendar-before:${item.id}`,
    data: { type: 'calendar', zone, day: item.trip_day_id, before: item.id },
    disabled: !props.canEdit || props.busy || zone !== 'unscheduled',
  });
  const display = usePlacePresentation(item, item.entry),
    colors = useCalendarColors();
  const copy = useRef<HTMLButtonElement>(null),
    duration = itemDuration(item);
  const information = [
    item.start_time?.slice(0, 5),
    duration == null ? 'Durée libre' : formatTripDuration(duration),
    item.stops.length ? `${item.stops.length} arrêt${item.stops.length > 1 ? 's' : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={cn(
        'trip-calendar-compact-event',
        drag.isDragging && 'is-dragging',
        props.canEdit && 'can-drag',
        props.selectedItem === item.id && !props.selectedStop && 'is-selected',
        insertion && 'is-insertion',
      )}
      data-calendar-item-id={item.id}
      data-calendar-zone={zone}
      data-save-state={props.mutationStates?.[item.id]}
      style={calendarColorStyle(
        calendarEventColor(item.calendar_color, item.entry?.category?.color),
      )}
      {...drag.cardListeners}
      onContextMenu={(event) => {
        if (props.canEdit && !drag.isDragging) {
          event.preventDefault();
          colors?.open(item, { x: event.clientX, y: event.clientY }, copy.current);
        }
      }}
    >
      <button
        ref={copy}
        type="button"
        className="trip-calendar-compact-copy"
        onClick={() => props.onDetails(item)}
        aria-pressed={props.selectedItem === item.id && !props.selectedStop}
        title={`${display.title} · ${information}`}
        onKeyDown={(event) => {
          if (
            props.canEdit &&
            (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
          ) {
            event.preventDefault();
            colors?.open(item, undefined, event.currentTarget);
          }
        }}
      >
        <CalendarPlaceTitle item={item} />
        <small>{information}</small>
      </button>
      {props.canEdit && (
        <button
          type="button"
          className="trip-calendar-drag-handle"
          aria-label={`Déplacer ${display.title}`}
          title="Déplacer · Espace puis les flèches"
          {...drag.attributes}
          {...drag.listeners}
          disabled={props.busy}
        >
          <GripVertical aria-hidden="true" className="size-3" />
        </button>
      )}
    </div>
  );
});
