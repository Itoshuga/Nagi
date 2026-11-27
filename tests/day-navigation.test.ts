import { describe, expect, it } from 'vitest';
import {
  navigationDayCounts,
  navigationDayDate,
  navigationScrollDelta,
} from '../apps/web/src/features/trips/day-navigation-model';

describe('Shared day navigation counts', () => {
  it('counts main occurrences independently, excluding their nested stops', () => {
    const items = [
      { trip_day_id: 'day-1', entry_id: 'same-place', stops: [{ id: 'shop' }, { id: 'cafe' }] },
      { trip_day_id: 'day-1', entry_id: 'same-place', stops: [] },
      { trip_day_id: 'day-2', stops: [] },
      { trip_day_id: null, stops: [{ id: 'pending-stop' }] },
      { stops: [] },
    ];
    expect(navigationDayCounts(items)).toEqual(
      new Map([
        ['all', 5],
        ['pending', 2],
        ['day-1', 2],
        ['day-2', 1],
      ]),
    );
    expect(items[0]!.stops).toHaveLength(2);
  });
  it('retains a useful global and pending count for an entirely empty itinerary', () => {
    expect(navigationDayCounts([])).toEqual(
      new Map([
        ['all', 0],
        ['pending', 0],
      ]),
    );
    expect(navigationDayCounts([]).get('empty-day') ?? 0).toBe(0);
  });
});
describe('Calendar dates independent of the browser timezone', () => {
  it.each([
    ['2028-12-22', '22 déc.'],
    ['2028-12-31', '31 déc.'],
    ['2029-01-01', '1 janv.'],
    ['2028-02-29', '29 févr.'],
  ])('keeps the literal trip date %s', (value, short) => {
    expect(navigationDayDate(value)).toMatchObject({ value, short });
    expect(navigationDayDate(value)?.full).toContain(value.slice(0, 4));
  });
  it.each([null, '', '2029-02-29', '2028-13-01', '2028-12-32', '2028-12-22T00:00:00Z'])(
    'omits missing or invalid dates without inventing a calendar day: %s',
    (value) => {
      expect(navigationDayDate(value)).toBeUndefined();
    },
  );
});
describe('Minimal scroll inside the day list', () => {
  const port = { top: 100, bottom: 400, left: 20, right: 200 };
  it('does not move an already visible selection', () => {
    expect(navigationScrollDelta(port, { top: 150, bottom: 192, left: 30, right: 190 })).toEqual({
      top: 0,
      left: 0,
    });
  });
  it('reveals a partly hidden day using only the missing distance', () => {
    expect(navigationScrollDelta(port, { top: 80, bottom: 122, left: 30, right: 190 })).toEqual({
      top: -20,
      left: 0,
    });
    expect(navigationScrollDelta(port, { top: 380, bottom: 422, left: 30, right: 190 })).toEqual({
      top: 22,
      left: 0,
    });
  });
  it('supports the same minimal reveal in the mobile horizontal strip', () => {
    expect(navigationScrollDelta(port, { top: 150, bottom: 192, left: 0, right: 112 })).toEqual({
      top: 0,
      left: -20,
    });
    expect(navigationScrollDelta(port, { top: 150, bottom: 192, left: 150, right: 262 })).toEqual({
      top: 0,
      left: 62,
    });
  });
});
