import type { TripPlanItem, TripPlannerDay } from '@nagi/database';
import type { TripEdit, TripResult } from '@nagi/shared';

export type PlanMutation = (change: TripEdit, version?: number) => Promise<TripResult>;
export type LanePosition = { day: string | null; before: string | null };

export function movedTripItems(items: TripPlanItem[], id: string, destination: LanePosition) {
  const current = items.find((item) => item.id === id);
  if (!current || destination.before === id) return items;
  const next = items.filter((item) => item.id !== id);
  const before = next.findIndex(
    (item) => item.id === destination.before && item.trip_day_id === destination.day,
  );
  const moved = { ...current, trip_day_id: destination.day };
  if (before >= 0) next.splice(before, 0, moved);
  else next.push(moved);
  return next;
}

export function stepLocation(item: TripPlanItem) {
  return [item.entry?.neighborhood?.name, item.entry?.city?.name, item.entry?.country?.name]
    .filter(Boolean)
    .join(' · ');
}

export function stepTime(item: TripPlanItem) {
  return [item.start_time?.slice(0, 5), item.end_time?.slice(0, 5)].filter(Boolean).join(' – ');
}

export function calendarDateAt(start: string, index: number) {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

export function dayRange(start: string, end: string) {
  return (
    Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1
  );
}

export function dayNumber(days: TripPlannerDay[], dayId?: string | null) {
  return days.findIndex((day) => day.id === dayId) + 1;
}
