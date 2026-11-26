import { describe, expect, it } from 'vitest';
import type { TripPlanItem, TripPlan } from '../packages/database/src/collaboration';
import {
  calendarItemDestination,
  calendarMoveChange,
  calendarScheduleFields,
  calendarScheduleLabel,
  positionedCalendarSchedule,
} from '../apps/web/src/features/trips/calendar-model';
import { optimisticTripItems } from '../apps/web/src/features/trips/planner-model';
import {
  transportTripChange,
  tripMutationGuards,
} from '../apps/web/src/features/trips/mutation-model';

const item = {
  id: '11111111-1111-4111-8111-111111111111',
  trip_day_id: 'day',
  start_time: '09:00',
  end_time: '12:00',
  estimated_duration_minutes: 180,
  sort_order: 1024,
  notes: 'Billets réservés',
  calendar_color: '#73A6DF',
  version: 3,
  stops: [{ id: 'stop', duration_minutes: 30 }],
} as TripPlanItem;

describe('Universal calendar moves', () => {
  it('guards coupled scheduling fields during a move while allowing independent notes and colors', () => {
    const plan = { items: [item], days: [] } as unknown as TripPlan;
    const move = calendarMoveChange(
      item,
      calendarItemDestination(item, { type: 'calendar', day: 'day' }, 840)!,
    )!;
    const transport = transportTripChange(plan, move)!;
    expect(tripMutationGuards(plan, transport, true).items[item.id]).toEqual({
      trip_day_id: 'day',
      start_time: '09:00:00',
      end_time: '12:00:00',
      estimated_duration_minutes: 180,
    });
    const free = { ...item, start_time: null, end_time: null };
    const change = calendarMoveChange(
      free,
      calendarItemDestination(free, { type: 'calendar', zone: 'unscheduled', day: 'next' })!,
    )!;
    expect(
      tripMutationGuards({ ...plan, items: [free] }, change, true).items[item.id],
    ).toMatchObject({
      trip_day_id: 'day',
      sort_order: 1024,
      start_time: null,
      end_time: null,
      estimated_duration_minutes: 180,
    });
  });
  it('plans an untimed occurrence at the actual snapped clock without creating a duration', () => {
    const free = { ...item, start_time: null, end_time: null, estimated_duration_minutes: null };
    const next = calendarItemDestination(free, { type: 'calendar', day: 'next' }, 603)!;
    expect(calendarMoveChange(free, next)).toMatchObject({
      operation: 'schedule_item',
      data: {
        id: item.id,
        day: 'next',
        start_time: '10:00',
        end_time: null,
        duration: null,
      },
    });
    expect(free.stops).toBe(item.stops);
    expect(free.start_time).toBeNull();
  });
  it('keeps the duration, children and metadata when scheduling an untimed visit', () => {
    const free = { ...item, start_time: null, end_time: null };
    const change = calendarMoveChange(
      free,
      calendarItemDestination(free, { type: 'calendar', day: 'next' }, 840)!,
    )!;
    const after = optimisticTripItems([free], change)[0]!;
    expect(after).toMatchObject({
      start_time: '14:00',
      end_time: '17:00',
      estimated_duration_minutes: 180,
      notes: item.notes,
      calendar_color: item.calendar_color,
    });
    expect(after.stops).toBe(item.stops);
  });
  it('removes both clocks while preserving even a duration derived only from explicit endpoints', () => {
    const bounded = { ...item, estimated_duration_minutes: null };
    const next = calendarItemDestination(bounded, {
      type: 'calendar',
      zone: 'unscheduled',
      day: 'next',
    })!;
    expect(calendarScheduleFields(next)).toEqual({
      day: 'next',
      start_time: null,
      end_time: null,
      duration: 180,
    });
    expect(calendarScheduleLabel(next)).toBe('Sans horaire');
    const change = calendarMoveChange(bounded, next)!;
    expect(transportTripChange({ items: [bounded] } as TripPlan, change)).toEqual({
      operation: 'patch_item',
      data: {
        id: item.id,
        patch: {
          trip_day_id: 'next',
          start_time: null,
          end_time: null,
          estimated_duration_minutes: 180,
        },
      },
    });
  });
  it('reorders untimed occurrences with the existing structural mutation', () => {
    const free = { ...item, start_time: null, end_time: null };
    const other = { ...free, id: 'other', sort_order: 2048 };
    const next = calendarItemDestination(other, {
      type: 'calendar',
      zone: 'unscheduled',
      day: 'day',
      before: free.id,
    })!;
    const change = calendarMoveChange(other, next)!;
    expect(change).toEqual({
      operation: 'move_item',
      data: { id: 'other', day: 'day', before: free.id },
    });
    const changed = optimisticTripItems([free, other], change);
    expect(changed.map((row) => row.id)).toEqual(['other', free.id]);
    expect(changed[0]!.start_time).toBeNull();
  });
  it('keeps precise clocks on horizontal moves and rounds only deliberate time moves', () => {
    const precise = {
      ...item,
      start_time: '09:07',
      end_time: null,
      estimated_duration_minutes: 60,
    };
    expect(positionedCalendarSchedule(precise, 'next', 547, true).start).toBe(547);
    expect(positionedCalendarSchedule(precise, 'next', 547).start).toBe(540);
    expect(
      positionedCalendarSchedule(
        { ...precise, start_time: '23:59', estimated_duration_minutes: null },
        'next',
        1439,
        true,
      ).start,
    ).toBe(1439);
  });
  it('preserves duration at both day boundaries instead of shortening an existing occurrence', () => {
    expect(positionedCalendarSchedule(item, 'next', 1430)).toMatchObject({
      start: 1260,
      end: 1440,
      duration: 180,
    });
    expect(positionedCalendarSchedule(item, 'next', -20)).toMatchObject({ start: 0, end: 180 });
  });
  it('moves between stay cards without adding or clearing a clock', () => {
    const next = calendarItemDestination(item, {
      type: 'calendar',
      zone: 'overview',
      day: 'next',
    })!;
    expect(calendarMoveChange(item, next)).toEqual({
      operation: 'move_item',
      data: { id: item.id, day: 'next', before: null },
    });
    expect(calendarMoveChange(item, { ...next, day: 'day' })).toBeUndefined();
  });
  it('rejects missing/non-finite grid coordinates and self insertion', () => {
    expect(calendarItemDestination(item, { type: 'calendar', day: 'next' })).toBeUndefined();
    expect(calendarItemDestination(item, { type: 'calendar', day: 'next' }, NaN)).toBeUndefined();
    const free = { ...item, start_time: null, end_time: null };
    expect(
      calendarMoveChange(
        free,
        calendarItemDestination(free, {
          type: 'calendar',
          zone: 'unscheduled',
          day: 'day',
          before: free.id,
        })!,
      ),
    ).toBeUndefined();
  });
});
