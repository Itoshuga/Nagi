import { describe, expect, it } from 'vitest';
import type { TripPlan, EntryCardRow } from '../packages/database/src';
import { suggestedVisitDuration } from '../packages/shared/src/trip-catalog-duration';
import { tripEditSchema } from '../packages/shared/src/trip-planner';
import {
  catalogCalendarSchedule,
  catalogPlacement,
  catalogVisitChange,
  sourceVisitChange,
  type CatalogDragData,
} from '../apps/web/src/features/trips/catalog-drag';
import { optimisticTripChange } from '../apps/web/src/features/trips/mutation-model';
import { visibleTripItems } from '../apps/web/src/features/trips/planner-model';

const entry = { id: '0000000a-1111-4111-8111-111111111111', title: 'PARCO' } as EntryCardRow;
const id = (n: number) => `0000000${n}-2222-4222-8222-222222222222`;
const plan = {
  id: id(0),
  version: 0,
  days: [{ id: id(1) }],
  items: [],
  connections: [],
} as unknown as TripPlan;
const source: CatalogDragData = {
  type: 'catalog-entry',
  provider: 'nagi',
  entry,
  defaultDuration: 30,
};
const event = (target?: object, y = 112) =>
  ({
    over: target
      ? { data: { current: target }, rect: { top: 0, left: 0, right: 400, bottom: 2000 } }
      : null,
    activatorEvent: { clientX: 100, clientY: y },
    delta: { x: 0, y: 0 },
  }) as unknown as Parameters<typeof catalogPlacement>[2];

describe('Reusable catalogue visit placement', () => {
  it('creates Google calendar occurrences through the same clock placement and clips at midnight', () => {
    const place = { source: 'google' as const, placeId: 'google-place-example' };
    const drag: CatalogDragData = { ...source, provider: 'google', reference: place };
    const placement = catalogPlacement(
      plan,
      drag,
      event({ type: 'calendar', day: id(1) }, (870 * 56) / 60),
    )!;
    const change = sourceVisitChange(place, placement, id(2));
    expect(change.success && change.data).toMatchObject({
      operation: 'add_place',
      data: { place, day: id(1), start_time: '14:30', duration: 30 },
    });
    expect(
      sourceVisitChange(place, { day: id(1), time: '23:45', duration: 60 }, id(3)),
    ).toMatchObject({ success: true, data: { data: { start_time: '23:45', duration: 15 } } });
  });
  it('validates and normalizes custom authored data before an optimistic insertion', () => {
    const valid = sourceVisitChange(
      {
        source: 'custom',
        title: '  Pause libre  ',
        location: ' Hall ',
        latitude: null,
        longitude: null,
      },
      { day: null },
      id(2),
      { color: '#739fd0', notes: 'Notes' },
    );
    expect(valid).toMatchObject({
      success: true,
      data: {
        data: {
          place: { title: 'Pause libre', location: 'Hall' },
          color: '#739FD0',
          notes: 'Notes',
        },
      },
    });
    expect(
      sourceVisitChange(
        { source: 'custom', title: ' ', location: '', latitude: null, longitude: null },
        { day: null },
        id(2),
      ).success,
    ).toBe(false);
  });
  it('retains long Google address references without truncating them', () => {
    const placeId = 'E'.repeat(4000),
      change = sourceVisitChange({ source: 'google', placeId }, { day: null }, id(2));
    expect(change).toMatchObject({
      success: true,
      data: { data: { place: { source: 'google', placeId } } },
    });
  });
  it('snaps the actual pointer to 15 minutes, independently of the grabbed card position', () => {
    const target = { type: 'calendar', day: id(1) };
    const at1430 = event(target, (870 * 56) / 60);
    expect(catalogCalendarSchedule(source, at1430)).toEqual({
      day: id(1),
      start: 870,
      duration: 30,
      end: 900,
    });
    expect(catalogPlacement(plan, source, at1430)).toEqual({
      day: id(1),
      time: '14:30',
      duration: 30,
    });
    expect(
      catalogCalendarSchedule(
        { ...source, entry: { ...entry, suggested_duration_minutes: 90 } },
        at1430,
      )?.end,
    ).toBe(960);
    expect(catalogCalendarSchedule(source, event(target, 9999))).toEqual({
      day: id(1),
      start: 1425,
      duration: 15,
      end: 1440,
    });
  });
  it('never chooses a fallback for a missing, foreign, or ambiguous nesting destination', () => {
    expect(catalogPlacement(plan, source, event())).toBeUndefined();
    expect(
      catalogPlacement(plan, source, event({ day: null, before: null }), { x: 600, y: -10 }),
    ).toBeUndefined();
    expect(catalogPlacement(plan, source, event({ day: id(9), before: null }))).toBeUndefined();
    expect(
      catalogPlacement(plan, source, event({ type: 'activity', parent: id(1) })),
    ).toBeUndefined();
    expect(catalogPlacement(plan, source, event({ day: id(1), before: id(9) }))).toBeUndefined();
    expect(catalogPlacement(plan, source, event({ day: null, before: null }))).toEqual({
      day: null,
      before: null,
    });
  });
  it('inserts unscheduled visits exactly between timed visits without changing their clocks', () => {
    let next = optimisticTripChange(
      plan,
      catalogVisitChange(entry, { day: id(1), time: '09:00' }, id(2)),
      'viewer',
      entry,
    );
    next = optimisticTripChange(
      next,
      catalogVisitChange(entry, { day: id(1), time: '12:00' }, id(3)),
      'viewer',
      entry,
    );
    const change = catalogVisitChange(entry, { day: id(1), before: id(3) }, id(4));
    expect(tripEditSchema.safeParse(change).success).toBe(true);
    next = optimisticTripChange(next, change, 'viewer', entry);
    expect(visibleTripItems(next, id(1)).map((i) => [i.id, i.start_time])).toEqual([
      [id(2), '09:00'],
      [id(4), null],
      [id(3), '12:00'],
    ]);
    next = optimisticTripChange(
      next,
      catalogVisitChange(entry, { day: id(1), before: id(2) }, id(5)),
      'viewer',
      entry,
    );
    expect(visibleTripItems(next, id(1)).map((i) => i.id)).toEqual([id(5), id(2), id(4), id(3)]);
    const changed = optimisticTripChange(
      next,
      {
        operation: 'patch_item',
        data: { id: id(4), patch: { notes: 'Unique', calendar_color: '#73A6DF' } },
      },
      'viewer',
    );
    expect(
      changed.items
        .filter((i) => i.id !== id(4))
        .every((i) => i.notes === '' && i.calendar_color === null),
    ).toBe(true);
  });
  it('creates independent repeat stops at a chosen position, including the same reference as the parent', () => {
    let next = optimisticTripChange(
      plan,
      catalogVisitChange(entry, { day: id(1) }, id(2)),
      'viewer',
      entry,
    );
    for (const n of [3, 4])
      next = optimisticTripChange(
        next,
        catalogVisitChange(entry, { day: id(1), parent: id(2) }, id(n)),
        'viewer',
        entry,
      );
    const placement = catalogPlacement(
      next,
      source,
      event({ type: 'stop', parent: id(2), before: id(3) }),
    )!;
    next = optimisticTripChange(next, catalogVisitChange(entry, placement, id(5)), 'viewer', entry);
    expect(next.items[0]?.stops.map((s) => s.id)).toEqual([id(5), id(3), id(4)]);
    expect(next.items[0]?.estimated_duration_minutes).toBeNull();
  });
});

describe('Suggested visit durations', () => {
  const field = { id: 'duration', key: 'duree-visite', label: 'Durée de visite' };
  it('uses only an explicit duration with a known unit', () => {
    expect(suggestedVisitDuration([field], { duration: '1 h 30' })).toBe(90);
    expect(suggestedVisitDuration([field], { duration: '45 minutes' })).toBe(45);
    expect(
      suggestedVisitDuration([{ ...field, key: 'visit-duration-minutes' }], { duration: 75 }),
    ).toBe(75);
    for (const duration of [45, '1–2 heures', '9:00–18:00', '20€', '45', null, 1500])
      expect(suggestedVisitDuration([field], { duration })).toBeNull();
    expect(
      suggestedVisitDuration([{ ...field, key: 'opening-hours', label: 'Horaires' }], {
        duration: '2 h',
      }),
    ).toBeNull();
  });
});
