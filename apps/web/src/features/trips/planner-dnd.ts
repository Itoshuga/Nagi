import { pointerWithin, rectIntersection, type CollisionDetection } from '@dnd-kit/core';
import type { TripPlanItem, TripPlanStop } from '@nagi/database';
import type { TripEdit } from '@nagi/shared';
import { activityNestingIssue, type LanePosition } from './planner-model';

export type ActivityDrop = { type: 'activity'; parent: string; title: string };
export type StopDrop = { type: 'stop'; parent: string; before: string | null; title: string };
export type TripDragData = { type: 'item' | 'stop' | 'calendar-item'; id: string };
export type TripDragSourceData = TripDragData | import('./catalog-drag').CatalogDragData;
export type TripDragSource = { card: TripPlanItem | TripPlanStop; parent?: TripPlanItem };
export const isActivityDrop = (data: unknown): data is ActivityDrop =>
  !!data && typeof data === 'object' && 'type' in data && data.type === 'activity';
export const isStopDrop = (data: unknown): data is StopDrop =>
  !!data && typeof data === 'object' && 'type' in data && data.type === 'stop';

export function tripDragSource(
  items: TripPlanItem[],
  data: Record<string, unknown> | undefined,
  activeId?: string | number,
): TripDragSource | undefined {
  if (data?.type === 'catalog-entry') return undefined;
  const id = typeof data?.id === 'string' ? data.id : String(activeId ?? '');
  if (data?.type === 'stop') {
    const parent = items.find((item) => item.stops?.some((stop) => stop.id === id));
    const card = parent?.stops.find((stop) => stop.id === id);
    return card ? { card, parent } : undefined;
  }
  const card = items.find((item) => item.id === id);
  return card ? { card } : undefined;
}

export function tripDropChange(
  items: TripPlanItem[],
  source: TripDragSource,
  target: LanePosition | ActivityDrop | StopDrop,
): { change?: TripEdit; error?: string } {
  if (isActivityDrop(target) || isStopDrop(target)) {
    const parent = items.find((item) => item.id === target.parent);
    if (!parent) return {};
    const error = activityNestingIssue(source.card, parent);
    if (error) return { error };
    const before = isStopDrop(target) ? target.before : null;
    if (source.parent && before === source.card.id) return {};
    return {
      change: source.parent
        ? {
            operation: 'relocate_stop',
            data: { kind: 'stop', id: source.card.id, parent: parent.id, before },
          }
        : { operation: 'nest_item', data: { id: source.card.id, parent: parent.id, before } },
    };
  }
  if (!source.parent && target.before === source.card.id) return {};
  return {
    change: source.parent
      ? {
          operation: 'relocate_stop',
          data: { kind: 'activity', id: source.card.id, day: target.day, before: target.before },
        }
      : {
          operation: 'move_item',
          data: { id: source.card.id, day: target.day, before: target.before },
        },
  };
}

// The centre of the card nests the activity; its edges keep the existing reorder
// behaviour. Keyboard movement uses lanes, with nesting also available in a menu.
export const tripCollision: CollisionDetection = (args) => {
  const catalog = args.active.data.current?.type === 'catalog-entry';
  const pointed =
    args.pointerCoordinates && typeof document !== 'undefined'
      ? document.elementFromPoint(args.pointerCoordinates.x, args.pointerCoordinates.y)
      : null;
  const surface = pointed?.closest('.trip-workspace-canvas,.trip-day-navigation');
  if (args.pointerCoordinates && typeof document !== 'undefined' && !surface) return [];

  const containers = args.droppableContainers.filter((container) => {
    const node = container.node.current;
    if (surface && node && !surface.contains(node)) return false;
    if (container.data.current?.type === 'calendar')
      return (
        (catalog || args.active.data.current?.type === 'calendar-item') &&
        (!pointed || !!pointed.closest('.trip-calendar-scroll'))
      );
    if (catalog && isActivityDrop(container.data.current)) return false;
    if (isStopDrop(container.data.current)) {
      return !!args.pointerCoordinates || args.active.data.current?.type === 'stop';
    }
    if (!isActivityDrop(container.data.current)) return true;
    if (container.data.current.parent === args.active.id || !args.pointerCoordinates) return false;
    const rect = args.droppableRects.get(container.id);
    return (
      !!rect &&
      args.pointerCoordinates.y >= rect.top + rect.height * 0.22 &&
      args.pointerCoordinates.y <= rect.bottom - rect.height * 0.22
    );
  });
  const filtered = { ...args, droppableContainers: containers };
  const hits = pointerWithin(filtered);
  const priority = (id: string | number) => {
    const target = containers.find((container) => container.id === id)?.data.current;
    if (target?.type === 'calendar') return 6;
    return isStopDrop(target)
      ? target.before
        ? 4
        : 2
      : isActivityDrop(target)
        ? 3
        : String(id).startsWith('before:')
          ? 1
          : 0;
  };
  return hits.length
    ? hits.sort((a, b) => priority(b.id) - priority(a.id))
    : args.pointerCoordinates
      ? []
      : rectIntersection(filtered);
};
