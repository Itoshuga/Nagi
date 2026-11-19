import type { TripPlanItem, TripPlannerDay } from '@nagi/database';
import type { TripEdit, TripResult } from '@nagi/shared';
import type { TripPlan, EntryCardRow } from '@nagi/database';

export type PlanMutation = (change: TripEdit, version?: number) => Promise<TripResult>;
export type LanePosition = { day: string | null; before: string | null };
export type DaySelection = 'all' | 'pending' | string;
export type WorkspaceViewProps = {
  guild: string;
  plan: TripPlan;
  canEdit: boolean;
  busy: boolean;
  mutate: PlanMutation;
  selectedDay: DaySelection;
  selectedItem?: string;
  onDay: (day: DaySelection) => void;
  onItinerary: () => void;
  onDetails: (item: TripPlanItem) => void;
  onAdd: (day: string | null, time?: string) => void;
};
export type PlaceAdder = (
  entry: EntryCardRow,
  day: string | null,
  time?: string,
  repeat?: boolean,
) => Promise<TripResult & { id?: string }>;
export type TripDetailEntry = Omit<EntryCardRow, 'country' | 'city' | 'category'> & {
  country: EntryCardRow['country'] | null;
  city: EntryCardRow['city'] | null;
  category: EntryCardRow['category'] | null;
};
export function unavailableTripEntry(item: TripPlanItem): TripDetailEntry {
  return {
    id: item.entry_id,
    title: 'Fiche indisponible',
    slug: 'fiche-indisponible',
    summary: '',
    cover_image_url: null,
    published: false,
    updated_at: item.updated_at,
    latitude: null,
    longitude: null,
    country: null,
    city: null,
    neighborhood: null,
    category: null,
  };
}
export const visibleTripItems = (plan: Pick<TripPlan, 'days' | 'items'>, day: DaySelection) =>
  day === 'all'
    ? [
        ...plan.days.flatMap((d) => plan.items.filter((i) => i.trip_day_id === d.id)),
        ...plan.items.filter((i) => !i.trip_day_id),
      ]
    : plan.items.filter((item) => item.trip_day_id === (day === 'pending' ? null : day));
export function timeMinutes(value: string) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}
export function minuteTime(minutes: number) {
  const value = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function itemDuration(item: TripPlanItem) {
  return item.start_time && item.end_time
    ? timeMinutes(item.end_time) - timeMinutes(item.start_time)
    : item.estimated_duration_minutes;
}

export function optimisticTripItems(items: TripPlanItem[], change: TripEdit) {
  switch (change.operation) {
    case 'schedule_item': {
      const previous = items.find((item) => item.id === change.data.id);
      const updated = items.map((item) =>
        item.id === change.data.id
          ? {
              ...item,
              trip_day_id: change.data.day,
              start_time: change.data.start_time,
              end_time: change.data.end_time,
              estimated_duration_minutes: change.data.duration,
            }
          : item,
      );
      return previous && previous.trip_day_id !== change.data.day
        ? movedTripItems(updated, change.data.id, { day: change.data.day, before: null })
        : updated;
    }
    case 'sort_items': {
      const sorted = items
        .filter((i) => i.trip_day_id === change.data.day)
        .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99'));
      return [...items.filter((i) => i.trip_day_id !== change.data.day), ...sorted];
    }
    case 'move_item':
      return movedTripItems(items, change.data.id, change.data);
    case 'delete_item':
      return items.filter((item) => item.id !== change.data.id);
    case 'edit_item':
      return items.map((item) =>
        item.id === change.data.id
          ? {
              ...item,
              start_time: change.data.start_time,
              end_time: change.data.end_time,
              estimated_duration_minutes: change.data.duration,
              notes: change.data.notes,
            }
          : item,
      );
    default:
      return items;
  }
}

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

export function layoutCalendarEvents(items: TripPlanItem[]) {
  const sorted = [...items]
    .filter((i) => i.start_time)
    .sort((a, b) => a.start_time!.localeCompare(b.start_time!));
  const result: { item: TripPlanItem; lane: number; lanes: number }[] = [];
  let group: TripPlanItem[] = [],
    end = -1;
  function flush() {
    const ends: number[] = [],
      placed: { item: TripPlanItem; lane: number }[] = [];
    for (const item of group) {
      const start = timeMinutes(item.start_time!);
      let lane = ends.findIndex((e) => e <= start);
      if (lane < 0) lane = ends.length;
      ends[lane] = start + Math.max(15, itemDuration(item) ?? 0);
      placed.push({ item, lane });
    }
    result.push(...placed.map((p) => ({ ...p, lanes: ends.length })));
    group = [];
  }
  for (const item of sorted) {
    const start = timeMinutes(item.start_time!);
    if (start >= end && group.length) flush();
    group.push(item);
    end = Math.max(start + Math.max(15, itemDuration(item) ?? 0), group.length === 1 ? -1 : end);
  }
  flush();
  return result;
}
