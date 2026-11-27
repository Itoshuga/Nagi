import { formatTripDuration } from '@nagi/shared';
import { activityStops, itemDuration, stepTime } from './planner-model';
import type { RouteSegment, RouteVisit } from './map-route-model';

export type MapSelection = { id: string; type: 'step' | 'stop' };
export function selectedMapVisit(
  visits: RouteVisit[],
  itemId?: string,
  stopId?: string,
): MapSelection | undefined {
  // The shared planner supplies a parent ID alongside a selected stop. Never
  // fall back to that parent when the stop is absent from the current day.
  const visit = stopId
    ? visits.find((v) => v.id === stopId && v.stop)
    : visits.find((v) => v.id === itemId && !v.stop);
  return visit ? { id: visit.id, type: visit.stop ? 'stop' : 'step' } : undefined;
}
export const mapVisitTitle = (visit: RouteVisit) =>
  visit.entry?.title ??
  (visit.stop ?? visit.parent).custom_title ??
  ((visit.stop ?? visit.parent).source === 'mapbox' ? 'Lieu Mapbox' : 'Fiche indisponible');
export function mapSidebarRows(visits: RouteVisit[], segments: RouteSegment[] = []) {
  const times = new Map<string, string | null>();
  const parents = new Set<string>();
  const titles = new Map(visits.map((visit) => [visit.id, mapVisitTitle(visit)]));
  const outgoing = new Map(segments.map((segment) => [segment.from.at(-1), segment]));
  for (const visit of visits)
    if (!parents.has(visit.parent.id)) {
      parents.add(visit.parent.id);
      for (const { stop, time } of activityStops(visit.parent)) times.set(stop.id, time);
    }
  return visits.map((visit) => {
    const row = visit.stop ?? visit.parent;
    const time = visit.stop
      ? times.get(visit.id)
        ? `≈ ${times.get(visit.id)}`
        : ''
      : stepTime(visit.parent);
    const segment = outgoing.get(visit.id);
    return {
      visit,
      type: visit.stop ? ('stop' as const) : ('step' as const),
      title: mapVisitTitle(visit),
      time,
      duration: formatTripDuration(
        visit.stop ? visit.stop.duration_minutes : itemDuration(visit.parent),
      ),
      location:
        visit.entry?.neighborhood?.name ??
        visit.entry?.city?.name ??
        (row.source === 'custom' ? row.custom_location : null),
      parentTitle:
        titles.get(visit.parent.id) ??
        visit.parent.entry?.title ??
        visit.parent.custom_title ??
        'cette étape',
      segment,
      nextTitle: segment ? (titles.get(segment.to[0]!) ?? 'Lieu suivant') : undefined,
    };
  });
}
export type MapSidebarRow = ReturnType<typeof mapSidebarRows>[number];
export function mapRouteHighlights(
  segments: RouteSegment[],
  selectedId?: string,
  highlightedId?: string,
  hoveredSegment?: string,
) {
  const hoveredLeg = segments.some((segment) => segment.id === hoveredSegment)
    ? hoveredSegment
    : undefined;
  return new Map(
    segments.map((segment) => [
      segment.id,
      (
        hoveredLeg
          ? hoveredLeg === segment.id
          : highlightedId && [...segment.from, ...segment.to].includes(highlightedId)
      )
        ? ('hovered' as const)
        : selectedId && [...segment.from, ...segment.to].includes(selectedId)
          ? ('selected' as const)
          : undefined,
    ]),
  );
}
