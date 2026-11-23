import { describe, expect, it } from 'vitest';
import {
  calendarEventPresentation,
  calendarLocalTime,
} from '../apps/web/src/features/trips/calendar-presentation';

describe('Calendar content budgets', () => {
  it('keeps short events readable and adds secondary details only when they fit', () => {
    expect(calendarEventPresentation(14, 180, false)).toEqual({ time: false, details: false });
    expect(calendarEventPresentation(44, 180, false)).toEqual({ time: true, details: false });
    expect(calendarEventPresentation(100, 180, false)).toEqual({ time: true, details: true });
  });
  it('reserves room for official attribution before adding Google event metadata', () => {
    expect(calendarEventPresentation(60, 170, true)).toEqual({ time: false, details: false });
    expect(calendarEventPresentation(75, 170, true)).toEqual({ time: true, details: false });
    expect(calendarEventPresentation(100, 170, true)).toEqual({ time: true, details: true });
    // An overlapping, narrow event uses the compact popover anchor.
    expect(calendarEventPresentation(44, 80, true)).toEqual({ time: true, details: false });
  });
});

describe('Trip-local calendar clock', () => {
  it('uses the travel date across midnight rather than the browser or UTC date', () => {
    expect(calendarLocalTime(new Date('2026-11-22T18:07:00Z'), 'Asia/Tokyo')).toEqual({
      date: '2026-11-23',
      minutes: 187,
      label: '03:07',
    });
    expect(calendarLocalTime(new Date('2026-11-23T02:07:00Z'), 'America/Los_Angeles')).toEqual({
      date: '2026-11-22',
      minutes: 1087,
      label: '18:07',
    });
  });
  it('places local midnight at the beginning of the day', () => {
    expect(calendarLocalTime(new Date('2026-11-22T15:00:00Z'), 'Asia/Tokyo')).toEqual({
      date: '2026-11-23',
      minutes: 0,
      label: '00:00',
    });
  });
  it('follows daylight saving changes while preserving the local scheduling scale', () => {
    expect(calendarLocalTime(new Date('2026-03-08T06:59:00Z'), 'America/New_York').label).toBe(
      '01:59',
    );
    expect(calendarLocalTime(new Date('2026-03-08T07:00:00Z'), 'America/New_York').label).toBe(
      '03:00',
    );
    expect(calendarLocalTime(new Date('2026-11-01T05:30:00Z'), 'America/New_York').minutes).toBe(
      90,
    );
    expect(calendarLocalTime(new Date('2026-11-01T06:30:00Z'), 'America/New_York').minutes).toBe(
      90,
    );
  });
});
