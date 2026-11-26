import { pointerWithin, rectIntersection, type CollisionDetection } from '@dnd-kit/core';
import type { TripPlan, TripPlanItem, TripPlanStop } from '@nagi/database';
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

/** Describes the existing mutation rather than implying a different operation. */
export function tripDropFeedback(
  plan: Pick<TripPlan, 'items' | 'days' | 'stopsAvailable'>,
  data: Record<string, unknown> | undefined,
  activeId: string | number,
  target: (LanePosition | ActivityDrop | StopDrop) & { title?: string },
): { valid: boolean; label: string } | undefined {
  const catalog = data?.type === 'catalog-entry';
  const nested = isActivityDrop(target) || isStopDrop(target);
  if (nested) {
    const parent = plan.items.find((item) => item.id === target.parent);
    if (
      !parent ||
      plan.stopsAvailable === false ||
      (isStopDrop(target) &&
        target.before &&
        !parent.stops.some((stop) => stop.id === target.before))
    )
      return;
    if (catalog && isActivityDrop(target) && !data?.reference) return;
  } else if (
    (target.day && !plan.days.some((day) => day.id === target.day)) ||
    (target.before &&
      !plan.items.some((item) => item.id === target.before && item.trip_day_id === target.day))
  )
    return;
  const source = catalog ? undefined : tripDragSource(plan.items, data, activeId);
  if (!catalog) {
    if (!source) return;
    const result = tripDropChange(plan.items, source, target);
    if (result.error) return { valid: false, label: result.error };
    if (!result.change) return;
  }
  if (nested) {
    const parent = plan.items.find((item) => item.id === target.parent)!;
    const sameParent = source?.parent?.id === parent.id;
    return { valid: true, label: sameParent ? 'Réordonner les arrêts' : 'Ajouter comme arrêt' };
  }
  const following = plan.items.find((item) => item.id === target.before);
  // Timed activities keep their clocks and their chronological order.
  if (
    source &&
    'start_time' in source.card &&
    source.card.start_time &&
    following?.start_time &&
    source.card.start_time.slice(0, 5) !== following.start_time.slice(0, 5)
  )
    return { valid: true, label: 'Déplacer ici · ordre chronologique conservé' };
  if (source?.parent) return { valid: true, label: 'Remettre cet arrêt en étape' };
  if (following)
    return {
      valid: true,
      label: `${catalog ? 'Insérer' : 'Déplacer'} avant ${target.title ?? following.entry?.title ?? following.custom_title ?? 'cette étape'}`,
    };
  const index = plan.days.findIndex((day) => day.id === target.day);
  return {
    valid: true,
    label: target.day
      ? `${catalog ? 'Ajouter' : 'Déplacer'} en fin du jour ${index + 1}`
      : 'Garder dans « À organiser »',
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
        (!pointed ||
          !!pointed.closest(`[data-calendar-zone="${container.data.current.zone ?? 'timed'}"]`))
      );
    if (catalog && !args.active.data.current?.reference && isActivityDrop(container.data.current))
      return false;
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
    if (target?.type === 'calendar') return target.before ? 7 : 6;
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
