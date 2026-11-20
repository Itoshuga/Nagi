import type { TripPlanItem, TripPlanStop, TripPlannerDay } from '@nagi/database';
import type { TripEdit, TripResult } from '@nagi/shared';
import type { TripPlan, EntryCardRow } from '@nagi/database';

export type TripMutationContext = {
  item?: TripPlanItem;
  stop?: TripPlanStop;
  day?: TripPlannerDay;
};
export type PlanMutation = (
  change: TripEdit,
  version?: number,
  context?: TripMutationContext,
) => Promise<TripResult>;
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
  onAddStop: (parent: string) => void;
  expandedStops?: Readonly<Record<string, boolean>>;
  onToggleStops?: (parent: string) => void;
};
export type PlaceAdder = (
  entry: EntryCardRow,
  day: string | null,
  time?: string,
  repeat?: boolean,
  parent?: string,
  placement?: { before?: string | null; duration?: number | null },
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
// Preserve explicit positions for visits without a clock. Timed visits remain
// chronological; unscheduled visits travel with their next timed neighbour.
const chronologicalTripItems = (items: TripPlanItem[]) => {
  if (items.some((i) => !Number.isFinite(i.sort_order)))
    return [...items].sort(
      (a, b) =>
        (a.start_time ? timeMinutes(a.start_time) : 1440) -
        (b.start_time ? timeMinutes(b.start_time) : 1440),
    );
  const positioned = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const groups = new Map<string | null, TripPlanItem[]>();
  let anchor: string | null = null;
  for (let i = positioned.length - 1; i >= 0; i--) {
    const item = positioned[i]!;
    if (item.start_time) anchor = item.id;
    else {
      const group = groups.get(anchor) ?? [];
      group.push(item);
      groups.set(anchor, group);
    }
  }
  for (const group of groups.values()) group.reverse();
  const timed = positioned
    .filter((i) => i.start_time)
    .sort((a, b) => timeMinutes(a.start_time!) - timeMinutes(b.start_time!));
  return [...timed.flatMap((i) => [...(groups.get(i.id) ?? []), i]), ...(groups.get(null) ?? [])];
};
export const visibleTripItems = (plan: Pick<TripPlan, 'days' | 'items'>, day: DaySelection) =>
  day === 'all'
    ? [
        ...plan.days.flatMap((d) =>
          chronologicalTripItems(plan.items.filter((i) => i.trip_day_id === d.id)),
        ),
        ...chronologicalTripItems(plan.items.filter((i) => !i.trip_day_id)),
      ]
    : chronologicalTripItems(
        plan.items.filter((item) => item.trip_day_id === (day === 'pending' ? null : day)),
      );
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

export function activityStops(item: TripPlanItem) {
  let elapsed: number | null = 0;
  return (item.stops ?? []).map((stop) => {
    const start =
      item.start_time && elapsed !== null ? timeMinutes(item.start_time) + elapsed : null;
    const time = start !== null && start < 1440 ? minuteTime(start) : null;
    elapsed =
      elapsed === null || stop.duration_minutes === null ? null : elapsed + stop.duration_minutes;
    return { stop, time };
  });
}

export function activityBudget(item: TripPlanItem) {
  const stops = item.stops ?? [];
  const used = stops.reduce((sum, stop) => sum + (stop.duration_minutes ?? 0), 0);
  const available = itemDuration(item);
  return {
    used,
    available,
    unknown: stops.filter((stop) => stop.duration_minutes === null).length,
    overflow: available === null ? 0 : Math.max(0, used - available),
    canExtend:
      used > 0 && used <= 1440 && (!item.start_time || timeMinutes(item.start_time) + used <= 1440),
  };
}

export function relevantTripConnection(plan: TripPlan, entryId: string, day: string | null) {
  const entries = (items: TripPlanItem[]) =>
    new Set(items.flatMap((item) => [item.entry_id, ...(item.stops ?? []).map((s) => s.entry_id)]));
  const sameDay = entries(plan.items.filter((item) => item.trip_day_id === day));
  const voyage = entries(plan.items);
  const relevant = plan.connections.filter(
    (link) => link.fromId === entryId && voyage.has(link.entry.id),
  );
  return relevant.find((link) => sameDay.has(link.entry.id)) ?? relevant[0];
}

export function tripMapVisits(items: TripPlanItem[]) {
  return items.flatMap((parent, index) => [
    {
      id: parent.id,
      parent,
      entry: parent.entry,
      trip_day_id: parent.trip_day_id,
      number: String(index + 1),
      stop: undefined as TripPlanStop | undefined,
    },
    ...(parent.stops ?? []).map((stop, stopIndex) => ({
      id: stop.id,
      parent,
      stop,
      entry: stop.entry,
      trip_day_id: parent.trip_day_id,
      number: `${index + 1}.${stopIndex + 1}`,
    })),
  ]);
}

export function groupTripMapPoints<T extends { latitude: number; longitude: number }>(points: T[]) {
  const groups = new Map<string, T[]>();
  for (const point of points) {
    const key = `${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }
  return [...groups.values()];
}

export function activityNestingIssue(
  source: Pick<TripPlanItem, 'id' | 'entry_id'> & { stops?: TripPlanStop[] },
  parent: TripPlanItem,
) {
  if (source.id === parent.id) return 'Une activité ne peut pas devenir son propre arrêt.';
  if (source.stops?.length)
    return 'Cette activité contient déjà des arrêts. Sortez-les avant de l’intégrer à une autre activité.';
  return null;
}

function changeStops(
  items: TripPlanItem[],
  id: string,
  change: (stops: TripPlanStop[]) => TripPlanStop[],
) {
  return items.map((item) =>
    (item.stops ?? []).some((stop) => stop.id === id)
      ? { ...item, stops: change(item.stops) }
      : item,
  );
}

export function optimisticTripItems(items: TripPlanItem[], change: TripEdit) {
  switch (change.operation) {
    case 'color_item':
      return items.map((item) =>
        item.id === change.data.id ? { ...item, calendar_color: change.data.color } : item,
      );
    case 'nest_item': {
      const source = items.find((item) => item.id === change.data.id);
      const parent = items.find((item) => item.id === change.data.parent);
      if (!source || !parent || activityNestingIssue(source, parent)) return items;
      const stop: TripPlanStop = {
        id: source.id,
        calendar_color: source.calendar_color ?? null,
        trip_item_id: parent.id,
        entry_id: source.entry_id,
        entry: source.entry,
        added_by: source.added_by,
        notes: source.notes,
        duration_minutes: itemDuration(source),
        sort_order: (parent.stops?.at(-1)?.sort_order ?? 0) + 1024,
        version: source.version + (change.data.before && change.data.before !== source.id ? 1 : 0),
        created_at: source.created_at,
        updated_at: source.updated_at,
      };
      const stops = [...(parent.stops ?? [])];
      const before = stops.findIndex((candidate) => candidate.id === change.data.before);
      stops.splice(before < 0 ? stops.length : before, 0, stop);
      return items
        .filter((item) => item.id !== source.id)
        .map((item) => (item.id === parent.id ? { ...item, stops } : item));
    }
    case 'relocate_stop': {
      const origin = items.find((item) => item.stops?.some((stop) => stop.id === change.data.id));
      const found = origin && activityStops(origin).find(({ stop }) => stop.id === change.data.id);
      if (!origin || !found) return items;
      const { stop, time } = found;
      const destination = change.data;
      if (destination.kind === 'stop') {
        const parent = items.find((item) => item.id === destination.parent);
        if (!parent || activityNestingIssue(stop, parent) || destination.before === stop.id)
          return items;
        const next = items.map((item) => ({
          ...item,
          stops: item.stops.filter((s) => s.id !== stop.id),
        }));
        return next.map((item) => {
          if (item.id !== parent.id) return item;
          const stops = [...item.stops];
          const before = stops.findIndex((s) => s.id === destination.before);
          stops.splice(before < 0 ? stops.length : before, 0, {
            ...stop,
            trip_item_id: parent.id,
            version: stop.version + 1,
          });
          return { ...item, stops };
        });
      }
      const detached: TripPlanItem = {
        ...stop,
        trip_id: origin.trip_id,
        trip_day_id: destination.day,
        start_time: time,
        end_time: null,
        estimated_duration_minutes: stop.duration_minutes,
        version: 0,
        stops: [],
      };
      const next = changeStops(items, stop.id, (stops) => stops.filter((s) => s.id !== stop.id));
      const before = next.findIndex(
        (item) => item.id === destination.before && item.trip_day_id === destination.day,
      );
      next.splice(before < 0 ? next.length : before, 0, detached);
      return next;
    }
    case 'edit_stop':
      return changeStops(items, change.data.id, (stops) =>
        stops.map((stop) =>
          stop.id === change.data.id
            ? { ...stop, duration_minutes: change.data.duration, notes: change.data.notes }
            : stop,
        ),
      );
    case 'delete_stop':
      return changeStops(items, change.data.id, (stops) =>
        stops.filter((stop) => stop.id !== change.data.id),
      );
    case 'move_stop':
      return changeStops(items, change.data.id, (stops) => {
        if (change.data.before === change.data.id) return stops;
        const stop = stops.find((s) => s.id === change.data.id)!;
        const next = stops.filter((s) => s.id !== stop.id);
        const index = next.findIndex((s) => s.id === change.data.before);
        if (index >= 0) next.splice(index, 0, stop);
        else next.push(stop);
        return next;
      });
    case 'detach_stop': {
      const parent = items.find((item) => (item.stops ?? []).some((s) => s.id === change.data.id));
      const found = parent && activityStops(parent).find(({ stop }) => stop.id === change.data.id);
      if (!parent || !found) return items;
      const { stop, time } = found;
      const detached: TripPlanItem = {
        ...stop,
        trip_id: parent.trip_id,
        trip_day_id: parent.trip_day_id,
        start_time: time,
        end_time: null,
        estimated_duration_minutes: stop.duration_minutes,
        version: 0,
        stops: [],
      };
      const next = changeStops(items, stop.id, (stops) => stops.filter((s) => s.id !== stop.id));
      next.splice(next.findIndex((item) => item.id === parent.id) + 1, 0, detached);
      return next;
    }
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
        .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99'))
        .map((item, index) => ({ ...item, sort_order: (index + 1) * 1024 }));
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
  const lane = next
    .filter((item) => item.trip_day_id === destination.day)
    .sort((a, b) => a.sort_order - b.sort_order);
  const anchor = lane.findIndex((item) => item.id === destination.before);
  const order =
    anchor < 0
      ? (lane.at(-1)?.sort_order ?? 0) + 1024
      : ((lane[anchor - 1]?.sort_order ?? -1) + lane[anchor]!.sort_order) / 2;
  const moved = { ...current, trip_day_id: destination.day, sort_order: order };
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

/** Colors, notes and acknowledgements do not change overlap geometry. Keep only
 * derived positions, then attach the latest row references for their rendering. */
export function createCalendarLayoutCache(compute = layoutCalendarEvents) {
  const days = new Map<
    string,
    { key: string; positions: { id: string; lane: number; lanes: number }[] }
  >();
  return (day: string, items: TripPlanItem[]) => {
    const key = items
      .map(
        (item) =>
          `${item.id}:${item.start_time}:${item.end_time}:${item.estimated_duration_minutes}`,
      )
      .join('|');
    let cached = days.get(day);
    if (!cached || cached.key !== key) {
      cached = {
        key,
        positions: compute(items).map(({ item, lane, lanes }) => ({ id: item.id, lane, lanes })),
      };
      days.set(day, cached);
    }
    const latest = new Map(items.map((item) => [item.id, item]));
    return cached.positions.map(({ id, lane, lanes }) => ({ item: latest.get(id)!, lane, lanes }));
  };
}
