import type { DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
import type { EntryCardRow, TripPlan } from '@nagi/database';
import { tripEditSchema, type TripEdit, type TripPlaceReference } from '@nagi/shared';
import {
  calendarMinuteHeight,
  calendarSnapMinutes,
  type TimedCalendarSchedule,
} from './calendar-model';
import { minuteTime } from './planner-model';
import { isActivityDrop, isStopDrop } from './planner-dnd';

export type CatalogEntry = EntryCardRow & { suggested_duration_minutes?: number | null };
// Creation sources carry reference data; existing visits carry occurrence IDs.
// Additional providers can resolve to this same placement contract later.
export type CatalogDragData = {
  type: 'catalog-entry';
  provider: 'nagi' | 'mapbox' | 'custom';
  reference?: TripPlaceReference;
  onCommit?: () => void | TripPlaceReference | Promise<void | TripPlaceReference>;
  entry: CatalogEntry;
  defaultDuration: number;
};
export type CalendarDrop = {
  type: 'calendar';
  day: string;
  zone?: 'timed' | 'unscheduled' | 'overview';
  before?: string | null;
};
export type CatalogPlacement = {
  day: string | null;
  parent?: string;
  before?: string | null;
  time?: string;
  duration?: number | null;
};
export const catalogHintKey = 'nagi:catalog-drag-used';
export const catalogDurationKey = 'nagi:catalog-default-duration';
export function sourceVisitChange(
  place: TripPlaceReference,
  placement: CatalogPlacement,
  id: string,
  metadata?: { notes?: string; color?: string | null },
) {
  return tripEditSchema.safeParse({
    operation: 'add_place',
    data: {
      id,
      place,
      day: placement.day,
      parent: placement.parent,
      before: placement.before ?? null,
      start_time: placement.time ?? null,
      duration:
        placement.time && placement.duration !== null
          ? Math.min(
              placement.duration ?? 30,
              1440 - Number(placement.time.slice(0, 2)) * 60 - Number(placement.time.slice(3, 5)),
            )
          : (placement.duration ?? null),
      notes: metadata?.notes ?? '',
      color: metadata?.color ?? null,
    },
  });
}
export const isCatalogDrag = (data: Record<string, unknown> | undefined): data is CatalogDragData =>
  data?.type === 'catalog-entry' && !!data.entry;
export const isCalendarDrop = (data: Record<string, unknown> | undefined): data is CalendarDrop =>
  data?.type === 'calendar' && typeof data.day === 'string';
/** Sticky headers can change after dnd-kit caches its initial rectangles. */
export function calendarDropRect(
  target: CalendarDrop,
  fallback: { top: number; left: number; right: number; bottom: number },
) {
  if (typeof document === 'undefined') return fallback;
  const zone = target.zone ?? 'timed';
  const selector = target.before
    ? `[data-calendar-item-id="${target.before}"][data-calendar-zone="${zone}"]`
    : `[data-calendar-day="${target.day}"][data-calendar-zone="${zone}"]`;
  return document.querySelector(selector)?.getBoundingClientRect() ?? fallback;
}
export function catalogDuration(entry: CatalogEntry, fallback = 30) {
  const duration = entry.suggested_duration_minutes ?? fallback;
  return Number.isInteger(duration) && duration > 0 && duration <= 1440 ? duration : 30;
}
export function dragPointer(event: Pick<DragMoveEvent, 'activatorEvent' | 'delta'>) {
  const activator = event.activatorEvent;
  const point =
    'touches' in activator
      ? ((activator as TouchEvent).touches[0] ?? (activator as TouchEvent).changedTouches[0])
      : 'clientX' in activator
        ? (activator as MouseEvent)
        : null;
  return point ? { x: point.clientX + event.delta.x, y: point.clientY + event.delta.y } : undefined;
}
export function catalogCalendarSchedule(
  data: CatalogDragData,
  event: Pick<DragEndEvent, 'over' | 'activatorEvent' | 'delta'>,
  point = dragPointer(event),
): TimedCalendarSchedule | undefined {
  if (
    !isCalendarDrop(event.over?.data.current) ||
    (event.over.data.current.zone && event.over.data.current.zone !== 'timed')
  )
    return;
  if (!point || !event.over) return;
  const raw =
    (point.y - calendarDropRect(event.over.data.current, event.over.rect).top) /
    calendarMinuteHeight;
  // Keep the dropped clock exact at the bottom too; shorten only the new visit.
  const start = Math.max(
    0,
    Math.min(1425, Math.round(raw / calendarSnapMinutes) * calendarSnapMinutes),
  );
  const duration = Math.min(catalogDuration(data.entry, data.defaultDuration), 1440 - start);
  return { day: event.over.data.current.day, start, duration, end: start + duration };
}
export function catalogPlacement(
  plan: TripPlan,
  data: CatalogDragData,
  event: Pick<DragEndEvent, 'over' | 'activatorEvent' | 'delta'>,
  point = dragPointer(event),
): CatalogPlacement | undefined {
  const target = event.over?.data.current;
  if (!target || !point || !event.over) return;
  const rect = isCalendarDrop(target) ? calendarDropRect(target, event.over.rect) : event.over.rect;
  if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom)
    return;
  if (isCalendarDrop(target)) {
    if (target.zone === 'unscheduled' || target.zone === 'overview') {
      if (!plan.days.some((day) => day.id === target.day)) return;
      if (
        target.before &&
        !plan.items.some(
          (item) =>
            item.id === target.before && item.trip_day_id === target.day && !item.start_time,
        )
      )
        return;
      return {
        day: target.day,
        before: target.before ?? null,
        duration: data.entry.suggested_duration_minutes ?? null,
      };
    }
    const schedule = catalogCalendarSchedule(data, event, point);
    if (!schedule || !plan.days.some((d) => d.id === schedule.day)) return;
    return { day: schedule.day, time: minuteTime(schedule.start), duration: schedule.duration };
  }
  // Catalogue nesting is explicit: only the stops section accepts creation.
  if (isActivityDrop(target)) {
    if (!data.reference) return;
    const parent = plan.items.find((i) => i.id === target.parent);
    return parent ? { day: parent.trip_day_id, parent: parent.id, before: null } : undefined;
  }
  if (isStopDrop(target)) {
    const parent = plan.items.find((i) => i.id === target.parent);
    if (
      !parent ||
      plan.stopsAvailable === false ||
      (target.before && !parent.stops.some((s) => s.id === target.before))
    )
      return;
    return { day: parent.trip_day_id, parent: parent.id, before: target.before };
  }
  if (!('day' in target) || !('before' in target)) return;
  const day = target.day as string | null;
  const before = target.before as string | null;
  if (day !== null && !plan.days.some((d) => d.id === day)) return;
  if (before && !plan.items.some((i) => i.id === before && i.trip_day_id === day)) return;
  return { day, before };
}
export function catalogVisitChange(
  entry: EntryCardRow,
  placement: CatalogPlacement,
  id: string,
): TripEdit {
  return placement.parent
    ? {
        operation: 'add_stop',
        data: {
          id,
          parent: placement.parent,
          entry: entry.id,
          before: placement.before ?? null,
          duration: placement.duration ?? null,
        },
      }
    : {
        operation: 'add_item',
        data: {
          id,
          entry: entry.id,
          day: placement.day,
          before: placement.before ?? null,
          start_time: placement.time ?? null,
          duration: placement.duration ?? null,
        },
      };
}
