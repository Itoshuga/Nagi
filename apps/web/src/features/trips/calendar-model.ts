import type { TripPlanItem } from '@nagi/database';
import { itemDuration, minuteTime, timeMinutes } from './planner-model';

export const calendarHourHeight = 56;
export const calendarMinuteHeight = calendarHourHeight / 60;
export const calendarSnapMinutes = 15;
export type CalendarSchedule = {
  day: string | null;
  start: number;
  duration: number | null;
  end: number | null;
};
const snap = (minutes: number) => Math.round(minutes / calendarSnapMinutes) * calendarSnapMinutes;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function movedCalendarSchedule(
  item: TripPlanItem,
  day: string,
  deltaMinutes: number,
): CalendarSchedule {
  const duration = itemDuration(item);
  const latest = Math.floor((1440 - (duration ?? 1)) / calendarSnapMinutes) * calendarSnapMinutes;
  const start = clamp(snap(timeMinutes(item.start_time!) + deltaMinutes), 0, latest);
  return { day, start, duration, end: duration == null ? null : start + duration };
}
export function resizedCalendarSchedule(
  item: TripPlanItem,
  edge: 'start' | 'end',
  deltaMinutes: number,
): CalendarSchedule {
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
    start_time: minuteTime(schedule.start),
    end_time: schedule.end == null || schedule.end === 1440 ? null : minuteTime(schedule.end),
    duration: schedule.duration,
  };
}
export function calendarScheduleLabel(schedule: CalendarSchedule) {
  return `${minuteTime(schedule.start)}${schedule.end == null ? '' : ` – ${schedule.end === 1440 ? '24:00' : minuteTime(schedule.end)}`}`;
}
export function unchangedCalendarSchedule(item: TripPlanItem, schedule: CalendarSchedule) {
  return (
    item.trip_day_id === schedule.day &&
    timeMinutes(item.start_time!) === schedule.start &&
    itemDuration(item) === schedule.duration
  );
}
