import { describe, expect, it } from 'vitest';
import type { TripPlanItem } from '../packages/database/src/collaboration';
import {
  tripCollision,
  tripDragSource,
  tripDropChange,
  tripDropFeedback,
} from '../apps/web/src/features/trips/planner-dnd';

const rect = (top: number, height: number) => ({
  top,
  bottom: top + height,
  left: 0,
  right: 400,
  width: 400,
  height,
});
function collisions(y: number | null, active = 'source', type = 'item', reference?: object) {
  const targets = [
    { id: 'step:parent', data: { day: 'day', before: 'parent' }, rect: rect(100, 100) },
    {
      id: 'activity:parent',
      data: { type: 'activity', parent: 'parent', title: 'PARCO' },
      rect: rect(110, 80),
    },
    { id: 'before:parent', data: { day: 'day', before: 'parent' }, rect: rect(96, 4) },
  ];
  return tripCollision({
    active: {
      id: active,
      data: { current: { type, reference } },
      rect: { current: { initial: null, translated: null } },
    },
    pointerCoordinates: y === null ? null : { x: 200, y },
    collisionRect: rect(125, 40),
    droppableRects: new Map(targets.map((target) => [target.id, target.rect])),
    droppableContainers: targets.map((target) => ({
      id: target.id,
      key: target.id,
      disabled: false,
      node: { current: null },
      rect: { current: target.rect },
      data: { current: target.data },
    })),
  }).map((hit) => hit.id);
}

describe('Itinerary drop intentions', () => {
  it('accepts an external creation reference at the activity centre while preserving catalogue drop zones', () => {
    expect(
      collisions(150, 'new', 'catalog-entry', {
        source: 'mapbox',
        placeId: 'mapbox-place-example',
        query: 'My search',
      })[0],
    ).toBe('activity:parent');
    expect(collisions(150, 'new', 'catalog-entry')).not.toContain('activity:parent');
  });
  const parent = {
    id: 'parent',
    entry_id: 'parco',
    stops: [
      { id: 'child', entry_id: 'nintendo' },
      { id: 'second', entry_id: 'sega' },
    ],
  } as TripPlanItem;
  const other = { id: 'other', entry_id: 'museum', stops: [] } as unknown as TripPlanItem;
  const items = [parent, other];
  it('identifies a stop independently from the rendered draggable instance', () => {
    const source = tripDragSource(items, { type: 'stop', id: 'child' }, 'stop-drag:child:instance');
    expect(source?.card.id).toBe('child');
    expect(source?.parent?.id).toBe('parent');
  });
  it('detaches a stop onto a lane and transfers it onto another activity', () => {
    const source = tripDragSource(items, { type: 'stop', id: 'child' })!;
    expect(tripDropChange(items, source, { day: 'next-day', before: null }).change).toEqual({
      operation: 'relocate_stop',
      data: { kind: 'activity', id: 'child', day: 'next-day', before: null },
    });
    expect(
      tripDropChange(items, source, { type: 'activity', parent: 'other', title: 'Musée' }).change,
    ).toEqual({
      operation: 'relocate_stop',
      data: { kind: 'stop', id: 'child', parent: 'other', before: null },
    });
  });
  it('reorders within a group and ignores a drop onto the same stop', () => {
    const source = tripDragSource(items, { type: 'stop', id: 'second' })!;
    expect(
      tripDropChange(items, source, {
        type: 'stop',
        parent: 'parent',
        before: 'child',
        title: 'PARCO',
      }).change,
    ).toMatchObject({
      operation: 'relocate_stop',
      data: { kind: 'stop', parent: 'parent', before: 'child' },
    });
    expect(
      tripDropChange(items, source, {
        type: 'stop',
        parent: 'parent',
        before: 'second',
        title: 'PARCO',
      }),
    ).toEqual({});
  });
  it('inserts an activity at a chosen stop position', () => {
    expect(
      tripDropChange(
        items,
        { card: other },
        { type: 'stop', parent: 'parent', before: 'child', title: 'PARCO' },
      ).change,
    ).toEqual({ operation: 'nest_item', data: { id: 'other', parent: 'parent', before: 'child' } });
  });
  it('prioritizes nesting on the centre of an activity card', () => {
    expect(collisions(150)[0]).toBe('activity:parent');
  });
  it('keeps ordering at the card edges and between cards', () => {
    expect(collisions(115)[0]).toBe('step:parent');
    expect(collisions(98)[0]).toBe('before:parent');
  });
  it('does not offer nesting into the dragged activity itself', () => {
    expect(collisions(150, 'parent')).not.toContain('activity:parent');
  });
  it('keeps keyboard dragging focused on moving activities', () => {
    expect(collisions(null)).toContain('step:parent');
    expect(collisions(null)).not.toContain('activity:parent');
  });
  it('never nests a catalogue reference through the main activity card', () => {
    expect(collisions(150, 'catalog:parco', 'catalog-entry')[0]).toBe('step:parent');
    expect(
      tripDragSource(items, { type: 'catalog-entry', entry: parent.entry_id }),
    ).toBeUndefined();
  });
  it('cancels when the pointer leaves the itinerary', () => {
    expect(collisions(500)).toEqual([]);
  });
});

describe('itinerary drop feedback', () => {
  const step = {
    id: 'visit',
    trip_day_id: 'day',
    entry_id: 'place',
    entry: { title: 'Shibuya Parco' },
    start_time: '09:00:00',
    stops: [],
  } as unknown as TripPlanItem;
  const parent = {
    ...step,
    id: 'parent',
    entry: { title: 'Nintendo' },
    stops: [{ id: 'child', entry_id: 'place' }],
  } as TripPlanItem;
  const plan = { items: [step, parent], days: [{ id: 'day' }, { id: 'next' }] } as Parameters<
    typeof tripDropFeedback
  >[0];
  it('describes a real insertion without adding a clock', () => {
    const original = JSON.stringify(plan);
    expect(
      tripDropFeedback(plan, { type: 'catalog-entry', entry: { id: 'place' } }, 'catalog:place', {
        day: 'day',
        before: 'visit',
      }),
    ).toEqual({ valid: true, label: 'Insérer avant Shibuya Parco' });
    expect(JSON.stringify(plan)).toBe(original);
  });
  it('rejects stale day and occurrence targets and a drop onto the dragged occurrence', () => {
    expect(
      tripDropFeedback(plan, { type: 'catalog-entry' }, 'catalog', {
        day: 'deleted',
        before: null,
      }),
    ).toBeUndefined();
    expect(
      tripDropFeedback(plan, { type: 'catalog-entry' }, 'catalog', {
        day: 'day',
        before: 'deleted',
      }),
    ).toBeUndefined();
    expect(
      tripDropFeedback(plan, { type: 'item', id: 'visit' }, 'visit', {
        day: 'day',
        before: 'visit',
      }),
    ).toBeUndefined();
  });
  it('distinguishes explicit catalogue stop zones from a main row and allows another occurrence of the same place', () => {
    const data = { type: 'catalog-entry', entry: { id: 'place' } };
    expect(
      tripDropFeedback(plan, data, 'catalog', {
        type: 'activity',
        parent: 'parent',
        title: 'Nintendo',
      }),
    ).toBeUndefined();
    expect(
      tripDropFeedback(plan, data, 'catalog', {
        type: 'stop',
        parent: 'parent',
        before: null,
        title: 'Nintendo',
      }),
    ).toEqual({ valid: true, label: 'Ajouter comme arrêt' });
    expect(
      tripDropFeedback({ ...plan, stopsAvailable: false }, data, 'catalog', {
        type: 'stop',
        parent: 'parent',
        before: null,
        title: 'Nintendo',
      }),
    ).toBeUndefined();
  });
  it('does not advertise a valid nesting destination for an activity containing stops', () => {
    expect(
      tripDropFeedback(plan, { type: 'item', id: 'parent' }, 'parent', {
        type: 'activity',
        parent: 'visit',
        title: 'Parco',
      }),
    ).toMatchObject({ valid: false, label: expect.stringContaining('contient déjà des arrêts') });
  });
  it('labels extracting and reordering an existing stop as distinct operations', () => {
    expect(
      tripDropFeedback(plan, { type: 'stop', id: 'child' }, 'stop-drag:child:instance', {
        day: 'next',
        before: null,
      }),
    ).toEqual({ valid: true, label: 'Remettre cet arrêt en étape' });
    expect(
      tripDropFeedback(plan, { type: 'stop', id: 'child' }, 'stop-drag:child:instance', {
        type: 'stop',
        parent: 'parent',
        before: null,
        title: 'Nintendo',
      }),
    ).toEqual({ valid: true, label: 'Réordonner les arrêts' });
  });
  it('explains that moving timed activities preserves chronological order', () => {
    const another = { ...step, id: 'later', start_time: '14:30' };
    expect(
      tripDropFeedback(
        { ...plan, items: [step, parent, another] },
        { type: 'item', id: 'later' },
        'later',
        { day: 'day', before: 'visit' },
      ),
    ).toMatchObject({
      valid: true,
      label: expect.stringContaining('ordre chronologique conservé'),
    });
    expect(
      tripDropFeedback(plan, { type: 'item', id: 'parent' }, 'parent', {
        day: 'day',
        before: 'visit',
      })?.label,
    ).toContain('avant Shibuya Parco');
  });
});
