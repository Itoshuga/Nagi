import { describe, expect, it } from 'vitest';
import {
  formatTripDuration,
  formatTripTime,
  tripDayLabel,
  tripStepCount,
  tripStopsSummary,
} from '../packages/shared/src/trip-format';

describe('Travel planning labels', () => {
  it.each([
    [15, '15 min'],
    [30, '30 min'],
    [60, '1 h'],
    [65, '1 h 05'],
    [90, '1 h 30'],
    [120, '2 h'],
    [150, '2 h 30'],
  ])('formats %i minutes as %s everywhere', (minutes, label) => {
    expect(formatTripDuration(minutes)).toBe(label);
  });
  it('keeps unknown times and durations unset rather than displaying a fictional schedule', () => {
    expect(formatTripDuration(null)).toBeNull();
    expect(formatTripDuration(undefined)).toBeNull();
    expect(formatTripDuration(-1)).toBeNull();
    expect(formatTripTime(null)).toBeNull();
    expect(formatTripTime('08:30:00')).toBe('08:30');
  });
  it('separates the main activity count from its included stops', () => {
    expect(tripStepCount(0)).toBe('Aucune étape');
    expect(tripStepCount(1)).toBe('1 étape');
    expect(tripStepCount(2)).toBe('2 étapes');
    expect(tripStopsSummary(1, 30)).toBe('1 arrêt · 30 min incluses');
    expect(tripStopsSummary(2, 60)).toBe('2 arrêts · 1 h incluse');
    expect(tripStopsSummary(3, 75)).toBe('3 arrêts · 1 h 15 incluses');
    expect(tripStopsSummary(1, null)).toBe('1 arrêt');
    expect(tripDayLabel('2028-12-22')).toBe('Vendredi 22 décembre');
  });
});
