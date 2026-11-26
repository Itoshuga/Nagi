import type { TripPlanItem } from '@nagi/database';
import { itemDuration, minuteTime, timeMinutes } from './planner-model';
import type { CalendarDrop } from './catalog-drag';
import type { TripEdit } from '@nagi/shared';
import { defaultKeyboardCoordinateGetter, type KeyboardCoordinateGetter } from '@dnd-kit/core';

export const calendarHourHeight = 56;
export const calendarMinuteHeight = calendarHourHeight / 60;
export const calendarSnapMinutes = 15;
export const calendarKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const target = args.context.over?.data.current;
  if (
    args.context.active?.data.current?.type !== 'calendar-item' ||
    target?.type !== 'calendar' ||
    (target.zone && target.zone !== 'timed')
  )
    return defaultKeyboardCoordinateGetter(event, args);
  const { x, y } = args.currentCoordinates;
  if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
    event.preventDefault();
    return {
      x,
      y: y + (event.code === 'ArrowDown' ? 1 : -1) * calendarSnapMinutes * calendarMinuteHeight,
    };
  }
  if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
    event.preventDefault();
    return {
      x: x + (event.code === 'ArrowRight' ? 1 : -1) * (args.context.over?.rect.width ?? 112),
      y,
    };
  }
  return defaultKeyboardCoordinateGetter(event, args);
};
export type CalendarSchedule = {
  day: string | null;
  start: number | null;
  duration: number | null;
  end: number | null;
};
export type TimedCalendarSchedule = CalendarSchedule & { start: number };
export type CalendarDestination = CalendarSchedule & {
  zone: 'timed' | 'unscheduled' | 'overview';
  before: string | null;
};
const snap = (minutes: number) => Math.round(minutes / calendarSnapMinutes) * calendarSnapMinutes;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function movedCalendarSchedule(
  item: TripPlanItem,
  day: string,
  deltaMinutes: number,
): TimedCalendarSchedule {
  return positionedCalendarSchedule(item, day, timeMinutes(item.start_time!) + deltaMinutes);
}
export function positionedCalendarSchedule(
  item: TripPlanItem,
  day: string,
  minute: number,
  preserveClock = false,
): TimedCalendarSchedule {
  const duration = itemDuration(item);
  const limit = 1440 - (duration ?? 1);
  const latest = preserveClock
    ? limit
    : Math.floor(limit / calendarSnapMinutes) * calendarSnapMinutes;
  const start = clamp(preserveClock ? minute : snap(minute), 0, latest);
  return { day, start, duration, end: duration == null ? null : start + duration };
}
export function resizedCalendarSchedule(
  item: TripPlanItem,
  edge: 'start' | 'end',
  deltaMinutes: number,
): TimedCalendarSchedule {
  const initialStart = timeMinutes(item.start_time!);
  const initialDuration = Math.min(itemDuration(item) ?? 30, 1440 - initialStart);
  const initialEnd = initialStart + initialDuration;
  const minimum = Math.min(15, initialDuration);
  const start =
    edge === 'start'
      ? clamp(snap(initialStart + deltaMinutes), 0, initialEnd - minimum)
      : initialStart;
  const end =
    edge === 'end'
      ? clamp(snap(initialEnd + deltaMinutes), initialStart + minimum, 1440)
      : initialEnd;
  return { day: item.trip_day_id, start, end, duration: end - start };
}
export function calendarScheduleFields(schedule: CalendarSchedule) {
  return {
    day: schedule.day,
    start_time: schedule.start == null ? null : minuteTime(schedule.start),
    end_time: schedule.end == null || schedule.end === 1440 ? null : minuteTime(schedule.end),
    duration: schedule.duration,
  };
}
export function calendarScheduleLabel(schedule: CalendarSchedule) {
  if (schedule.start == null) return 'Sans horaire';
  return `${minuteTime(schedule.start)}${schedule.end == null ? '' : ` – ${schedule.end === 1440 ? '24:00' : minuteTime(schedule.end)}`}`;
}
export function unchangedCalendarSchedule(item: TripPlanItem, schedule: CalendarSchedule) {
  return (
    item.trip_day_id === schedule.day &&
    (item.start_time ? timeMinutes(item.start_time) : null) === schedule.start &&
    itemDuration(item) === schedule.duration
  );
}

/** Existing occurrences keep their identity and business duration in every view. */
export function calendarItemDestination(
  item: TripPlanItem,
  target: CalendarDrop,
  minute?: number,
  preserveClock = false,
): CalendarDestination | undefined {
  const zone = target.zone ?? 'timed';
  if (zone === 'timed') {
    if (minute == null || !Number.isFinite(minute)) return;
    return {
      ...positionedCalendarSchedule(item, target.day, minute, preserveClock),
      zone,
      before: null,
    };
  }
  const start = zone === 'overview' && item.start_time ? timeMinutes(item.start_time) : null;
  const duration = itemDuration(item);
  return {
    zone,
    day: target.day,
    start,
    duration,
    end: start == null || duration == null ? null : start + duration,
    before: zone === 'unscheduled' && !item.start_time ? (target.before ?? null) : null,
  };
}

export function calendarMoveChange(
  item: TripPlanItem,
  next: CalendarDestination,
): TripEdit | undefined {
  if (next.zone === 'overview' || (next.zone === 'unscheduled' && !item.start_time)) {
    if (next.before === item.id || (next.zone === 'overview' && next.day === item.trip_day_id))
      return;
    return { operation: 'move_item', data: { id: item.id, day: next.day, before: next.before } };
  }
  if (unchangedCalendarSchedule(item, next)) return;
  return {
    operation: 'schedule_item',
    data: { id: item.id, item_version: item.version, ...calendarScheduleFields(next) },
  };
}
