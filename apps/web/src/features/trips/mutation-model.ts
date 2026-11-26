import {
  sortTripDays,
  type TripEdit,
  type TripMutationRequest,
  type TripRealtimeEvent,
  type TripTransportChange,
} from '@nagi/shared';
import type { EntryCardRow, TripPlan, TripPlanStop, TripSyncPayload } from '@nagi/database';
import { placeSourceFields, tripSourceEntry } from '@nagi/database/trip-places';
import { placeSourceDefaults } from '@nagi/shared';
import { calendarDateAt, dayRange, movedTripItems, optimisticTripItems } from './planner-model';

type Guard = TripMutationRequest['expected'];
const clock = (value: unknown) =>
  typeof value === 'string' && /^\d\d:\d\d$/.test(value) ? `${value}:00` : value;
function difference(row: object, patch: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(patch).filter(
      ([key, value]) => clock((row as Record<string, unknown>)[key]) !== clock(value),
    ),
  );
}
export function transportTripChange(plan: TripPlan, change: TripEdit): TripTransportChange | null {
  const d = change.data;
  if (
    change.operation === 'color_item' ||
    change.operation === 'schedule_item' ||
    change.operation === 'edit_item'
  ) {
    const row = plan.items.find((i) => i.id === change.data.id);
    if (!row) throw new Error('Cette activité n’existe plus.');
    const patch =
      change.operation === 'color_item'
        ? { calendar_color: change.data.color }
        : change.operation === 'schedule_item'
          ? {
              trip_day_id: change.data.day,
              start_time: change.data.start_time,
              end_time: change.data.end_time,
              estimated_duration_minutes: change.data.duration,
            }
          : {
              start_time: change.data.start_time,
              end_time: change.data.end_time,
              estimated_duration_minutes: change.data.duration,
              notes: change.data.notes,
            };
    const changed = difference(row, patch);
    return Object.keys(changed).length
      ? { operation: 'patch_item', data: { id: row.id, patch: changed } }
      : null;
  }
  if (change.operation === 'edit_stop') {
    const row = plan.items.flatMap((i) => i.stops).find((s) => s.id === change.data.id);
    if (!row) throw new Error('Cet arrêt n’existe plus.');
    const patch = difference(row, {
      duration_minutes: change.data.duration,
      notes: change.data.notes,
    });
    return Object.keys(patch).length
      ? { operation: 'patch_stop', data: { id: row.id, patch } }
      : null;
  }
  if (change.operation === 'edit_day') {
    const row = plan.days.find((day) => day.id === change.data.id);
    if (!row) throw new Error('Cette journée n’existe plus.');
    const patch = difference(row, { title: change.data.title, date: change.data.date });
    return Object.keys(patch).length
      ? { operation: 'patch_day', data: { id: row.id, patch } }
      : null;
  }
  if (change.operation === 'add_day')
    return { operation: 'add_day', data: { ...change.data, id: crypto.randomUUID() } };
  if (change.operation === 'generate_days') {
    const days =
      plan.start_date && plan.end_date
        ? Array.from({ length: dayRange(plan.start_date, plan.end_date) }, (_, i) =>
            calendarDateAt(plan.start_date!, i),
          )
            .filter((date) => !plan.days.some((day) => day.date === date))
            .map((date) => ({ id: crypto.randomUUID(), date }))
        : [];
    return { operation: 'generate_days', data: { days } };
  }
  void d;
  return change;
}

/** Guards express intent at property level; trip-wide revisions are cursors, not
 * a lock on unrelated edits. Structural operations guard their actual anchors. */
export function tripMutationGuards(
  plan: TripPlan,
  change: TripTransportChange,
  calendar = false,
): Guard {
  const guards: Guard = { items: {}, stops: {}, days: {} };
  const root = (id: string | null | undefined, full = false) => {
    const row = plan.items.find((i) => i.id === id);
    if (!row) return;
    guards.items[row.id] = full
      ? {
          trip_day_id: row.trip_day_id,
          sort_order: row.sort_order,
          notes: row.notes,
          start_time: clock(row.start_time) as string | null,
          end_time: clock(row.end_time) as string | null,
          estimated_duration_minutes: row.estimated_duration_minutes,
          calendar_color: row.calendar_color,
        }
      : { trip_day_id: row.trip_day_id, sort_order: row.sort_order };
    if (calendar)
      Object.assign(guards.items[row.id]!, {
        start_time: clock(row.start_time) as string | null,
        end_time: clock(row.end_time) as string | null,
        estimated_duration_minutes: row.estimated_duration_minutes,
      });
    if (full)
      for (const stop of row.stops)
        guards.stops[stop.id] = {
          trip_item_id: row.id,
          sort_order: stop.sort_order,
          notes: stop.notes,
          duration_minutes: stop.duration_minutes,
        };
  };
  const stop = (id: string | null | undefined) => {
    const row = plan.items.flatMap((i) => i.stops).find((s) => s.id === id);
    if (row) guards.stops[row.id] = { trip_item_id: row.trip_item_id, sort_order: row.sort_order };
  };
  const day = (id: string | null | undefined) => {
    const row = plan.days.find((d) => d.id === id);
    if (row) guards.days[row.id] = { date: row.date, sort_order: row.sort_order };
  };
  if (
    change.operation === 'patch_item' ||
    change.operation === 'patch_stop' ||
    change.operation === 'patch_day'
  ) {
    const kind =
      change.operation === 'patch_item'
        ? 'items'
        : change.operation === 'patch_stop'
          ? 'stops'
          : 'days';
    const rows =
      kind === 'items'
        ? plan.items
        : kind === 'stops'
          ? plan.items.flatMap((i) => i.stops)
          : plan.days;
    const row = rows.find((r) => r.id === change.data.id);
    if (!row) throw new Error('Cette donnée n’existe plus.');
    guards[kind][row.id] = Object.fromEntries(
      Object.keys(change.data.patch).map((key) => [
        key,
        clock((row as unknown as Record<string, unknown>)[key]),
      ]),
    ) as Guard['items'][string];
    if (calendar && change.operation === 'patch_item') {
      const item = plan.items.find((item) => item.id === row.id)!;
      Object.assign(guards.items[row.id]!, {
        trip_day_id: item.trip_day_id,
        start_time: clock(item.start_time),
        end_time: clock(item.end_time),
        estimated_duration_minutes: item.estimated_duration_minutes,
      });
    }
    return guards;
  }
  const data = change.data as {
    id?: string;
    before?: string | null;
    parent?: string;
    day?: string | null;
  };
  if (data.id) {
    root(data.id, change.operation === 'delete_item');
    stop(data.id);
    day(data.id);
  }
  if (data.before) {
    root(data.before);
    stop(data.before);
  }
  if (data.parent) root(data.parent);
  if (data.day) day(data.day);
  if (change.operation === 'sort_items' || change.operation === 'delete_day')
    for (const row of plan.items.filter(
      (i) => i.trip_day_id === (change.operation === 'delete_day' ? data.id : data.day),
    ))
      root(row.id);
  if (change.operation === 'move_day') for (const row of plan.days) day(row.id);
  if (change.operation === 'replace_place') {
    const item = plan.items.find((i) => i.id === change.data.id),
      nested = plan.items.flatMap((i) => i.stops).find((s) => s.id === change.data.id),
      row = item ?? nested;
    if (row)
      guards[item ? 'items' : 'stops'][row.id] = {
        source: row.source ?? 'nagi',
        entry_id: row.entry_id,
        external_place_id: row.external_place_id ?? null,
        external_query: row.external_query ?? null,
        needs_place_relink: row.needs_place_relink ?? false,
        custom_title: row.custom_title ?? null,
        custom_location: row.custom_location ?? null,
        custom_latitude: row.custom_latitude ?? null,
        custom_longitude: row.custom_longitude ?? null,
      };
  }
  return guards;
}

export function tripMutationKeys(plan: TripPlan, change: TripTransportChange) {
  const keys = new Set<string>();
  const data = change.data as {
    id?: string;
    parent?: string;
    day?: string | null;
    before?: string | null;
    patch?: { trip_day_id?: string | null };
  };
  const item = plan.items.find((i) => i.id === data.id),
    parent = plan.items.find((i) => i.stops.some((s) => s.id === data.id));
  if (data.id) keys.add(`entity:${data.id}`);
  if (data.parent) keys.add(`entity:${data.parent}`);
  if (parent) keys.add(`entity:${parent.id}`);
  if (data.before) keys.add(`entity:${data.before}`);
  if (
    ['patch_day', 'add_day', 'generate_days', 'delete_day', 'move_day'].includes(change.operation)
  )
    keys.add('days');
  if (
    (change.operation !== 'patch_item' &&
      change.operation !== 'patch_stop' &&
      change.operation !== 'patch_day') ||
    (data.patch && 'trip_day_id' in data.patch)
  ) {
    for (const id of [item?.trip_day_id, data.day, data.patch?.trip_day_id])
      if (id !== undefined) {
        keys.add(`lane:${id}`);
        if (id) keys.add(`entity:${id}`);
      }
  }
  return [...keys];
}

export function optimisticTripChange(
  plan: TripPlan,
  change: TripTransportChange,
  viewer: string,
  entry?: EntryCardRow,
): TripPlan {
  const now = new Date().toISOString();
  if (change.operation === 'replace_place') {
    const fields = placeSourceFields(change.data.place);
    const update = <T extends { id: string; updated_at: string; entry: EntryCardRow | null }>(
      row: T,
    ) => {
      if (row.id !== change.data.id) return row;
      const next = { ...row, ...fields };
      return { ...next, entry: tripSourceEntry(next) ?? entry ?? null };
    };
    return {
      ...plan,
      items: plan.items.map((item) => ({ ...update(item), stops: item.stops.map(update) })),
    };
  }
  if (change.operation === 'add_place') {
    const fields = placeSourceFields(change.data.place),
      d = change.data;
    const common = {
      ...fields,
      id: d.id,
      added_by: viewer,
      notes: d.notes,
      calendar_color: d.color,
      version: 0,
      created_at: now,
      updated_at: now,
    };
    const rendered = tripSourceEntry(common) ?? entry ?? null;
    if (d.parent)
      return {
        ...plan,
        items: plan.items.map((item) =>
          item.id === d.parent
            ? {
                ...item,
                stops: insertStop(item.stops, d.before, {
                  ...common,
                  entry: rendered,
                  trip_item_id: item.id,
                  duration_minutes: d.duration,
                  sort_order: (item.stops.at(-1)?.sort_order ?? 0) + 1024,
                }),
              }
            : item,
        ),
      };
    return {
      ...plan,
      items: movedTripItems(
        [
          ...plan.items,
          {
            ...common,
            entry: rendered,
            stops: [],
            trip_id: plan.id,
            trip_day_id: d.day,
            start_time: d.start_time ?? null,
            end_time: null,
            estimated_duration_minutes: d.duration,
            sort_order:
              Math.max(
                0,
                ...plan.items.filter((i) => i.trip_day_id === d.day).map((i) => i.sort_order),
              ) + 1024,
          },
        ],
        d.id,
        { day: d.day, before: d.before },
      ),
    };
  }
  if (change.operation === 'patch_item' && 'trip_day_id' in change.data.patch) {
    const previous = plan.items.find((item) => item.id === change.data.id);
    if (previous && previous.trip_day_id !== change.data.patch.trip_day_id) {
      const order =
        Math.max(
          0,
          ...plan.items
            .filter((item) => item.trip_day_id === change.data.patch.trip_day_id)
            .map((item) => item.sort_order),
        ) + 1024;
      const items = plan.items.map((item) =>
        item.id === change.data.id ? { ...item, ...change.data.patch, sort_order: order } : item,
      );
      return {
        ...plan,
        items: movedTripItems(items, change.data.id, {
          day: change.data.patch.trip_day_id ?? null,
          before: null,
        }),
      };
    }
  }
  if (change.operation === 'patch_item')
    return {
      ...plan,
      items: plan.items.map((i) => (i.id === change.data.id ? { ...i, ...change.data.patch } : i)),
    };
  if (change.operation === 'patch_stop')
    return {
      ...plan,
      items: plan.items.map((i) =>
        i.stops.some((s) => s.id === change.data.id)
          ? {
              ...i,
              stops: i.stops.map((s) =>
                s.id === change.data.id ? { ...s, ...change.data.patch } : s,
              ),
            }
          : i,
      ),
    };
  if (change.operation === 'patch_day')
    return {
      ...plan,
      days: sortTripDays(
        plan.days.map((d) => (d.id === change.data.id ? { ...d, ...change.data.patch } : d)),
      ),
    };
  if (change.operation === 'add_item' && entry)
    return {
      ...plan,
      items: movedTripItems(
        [
          ...plan.items,
          {
            id: change.data.id,
            ...placeSourceDefaults,
            trip_id: plan.id,
            trip_day_id: change.data.day,
            entry_id: entry.id,
            entry,
            stops: [],
            added_by: viewer,
            notes: '',
            sort_order:
              (plan.items.filter((i) => i.trip_day_id === change.data.day).at(-1)?.sort_order ??
                0) + 1024,
            start_time: change.data.start_time ?? null,
            end_time: null,
            estimated_duration_minutes: change.data.duration ?? null,
            calendar_color: null,
            version: 0,
            created_at: now,
            updated_at: now,
          },
        ],
        change.data.id,
        { day: change.data.day, before: change.data.before ?? null },
      ),
    };
  if (change.operation === 'add_stop' && entry)
    return {
      ...plan,
      items: plan.items.map((i) =>
        i.id === change.data.parent
          ? {
              ...i,
              stops: insertStop(i.stops, change.data.before, {
                id: change.data.id,
                ...placeSourceDefaults,
                trip_item_id: i.id,
                entry_id: entry.id,
                entry,
                added_by: viewer,
                duration_minutes: change.data.duration,
                calendar_color: null,
                notes: '',
                sort_order: (i.stops.at(-1)?.sort_order ?? 0) + 1024,
                version: 0,
                created_at: now,
                updated_at: now,
              }),
            }
          : i,
      ),
    };
  if (change.operation === 'add_day' || change.operation === 'generate_days') {
    const additions =
      change.operation === 'add_day'
        ? [change.data]
        : 'days' in change.data
          ? change.data.days
          : [];
    const max = Math.max(0, ...plan.days.map((d) => d.day_number));
    return {
      ...plan,
      days: sortTripDays([
        ...plan.days,
        ...additions
          .filter(
            (d) =>
              'id' in d &&
              !plan.days.some((old) => old.id === d.id || (d.date && old.date === d.date)),
          )
          .map((d, index) => ({
            id: 'id' in d ? d.id : '',
            trip_id: plan.id,
            day_number: max + index + 1,
            sort_order: Math.max(0, ...plan.days.map((day) => day.sort_order)) + index + 1,
            title: 'title' in d ? d.title : '',
            date: d.date,
            created_at: now,
            updated_at: now,
          })),
      ]),
    };
  }
  if (change.operation === 'delete_day')
    return {
      ...plan,
      days: plan.days.filter((d) => d.id !== change.data.id),
      items: plan.items.map((i) =>
        i.trip_day_id === change.data.id ? { ...i, trip_day_id: change.data.day } : i,
      ),
    };
  if (change.operation === 'move_day') {
    const days = [...plan.days],
      index = days.findIndex((d) => d.id === change.data.id),
      target = index + (change.data.direction === 'up' ? -1 : 1);
    if (index >= 0 && target >= 0 && target < days.length)
      [days[index], days[target]] = [days[target]!, days[index]!];
    return { ...plan, days };
  }
  return { ...plan, items: optimisticTripItems(plan.items, change as TripEdit) };
}

const changesPlace = (row: object | undefined) =>
  !!row &&
  [
    'source',
    'entry_id',
    'external_place_id',
    'external_query',
    'needs_place_relink',
    'custom_title',
    'custom_location',
    'custom_latitude',
    'custom_longitude',
  ].some((key) => key in row);

export function applyTripEvent(
  plan: TripPlan,
  event: TripRealtimeEvent,
  extra: Pick<TripSyncPayload, 'entries' | 'connections' | 'people'>,
): TripPlan {
  if (event.trip_id !== plan.id || event.version <= plan.version) return plan;
  const catalog = new Map(
    (event.changes.items.upsert.length ||
    event.changes.stops.upsert.length ||
    event.changes.items.patch.some(changesPlace) ||
    event.changes.stops.patch.some(changesPlace)
      ? [...plan.items.flatMap((i) => [i.entry, ...i.stops.map((s) => s.entry)]), ...extra.entries]
      : []
    )
      .filter((e): e is EntryCardRow => !!e)
      .map((e) => [e.id, e]),
  );
  const remove = new Set(event.changes.items.remove),
    upsert = new Map(event.changes.items.upsert.map((i) => [i.id, i]));
  let items = plan.items
    .filter((i) => !remove.has(i.id))
    .map((i) =>
      upsert.has(i.id)
        ? {
            ...i,
            ...upsert.get(i.id)!,
            entry:
              tripSourceEntry(upsert.get(i.id)!) ??
              (upsert.get(i.id)!.entry_id
                ? (catalog.get(upsert.get(i.id)!.entry_id!) ?? null)
                : null),
          }
        : i,
    );
  const patches = new Map(event.changes.items.patch.map((row) => [row.id, row]));
  if (patches.size)
    items = items.map((item) =>
      patches.has(item.id) ? { ...item, ...patches.get(item.id)! } : item,
    );
  const known = new Set(items.map((i) => i.id));
  for (const row of upsert.values())
    if (!known.has(row.id))
      items.push({
        ...row,
        stops: [],
        entry: tripSourceEntry(row) ?? (row.entry_id ? (catalog.get(row.entry_id) ?? null) : null),
      });
  const stopRemove = new Set([
    ...event.changes.stops.remove,
    ...event.changes.stops.upsert.map((s) => s.id),
  ]);
  if (stopRemove.size)
    items = items.map((i) =>
      i.stops.some((s) => stopRemove.has(s.id))
        ? { ...i, stops: i.stops.filter((s) => !stopRemove.has(s.id)) }
        : i,
    );
  for (const row of event.changes.stops.upsert)
    items = items.map((i) =>
      i.id === row.trip_item_id
        ? {
            ...i,
            stops: [
              ...i.stops,
              {
                ...row,
                entry:
                  tripSourceEntry(row) ??
                  (row.entry_id ? (catalog.get(row.entry_id) ?? null) : null),
              },
            ].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
          }
        : i,
    );
  const stopPatches = new Map(event.changes.stops.patch.map((row) => [row.id, row]));
  const transferred = items.flatMap((item) =>
    item.stops
      .filter(
        (stop) =>
          stopPatches.get(stop.id)?.trip_item_id &&
          stopPatches.get(stop.id)!.trip_item_id !== item.id,
      )
      .map((stop) => ({ ...stop, ...stopPatches.get(stop.id)! })),
  );
  if (stopPatches.size)
    items = items.map((item) => {
      const arriving = transferred.filter((stop) => stop.trip_item_id === item.id);
      if (!arriving.length && !item.stops.some((stop) => stopPatches.has(stop.id))) return item;
      return {
        ...item,
        stops: [
          ...item.stops
            .map((stop) =>
              stopPatches.has(stop.id) ? { ...stop, ...stopPatches.get(stop.id)! } : stop,
            )
            .filter((stop) => stop.trip_item_id === item.id),
          ...arriving,
        ].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
      };
    });
  if (
    event.changes.items.patch.some(changesPlace) ||
    event.changes.stops.patch.some(changesPlace)
  ) {
    const entryFor = (row: TripPlan['items'][number] | TripPlanStop) =>
      tripSourceEntry(row) ?? (row.entry_id ? (catalog.get(row.entry_id) ?? null) : null);
    items = items.map((item) => ({
      ...item,
      ...(changesPlace(patches.get(item.id)) ? { entry: entryFor(item) } : {}),
      stops: item.stops.map((stop) =>
        changesPlace(stopPatches.get(stop.id)) ? { ...stop, entry: entryFor(stop) } : stop,
      ),
    }));
  }
  const deletedDays = new Set(event.changes.days.remove),
    newDays = new Map(event.changes.days.upsert.map((d) => [d.id, d]));
  const days = plan.days.filter((d) => !deletedDays.has(d.id)).map((d) => newDays.get(d.id) ?? d),
    knownDays = new Set(days.map((d) => d.id));
  days.push(...event.changes.days.upsert.filter((d) => !knownDays.has(d.id)));
  const dayPatches = new Map(event.changes.days.patch.map((row) => [row.id, row]));
  const changedDays = days.map((day) =>
    dayPatches.has(day.id) ? { ...day, ...dayPatches.get(day.id)! } : day,
  );
  const links = new Map(
    [...plan.connections, ...extra.connections].map((link) => [
      `${link.fromId}:${link.entry.id}:${link.label}`,
      link,
    ]),
  );
  return {
    ...plan,
    ...event.changes.trip,
    version: event.version,
    items:
      event.changes.items.upsert.length ||
      event.changes.items.patch.some((row) => row.sort_order !== undefined)
        ? items.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        : items,
    days:
      event.changes.days.upsert.length ||
      event.changes.days.remove.length ||
      event.changes.days.patch.length
        ? sortTripDays(changedDays)
        : plan.days,
    connections: extra.connections.length ? [...links.values()] : plan.connections,
    people: extra.people?.length
      ? [
          ...new Map(
            [...plan.people, ...extra.people].map((person) => [person.id, person]),
          ).values(),
        ]
      : plan.people,
  };
}

function insertStop(stops: TripPlanStop[], before: string | null | undefined, stop: TripPlanStop) {
  const next = [...stops];
  const index = next.findIndex((s) => s.id === before);
  if (index >= 0) {
    stop.sort_order = ((next[index - 1]?.sort_order ?? -1) + next[index]!.sort_order) / 2;
    next.splice(index, 0, stop);
  } else next.push(stop);
  return next;
}
