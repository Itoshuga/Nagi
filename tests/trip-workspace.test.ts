import { describe, expect, it } from 'vitest';
import { tripDateLabel, tripEditSchema, tripPlaceQuery } from '../packages/shared/src/trip-planner';
import {
  layoutCalendarEvents,
  minuteTime,
  optimisticTripItems,
  visibleTripItems,
} from '../apps/web/src/features/trips/planner-model';
import type { TripPlan, TripPlanItem } from '../packages/database/src/collaboration';

describe('Shared travel workspace model', () => {
  const item = (id: string, start: string | null, duration: number | null, day = 'day') =>
    ({
      id,
      start_time: start,
      end_time: null,
      estimated_duration_minutes: duration,
      trip_day_id: day,
    }) as TripPlanItem;
  it('lays out overlapping events side by side and gives the full width back afterwards', () => {
    const items = [
      item('a', '09:00', 90),
      item('b', '10:00', 30),
      item('c', '10:30', 60),
      item('free', null, 60),
    ];
    expect(
      layoutCalendarEvents(items).map(({ item, lane, lanes }) => [item.id, lane, lanes]),
    ).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ]);
    expect(items[0]!.start_time).toBe('09:00');
  });
  it('moves the schedule optimistically without changing the manual visit order or notes', () => {
    const items = [
      { ...item('a', '09:00', 60), notes: 'Billets' },
      item('b', '12:00', 30),
      item('c', '08:00', 30, 'other'),
    ];
    const changed = optimisticTripItems(items, {
      operation: 'schedule_item',
      data: {
        id: 'a',
        item_version: 0,
        day: 'other',
        start_time: '14:00',
        end_time: '15:00',
        duration: 60,
      },
    });
    expect(changed.find((i) => i.id === 'a')).toMatchObject({
      notes: 'Billets',
      trip_day_id: 'other',
      start_time: '14:00',
    });
    expect(items[0]!.trip_day_id).toBe('day');
    expect(visibleTripItems({ items: changed } as TripPlan, 'other').map((i) => i.id)).toEqual([
      'c',
      'a',
    ]);
  });
  it('supports local time, optional schedules on insertion, and explicit sorting', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      tripEditSchema.safeParse({
        operation: 'add_item',
        data: { id, entry: id, day: null, repeat: false, start_time: '09:30' },
      }).success,
    ).toBe(true);
    expect(
      tripEditSchema.safeParse({
        operation: 'schedule_item',
        data: {
          id,
          item_version: 0,
          day: null,
          start_time: '09:00',
          end_time: '08:30',
          duration: 30,
        },
      }).success,
    ).toBe(false);
    expect(tripEditSchema.safeParse({ operation: 'sort_items', data: { day: null } }).success).toBe(
      true,
    );
    expect(minuteTime(570)).toBe('09:30');
    expect(
      tripDateLabel('2028-12-22', { weekday: 'long', day: 'numeric', month: 'long' }),
    ).toContain('22 décembre');
  });
  it('validates bounded map searches and rejects invalid coordinates and identifiers', () => {
    expect(
      tripPlaceQuery.safeParse({
        mode: 'nearby',
        south: '35',
        north: '36',
        west: '139',
        east: '140',
      }).success,
    ).toBe(true);
    expect(tripPlaceQuery.safeParse({ mode: 'nearby', north: '100' }).success).toBe(false);
    expect(tripPlaceQuery.safeParse({ entry: 'other-trip' }).success).toBe(false);
  });
  it('keeps visit order within each day while grouping the whole-trip map by day', () => {
    const items = [
      item('a', '09:00', 60, 'first'),
      item('c', '10:00', 60, 'second'),
      item('b', '12:00', 30, 'first'),
    ];
    const plan = { items, days: [{ id: 'first' }, { id: 'second' }] } as TripPlan;
    expect(visibleTripItems(plan, 'all').map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(items.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });
});
