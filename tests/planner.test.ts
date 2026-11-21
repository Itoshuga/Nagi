import { describe, expect, it } from 'vitest';
import { placeSourceDefaults } from '../packages/shared/src/trip-places';
import {
  isOutsideTrip,
  overlappingTripItems,
  sortTripDays,
  suggestedTripZone,
  tripEditSchema,
  tripPoints,
  tripMapLongitudes,
  tripTimezoneSchema,
} from '../packages/shared/src/trip-planner';
import {
  calendarDateAt,
  dayRange,
  movedTripItems,
  optimisticTripItems,
} from '../apps/web/src/features/trips/planner-model';
import type { TripPlanItem } from '../packages/database/src/collaboration';

describe('Trip planner model', () => {
  it('previews item edits and deletions without mutating the server snapshot', () => {
    const item = {
      id: 'step',
      notes: 'Initial',
      start_time: null,
      end_time: null,
      estimated_duration_minutes: null,
      calendar_color: null,
    } as TripPlanItem;
    const result = optimisticTripItems([item], {
      operation: 'edit_item',
      data: {
        id: 'step',
        item_version: 1,
        notes: 'Modifié',
        start_time: '10:00',
        end_time: null,
        duration: 30,
      },
    });
    expect(result[0]).toMatchObject({
      notes: 'Modifié',
      start_time: '10:00',
      estimated_duration_minutes: 30,
    });
    expect(item.notes).toBe('Initial');
    expect(optimisticTripItems(result, { operation: 'delete_item', data: { id: 'step' } })).toEqual(
      [],
    );
  });
  it('uses calendar dates through DST and leaves undated days ordered', () => {
    expect(calendarDateAt('2027-03-27', 2)).toBe('2027-03-29');
    expect(dayRange('2027-03-27', '2027-03-29')).toBe(3);
    expect(isOutsideTrip('2027-03-29', '2027-03-27', '2027-03-28')).toBe(true);
    const days = [
      { id: 'pending-2', date: null, sort_order: 8, day_number: 1 },
      { id: 'dated-2', date: '2027-03-29', sort_order: 0, day_number: 2 },
      { id: 'pending-1', date: null, sort_order: 4, day_number: 3 },
      { id: 'dated-1', date: '2027-03-27', sort_order: 9, day_number: 4 },
    ];
    expect(sortTripDays(days).map((day) => day.id)).toEqual([
      'dated-1',
      'dated-2',
      'pending-1',
      'pending-2',
    ]);
    expect(suggestedTripZone('JP')).toBe('Asia/Tokyo');
    expect(suggestedTripZone('US')).toBe('UTC');
    expect(tripTimezoneSchema.safeParse('browser time').success).toBe(false);
  });

  it('reports actual local time overlaps and honors adjacent appointments', () => {
    const items = [
      {
        id: 'visit',
        start_time: '09:00:00',
        end_time: '11:00:00',
        estimated_duration_minutes: null,
      },
      { id: 'walk', start_time: '10:45:00', end_time: null, estimated_duration_minutes: 15 },
      {
        id: 'meal',
        start_time: '11:00:00',
        end_time: '12:00:00',
        estimated_duration_minutes: null,
      },
      { id: 'later', start_time: null, end_time: null, estimated_duration_minutes: 90 },
    ];
    expect([...overlappingTripItems(items)]).toEqual(['visit', 'walk']);
    expect(
      tripEditSchema.safeParse({
        operation: 'edit_item',
        data: {
          id: '69847ac8-0814-4ba9-8d71-ebf83c5a671a',
          item_version: 0,
          start_time: '14:00',
          end_time: '13:00',
          duration: null,
          notes: '',
        },
      }).success,
    ).toBe(false);
  });

  it('separates missing coordinates from valid markers and filters multiple cities', () => {
    const items = [
      { id: 'tokyo', trip_day_id: 'first', entry: { latitude: 35.7, longitude: 139.7 } },
      { id: 'kyoto', trip_day_id: 'second', entry: { latitude: 35.0, longitude: 135.8 } },
      { id: 'none', trip_day_id: 'second', entry: { latitude: 35, longitude: null } },
      { id: 'hidden', trip_day_id: null, entry: null },
      { id: 'zero', trip_day_id: null, entry: { latitude: 0, longitude: 0 } },
      { id: 'invalid', trip_day_id: null, entry: { latitude: 100, longitude: 0 } },
    ];
    expect(tripPoints(items, 'all').located.map(({ item }) => item.id)).toEqual([
      'tokyo',
      'kyoto',
      'zero',
    ]);
    expect(tripPoints(items, 'second').located.map(({ item }) => item.id)).toEqual(['kyoto']);
    expect(tripPoints(items, 'second').missing.map((item) => item.id)).toEqual(['none']);
    expect(tripPoints(items, 'pending').missing.map((item) => item.id)).toEqual([
      'hidden',
      'invalid',
    ]);
    expect(tripMapLongitudes([179, -179])).toEqual([179, 181]);
    expect(tripMapLongitudes([-4, 3])).toEqual([-4, 3]);
  });

  it('moves a step optimistically without mutating the saved projection', () => {
    const item = (id: string, day: string | null): TripPlanItem => ({
      ...placeSourceDefaults,
      id,
      trip_id: 'trip',
      trip_day_id: day,
      entry_id: id,
      added_by: null,
      notes: '',
      sort_order: 1024,
      created_at: '',
      updated_at: '',
      start_time: null,
      end_time: null,
      estimated_duration_minutes: null,
      version: 0,
      calendar_color: null,
      entry: null,
      stops: [],
    });
    const items = [item('old', null), item('anchor', 'day')];
    const moved = movedTripItems(items, 'old', { day: 'day', before: 'anchor' });
    expect(moved.map(({ id, trip_day_id }) => [id, trip_day_id])).toEqual([
      ['old', 'day'],
      ['anchor', 'day'],
    ]);
    expect(items[0]?.trip_day_id).toBeNull();
    expect(
      movedTripItems(moved, 'old', { day: null, before: null }).at(-1)?.trip_day_id,
    ).toBeNull();
  });
});
