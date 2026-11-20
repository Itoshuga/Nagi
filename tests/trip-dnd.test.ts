import { describe, expect, it } from 'vitest';
import type { TripPlanItem } from '../packages/database/src/collaboration';
import {
  tripCollision,
  tripDragSource,
  tripDropChange,
} from '../apps/web/src/features/trips/planner-dnd';

const rect = (top: number, height: number) => ({
  top,
  bottom: top + height,
  left: 0,
  right: 400,
  width: 400,
  height,
});
function collisions(y: number | null, active = 'source', type = 'item') {
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
      data: { current: { type } },
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
