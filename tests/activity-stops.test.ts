import { describe, expect, it } from 'vitest';
import type { TripPlanItem, TripPlanStop } from '../packages/database/src/collaboration';
import {
  activityBudget,
  activityNestingIssue,
  activityStops,
  itemDuration,
  layoutCalendarEvents,
  optimisticTripItems,
  visibleTripItems,
} from '../apps/web/src/features/trips/planner-model';
import { tripEditSchema } from '../packages/shared/src/trip-planner';

const stop = (id: string, duration: number | null) =>
  ({
    id,
    entry_id: `${id}-entry`,
    duration_minutes: duration,
    notes: 'Étage 6',
    version: 0,
  }) as TripPlanStop;
const parent = (stops = [stop('nintendo', 40), stop('pokemon', 40), stop('sega', 40)]) =>
  ({
    id: 'parco',
    entry_id: 'parco-entry',
    trip_id: 'trip',
    trip_day_id: 'day',
    start_time: '14:00',
    end_time: null,
    estimated_duration_minutes: 120,
    stops,
  }) as TripPlanItem;

describe('Activities with internal stops', () => {
  it('moves a stop between groups and back to a root at the selected destination without losing its notes', () => {
    const origin = parent();
    const other = {
      ...parent([]),
      id: 'other',
      entry_id: 'other-entry',
      trip_day_id: 'another-day',
    };
    const moved = optimisticTripItems([origin, other], {
      operation: 'relocate_stop',
      data: { kind: 'stop', id: 'pokemon', parent: 'other', before: null },
    });
    expect(moved[0]?.stops.map((s) => s.id)).toEqual(['nintendo', 'sega']);
    expect(moved[1]?.stops[0]).toMatchObject({
      id: 'pokemon',
      notes: 'Étage 6',
      duration_minutes: 40,
      trip_item_id: 'other',
    });
    expect(origin.stops).toHaveLength(3);
    const detached = optimisticTripItems(moved, {
      operation: 'relocate_stop',
      data: { kind: 'activity', id: 'pokemon', day: 'day', before: 'parco' },
    });
    expect(detached[0]).toMatchObject({
      id: 'pokemon',
      trip_day_id: 'day',
      notes: 'Étage 6',
      estimated_duration_minutes: 40,
      start_time: '14:00',
      stops: [],
    });
    expect(detached.find((item) => item.id === 'other')?.stops).toHaveLength(0);
  });
  it('reorders a stop in its current group and keeps an unknown derived time free on detachment', () => {
    const origin = parent([stop('a', null), stop('b', 20)]);
    const detached = optimisticTripItems([origin], {
      operation: 'relocate_stop',
      data: { kind: 'activity', id: 'b', day: null, before: null },
    });
    expect(detached[1]).toMatchObject({ id: 'b', start_time: null, trip_day_id: null });
    const moved = optimisticTripItems([origin], {
      operation: 'relocate_stop',
      data: { kind: 'stop', id: 'b', parent: 'parco', before: 'a' },
    });
    expect(moved[0]?.stops.map((s) => s.id)).toEqual(['b', 'a']);
  });
  it('converts a root into a stop immutably, keeping its identity, duration, notes and author', () => {
    const item = { ...parent([]), entry_id: 'parco-entry' };
    const source = {
      ...parent([]),
      id: 'nintendo',
      entry_id: 'nintendo-entry',
      start_time: '10:00',
      end_time: '10:45',
      notes: 'Étage 6',
      added_by: 'author',
      version: 3,
    };
    const result = optimisticTripItems([item, source], {
      operation: 'nest_item',
      data: { id: source.id, parent: item.id },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.stops[0]).toMatchObject({
      id: source.id,
      trip_item_id: item.id,
      duration_minutes: 45,
      notes: 'Étage 6',
      added_by: 'author',
      version: 3,
    });
    expect(item.stops).toHaveLength(0);
    expect(activityStops(result[0]!)[0]?.time).toBe('14:00');
    expect(itemDuration(result[0]!)).toBe(120);
  });
  it('rejects nesting a group, the parent itself or a duplicate place without hiding the source', () => {
    const item = { ...parent(), entry_id: 'parent-entry' };
    const source = { ...parent([]), id: 'source', entry_id: 'source-entry' };
    expect(activityNestingIssue(item, source)).toContain('déjà des arrêts');
    expect(activityNestingIssue(source, source)).toContain('autre lieu');
    const duplicate = { ...item, stops: [{ ...stop('dup', 20), entry_id: source.entry_id }] };
    expect(activityNestingIssue(source, duplicate)).toContain('déjà parmi');
    const snapshot = [duplicate, source];
    expect(
      optimisticTripItems(snapshot, {
        operation: 'nest_item',
        data: { id: source.id, parent: duplicate.id },
      }),
    ).toBe(snapshot);
  });
  it('derives internal times without adding the stop durations to the parent calendar block', () => {
    const item = parent();
    expect(activityStops(item).map(({ time }) => time)).toEqual(['14:00', '14:40', '15:20']);
    expect(itemDuration(item)).toBe(120);
    expect(activityBudget(item)).toMatchObject({
      used: 120,
      available: 120,
      overflow: 0,
      unknown: 0,
    });
    expect(layoutCalendarEvents([item])).toHaveLength(1);
    expect(visibleTripItems({ items: [item], days: [] }, 'day')).toHaveLength(1);
  });
  it('moves the whole activity and derives its internal times from the new start', () => {
    const item = parent();
    const [moved] = optimisticTripItems([item], {
      operation: 'schedule_item',
      data: {
        id: 'parco',
        item_version: 0,
        day: 'another-day',
        start_time: '10:00',
        end_time: '12:00',
        duration: 120,
      },
    });
    if (!moved) throw new Error('Missing activity');
    expect(moved.trip_day_id).toBe('another-day');
    expect(activityStops(moved).map(({ time }) => time)).toEqual(['10:00', '10:40', '11:20']);
    expect(activityStops(item)[0]!.time).toBe('14:00');
  });
  it('does not invent later times when an earlier stop has an unknown duration', () => {
    const item = parent([stop('a', null), stop('b', 30)]);
    expect(activityStops(item).map(({ time }) => time)).toEqual(['14:00', null]);
    expect(activityBudget(item)).toMatchObject({ used: 30, unknown: 1, overflow: 0 });
    expect(activityStops({ ...item, start_time: null }).every(({ time }) => time === null)).toBe(
      true,
    );
  });
  it('shows over-budget stops and refuses to extend a block beyond the local day', () => {
    const item = parent([stop('a', 80), stop('b', 70)]);
    expect(activityBudget(item)).toMatchObject({
      used: 150,
      available: 120,
      overflow: 30,
      canExtend: true,
    });
    expect(activityBudget({ ...item, start_time: '23:00' }).canExtend).toBe(false);
  });
  it('reorders and edits stops without changing the parent or its original snapshot', () => {
    const item = parent();
    const [moved] = optimisticTripItems([item], {
      operation: 'move_stop',
      data: { id: 'sega', before: 'nintendo' },
    });
    if (!moved) throw new Error('Missing activity');
    expect(moved.stops.map((s) => s.id)).toEqual(['sega', 'nintendo', 'pokemon']);
    const [edited] = optimisticTripItems([moved], {
      operation: 'edit_stop',
      data: { id: 'nintendo', stop_version: 0, duration: 60, notes: 'Billets' },
    });
    if (!edited) throw new Error('Missing activity');
    expect(activityBudget(edited).overflow).toBe(20);
    expect(item.stops[0]!.notes).toBe('Étage 6');
  });
  it('detaches a stop with its derived schedule, duration and notes intact', () => {
    const items = optimisticTripItems([parent()], {
      operation: 'detach_stop',
      data: { id: 'pokemon' },
    });
    expect(items).toHaveLength(2);
    expect(items[0]!.stops.map((s) => s.id)).toEqual(['nintendo', 'sega']);
    expect(items[1]).toMatchObject({
      id: 'pokemon',
      start_time: '14:40',
      trip_day_id: 'day',
      notes: 'Étage 6',
      estimated_duration_minutes: 40,
      stops: [],
    });
  });
  it('validates stop durations and versions before calling the transaction', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    for (const duration of [0, -1, 1.5, 1441])
      expect(
        tripEditSchema.safeParse({
          operation: 'edit_stop',
          data: { id, stop_version: 0, duration, notes: '' },
        }).success,
      ).toBe(false);
    expect(
      tripEditSchema.safeParse({
        operation: 'edit_stop',
        data: { id, stop_version: 0, duration: null, notes: '' },
      }).success,
    ).toBe(true);
  });
});
