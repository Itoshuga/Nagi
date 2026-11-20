import { describe, expect, it } from 'vitest';
import {
  calendarEventColor,
  calendarHexSchema,
  calendarHexToHsv,
  calendarPresets,
  calendarSwatchInk,
  hsvToCalendarHex,
  normalizeCalendarHex,
} from '../packages/shared/src/calendar-colors';
import { tripEditSchema } from '../packages/shared/src/trip-planner';
import { optimisticTripItems } from '../apps/web/src/features/trips/planner-model';
import {
  calendarScheduleFields,
  movedCalendarSchedule,
  resizedCalendarSchedule,
} from '../apps/web/src/features/trips/calendar-model';
import type { TripPlanItem } from '../packages/database/src/collaboration';

const item = {
  id: '11111111-1111-4111-8111-111111111111',
  trip_day_id: 'day',
  start_time: '11:00',
  end_time: null,
  estimated_duration_minutes: 60,
  calendar_color: '#D98FA6',
  notes: 'Billets',
  stops: [{ id: 'stop', duration_minutes: 45 }],
} as TripPlanItem;
describe('Calendar colors and precise local scheduling', () => {
  it.each([
    'red',
    'var(--primary)',
    'url(https://example.test)',
    '#FFF;background:red',
    '#12345',
    '#12345678',
    '',
  ])('rejects CSS input %s', (value) => {
    expect(calendarHexSchema.safeParse(value).success).toBe(false);
  });
  it('normalizes hexadecimal colors and keeps the Nagi accent in the preset palette', () => {
    expect(normalizeCalendarHex(' d98fa6 ')).toBe('#D98FA6');
    expect(normalizeCalendarHex('#abc')).toBe('#AABBCC');
    expect(calendarPresets).toHaveLength(4);
    expect(calendarPresets[0].hex).toBe('#73A6DF');
    expect(calendarEventColor(null, '#a28bc9')).toBe('#A28BC9');
  });
  it('keeps selection marks visible on light, medium and dark swatches', () => {
    expect(calendarSwatchInk('#FFFFFF')).toBe('#142B48');
    expect(calendarSwatchInk('#69AA91')).toBe('#142B48');
    expect(calendarSwatchInk('#000000')).toBe('#FFFFFF');
  });
  it.each(['#000000', '#FFFFFF', '#D98FA6', '#73A6DF', '#FF0000', '#00FF00', '#0000FF'])(
    'synchronizes the HSV picker with %s',
    (hex) => {
      expect(hsvToCalendarHex(calendarHexToHsv(hex))).toBe(hex);
    },
  );
  it('updates one occurrence optimistically and leaves the original snapshot and stops intact', () => {
    const other = { ...item, id: 'other' };
    const changed = optimisticTripItems([item, other], {
      operation: 'color_item',
      data: { id: item.id, item_version: 0, color: '#69AA91' },
    });
    expect(changed[0]?.calendar_color).toBe('#69AA91');
    expect(changed[1]?.calendar_color).toBe('#D98FA6');
    expect(item.calendar_color).toBe('#D98FA6');
    expect(changed[0]?.stops).toBe(item.stops);
  });
  it('moves by 15-minute snaps, preserves duration, and changes day atomically', () => {
    const moved = movedCalendarSchedule(item, 'next', 193);
    expect(moved).toEqual({ day: 'next', start: 855, end: 915, duration: 60 });
    expect(calendarScheduleFields(moved)).toEqual({
      day: 'next',
      start_time: '14:15',
      end_time: '15:15',
      duration: 60,
    });
    expect(movedCalendarSchedule(item, 'next', 9999)).toMatchObject({
      start: 1380,
      end: 1440,
      duration: 60,
    });
    expect(item.start_time).toBe('11:00');
  });
  it('resizes the top while preserving the end and the bottom while preserving the start', () => {
    expect(resizedCalendarSchedule(item, 'start', 30)).toMatchObject({
      start: 690,
      end: 720,
      duration: 30,
    });
    expect(resizedCalendarSchedule(item, 'end', 30)).toMatchObject({
      start: 660,
      end: 750,
      duration: 90,
    });
    expect(resizedCalendarSchedule(item, 'start', 1000)).toMatchObject({
      start: 705,
      end: 720,
      duration: 15,
    });
    expect(calendarScheduleFields(resizedCalendarSchedule(item, 'end', 9999))).toMatchObject({
      end_time: null,
      duration: 780,
    });
    expect(item.stops[0]?.duration_minutes).toBe(45);
  });
  it('accepts null as an explicit reset and validates color versions before a write', () => {
    expect(
      tripEditSchema.safeParse({
        operation: 'color_item',
        data: { id: item.id, item_version: 0, color: null },
      }).success,
    ).toBe(true);
    expect(
      tripEditSchema.safeParse({
        operation: 'color_item',
        data: { id: item.id, item_version: -1, color: '#73A6DF' },
      }).success,
    ).toBe(false);
  });
});
