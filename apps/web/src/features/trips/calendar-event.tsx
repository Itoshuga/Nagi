'use client';

import { calendarColorStyle } from './calendar-color-style';
import {
  memo,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
  type CSSProperties,
} from 'react';
import { GripVertical } from 'lucide-react';
import { useCalendarCardDrag } from './calendar-card';
import { cn } from '@nagi/ui';
import type { TripPlanItem } from '@nagi/database';
import { calendarEventColor, formatTripDuration, tripStopCount } from '@nagi/shared';
import {
  activityBudget,
  itemDuration,
  timeMinutes,
  type WorkspaceViewProps,
} from './planner-model';
import {
  calendarMinuteHeight,
  calendarScheduleFields,
  calendarScheduleLabel,
  resizedCalendarSchedule,
  unchangedCalendarSchedule,
  type CalendarSchedule,
  type TimedCalendarSchedule,
} from './calendar-model';
import { useCalendarColors } from './calendar-colors';
import { CalendarPlaceTitle } from './calendar-place-title';
import { calendarEventPresentation } from './calendar-presentation';
import { usePlacePresentation } from '@/features/integrations/mapbox/components';
export { CalendarPlaceTitle } from './calendar-place-title';

export const CalendarEventCopy = memo(
  function CalendarEventCopy({
    item,
    schedule,
  }: {
    item: TripPlanItem;
    schedule: CalendarSchedule;
  }) {
    const host = useRef<HTMLSpanElement>(null);
    const [size, setSize] = useState<{ height: number; width: number }>();
    useEffect(() => {
      const parent = host.current?.parentElement;
      if (!parent) return;
      const observer = new ResizeObserver(([entry]) => {
        if (!entry) return;
        const { height, width } = entry.contentRect;
        setSize((old) => (old?.height === height && old.width === width ? old : { height, width }));
      });
      observer.observe(parent);
      return () => observer.disconnect();
    }, []);
    const height = Math.min(
      size?.height ?? Infinity,
      (schedule.duration ?? 30) * calendarMinuteHeight - ((schedule.duration ?? 30) <= 30 ? 0 : 12),
    );
    const display = usePlacePresentation(item, item.entry);
    const presentation = calendarEventPresentation(height);
    const information = [
      display.category,
      item.stops?.length ? tripStopCount(item.stops.length) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const details = presentation.details && !!information;
    return (
      <span ref={host} className="trip-calendar-event-content">
        <CalendarPlaceTitle item={item} />
        {presentation.time && schedule.start != null && (
          <span className="trip-calendar-event-time">
            {calendarScheduleLabel(schedule)}
            {presentation.details &&
              (schedule.duration
                ? ` · ${formatTripDuration(schedule.duration)}`
                : ' · Durée libre')}
          </span>
        )}
        {details && <small className="trip-calendar-event-meta">{information}</small>}
      </span>
    );
  },
  (before, after) =>
    before.item === after.item &&
    before.schedule.day === after.schedule.day &&
    before.schedule.start === after.schedule.start &&
    before.schedule.end === after.schedule.end &&
    before.schedule.duration === after.schedule.duration,
);

type ResizeBase = {
  item: TripPlanItem;
  trip: number;
  y: number;
  scroll: number;
  edge: 'start' | 'end';
  moved: boolean;
};
export const CalendarEvent = memo(function CalendarEvent({
  item,
  props,
  lane,
  lanes,
  scroll,
}: {
  item: TripPlanItem;
  props: WorkspaceViewProps;
  lane: number;
  lanes: number;
  scroll: RefObject<HTMLDivElement | null>;
}) {
  const { setNodeRef, attributes, listeners, cardListeners, isDragging } = useCalendarCardDrag(
    item,
    !props.canEdit || props.busy,
    'timed',
  );
  const colors = useCalendarColors();
  const display = usePlacePresentation(item, item.entry);
  const copy = useRef<HTMLButtonElement>(null);
  const [resize, setResize] = useState<TimedCalendarSchedule>();
  const resizing = useRef<ResizeBase | null>(null),
    preview = useRef<CalendarSchedule | undefined>(undefined);
  const start = timeMinutes(item.start_time!),
    duration = itemDuration(item);
  const schedule = resize ?? {
    day: item.trip_day_id,
    start,
    duration,
    end: duration == null ? null : start + duration,
  };
  const visualDuration = Math.min(1440 - schedule.start, schedule.duration ?? 30);
  const compact = schedule.duration != null && schedule.duration <= 30;
  const overflow = Math.max(0, activityBudget(item).used - (schedule.duration ?? Infinity));
  const description = `${display.title} · ${calendarScheduleLabel(schedule)} · ${formatTripDuration(schedule.duration) ?? 'Durée libre'}${overflow ? ` · Les arrêts dépassent la durée prévue de ${formatTripDuration(overflow)}` : ''}`;
  const resizingActive = resize !== undefined;
  useEffect(() => {
    if (!resizingActive) return;
    function cancel(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !resizing.current) return;
      event.preventDefault();
      event.stopPropagation();
      resizing.current = null;
      preview.current = undefined;
      setResize(undefined);
    }
    document.addEventListener('keydown', cancel, true);
    return () => document.removeEventListener('keydown', cancel, true);
  }, [resizingActive]);
  async function save(next: CalendarSchedule, base: ResizeBase) {
    if (unchangedCalendarSchedule(base.item, next)) {
      setResize(undefined);
      return;
    }
    try {
      await props.mutate(
        {
          operation: 'schedule_item',
          data: { id: item.id, item_version: base.item.version, ...calendarScheduleFields(next) },
        },
        base.trip,
        { item: base.item },
      );
    } finally {
      preview.current = undefined;
      setResize(undefined);
    }
  }
  function begin(event: PointerEvent<HTMLButtonElement>) {
    const edge = event.currentTarget.dataset.resizeEdge;
    if (edge !== 'start' && edge !== 'end') return;
    if (!props.canEdit || props.busy || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizing.current = {
      item,
      trip: props.plan.version,
      y: event.clientY,
      scroll: scroll.current?.scrollTop ?? 0,
      edge,
      moved: false,
    };
    preview.current = schedule;
    setResize(schedule);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const base = resizing.current;
    if (!base) return;
    const delta = event.clientY - base.y + (scroll.current?.scrollTop ?? 0) - base.scroll;
    if (!base.moved && Math.abs(delta) < 3) return;
    base.moved = true;
    const next = resizedCalendarSchedule(base.item, base.edge, delta / calendarMinuteHeight);
    preview.current = next;
    setResize((old) => (old?.start === next.start && old.end === next.end ? old : next));
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    const base = resizing.current;
    if (!base) return;
    resizing.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!base.moved || !preview.current) {
      preview.current = undefined;
      setResize(undefined);
      return;
    }
    void save(preview.current, base);
  }
  return (
    <div
      ref={setNodeRef}
      data-calendar-item-id={item.id}
      className={cn(
        'trip-calendar-event',
        props.canEdit && !props.busy && 'can-drag',
        isDragging && 'is-dragging',
        lanes > 1 && 'has-conflict',
        compact && 'is-compact',
        resizingActive && 'is-resizing',
        props.selectedItem === item.id && !props.selectedStop && 'is-selected',
      )}
      style={
        {
          ...calendarColorStyle(
            calendarEventColor(item.calendar_color, item.entry?.category?.color),
          ),
          top: schedule.start * calendarMinuteHeight,
          height: Math.max(1, visualDuration * calendarMinuteHeight),
          left: `calc(${(lane / lanes) * 100}% + 3px)`,
          width: `calc(${100 / lanes}% - 6px)`,
        } as CSSProperties
      }
      data-save-state={props.mutationStates?.[item.id]}
      {...cardListeners}
      onContextMenu={(event) => {
        if (!props.canEdit) return;
        event.preventDefault();
        event.stopPropagation();
        if (!isDragging && !resizing.current)
          colors?.open(item, { x: event.clientX, y: event.clientY }, copy.current);
      }}
    >
      <button
        ref={copy}
        type="button"
        className="trip-calendar-event-copy"
        title={description}
        aria-label={item.source === 'mapbox' ? undefined : description}
        aria-pressed={props.selectedItem === item.id && !props.selectedStop}
        onClick={() => {
          if (!isDragging && !resizing.current) props.onDetails(item);
        }}
        onKeyDown={(event) => {
          if (
            (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) &&
            props.canEdit
          ) {
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            colors?.open(
              item,
              { x: rect.left + 12, y: rect.top + Math.min(25, rect.height) },
              event.currentTarget,
            );
          }
        }}
      >
        <CalendarEventCopy item={item} schedule={schedule} />
      </button>
      {props.canEdit && (
        <button
          type="button"
          className="trip-calendar-drag-handle"
          aria-label={`Déplacer ${display.title}`}
          title="Déplacer · Espace puis les flèches"
          {...attributes}
          {...listeners}
          disabled={props.busy}
        >
          <GripVertical aria-hidden="true" className="size-3" />
        </button>
      )}
      {props.mutationStates?.[item.id] && (
        <span className="trip-calendar-event-state" role="status">
          <span className="sr-only">
            {props.mutationStates[item.id] === 'saving'
              ? 'Enregistrement de cette étape…'
              : 'Cette étape n’a pas pu être enregistrée.'}
          </span>
        </span>
      )}
      {props.canEdit &&
        (['start', 'end'] as const).map((edge) => (
          <button
            key={edge}
            type="button"
            className={`trip-event-resize is-${edge}`}
            data-resize-edge={edge}
            disabled={props.busy}
            aria-label={`Modifier ${edge === 'start' ? 'le début' : 'la fin'} de ${item.entry?.title ?? 'l’étape'}`}
            title={`${edge === 'start' ? 'Début' : 'Fin'} · Flèches haut et bas pour ajuster de 15 min`}
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={() => {
              resizing.current = null;
              preview.current = undefined;
              setResize(undefined);
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (props.busy || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault();
              event.stopPropagation();
              const next = resizedCalendarSchedule(
                item,
                edge,
                event.key === 'ArrowDown' ? 15 : -15,
              );
              void save(next, {
                item,
                trip: props.plan.version,
                y: 0,
                scroll: 0,
                edge,
                moved: true,
              });
            }}
          />
        ))}
      {resizingActive && (
        <span className="trip-calendar-resize-time" role="status">
          {calendarScheduleLabel(schedule)}
          {overflow ? ` · Arrêts : +${formatTripDuration(overflow)}` : ''}
        </span>
      )}
    </div>
  );
});
