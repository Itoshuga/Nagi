import { describe, expect, it } from 'vitest';
import {
  mapRouteHighlights,
  mapSidebarRows,
  selectedMapVisit,
} from '../apps/web/src/features/trips/map-sidebar-model';
import { tripMapVisits } from '../apps/web/src/features/trips/planner-model';
import type { TripPlanItem } from '../packages/database/src/collaboration';
import type { RouteSegment } from '../apps/web/src/features/trips/map-route-model';
const parent = {
  id: 'parent',
  source: 'nagi',
  start_time: '09:00',
  end_time: null,
  estimated_duration_minutes: 120,
  entry: { title: 'PARCO', city: { name: 'Tokyo' }, neighborhood: { name: 'Shibuya' } },
  stops: [
    {
      id: 'shop',
      duration_minutes: 30,
      entry: { title: 'Pokémon Center', latitude: 35, longitude: 139 },
    },
    { id: 'cafe', duration_minutes: null, entry: { title: 'Café' } },
    { id: 'unknown', duration_minutes: 15, entry: null },
  ],
} as unknown as TripPlanItem;
const next: TripPlanItem = {
  ...parent,
  id: 'next',
  entry: { ...parent.entry!, title: 'Tower' },
  stops: [],
};
const visits = tripMapVisits([parent, next]);
const segments: RouteSegment[] = [
  {
    id: 'shared:cafe',
    from: ['parent', 'shop'],
    to: ['cafe'],
    status: 'ok',
    distance: 120,
    duration: 75,
  },
  { id: 'cafe:next', from: ['cafe'], to: ['next'], status: 'unavailable' },
];
describe('Explicit independent map selection', () => {
  it('selects only the stop even when the shared planner supplies its parent ID', () => {
    expect(selectedMapVisit(visits, 'parent', 'shop')).toEqual({ id: 'shop', type: 'stop' });
  });
  it('selects a parent without selecting its children', () => {
    expect(selectedMapVisit(visits, 'parent')).toEqual({ id: 'parent', type: 'step' });
  });
  it('never falls back to a parent for a missing, stale or invalid stop', () => {
    expect(selectedMapVisit(visits, 'parent', 'deleted')).toBeUndefined();
    expect(selectedMapVisit(visits, 'parent', 'parent')).toBeUndefined();
    expect(selectedMapVisit(tripMapVisits([next]), 'parent', 'shop')).toBeUndefined();
  });
  it('keeps an unlocated stop independently selectable and rejects a stop disguised as a parent', () => {
    expect(selectedMapVisit(visits, 'parent', 'unknown')).toEqual({ id: 'unknown', type: 'stop' });
    expect(selectedMapVisit(visits, 'shop')).toBeUndefined();
  });
});
describe('Map sidebar hierarchy and transitions', () => {
  it('keeps every occurrence with its own type, hierarchical index and parent context', () => {
    const rows = mapSidebarRows(visits, segments);
    expect(rows.map((r) => [r.visit.id, r.type, r.visit.number])).toEqual([
      ['parent', 'step', '1'],
      ['shop', 'stop', '1.1'],
      ['cafe', 'stop', '1.2'],
      ['unknown', 'stop', '1.3'],
      ['next', 'step', '2'],
    ]);
    expect(rows[1]!.parentTitle).toBe('PARCO');
    expect(parent.stops).toHaveLength(3);
  });
  it('uses existing indicative stop times without inventing times after an unknown duration', () => {
    const rows = mapSidebarRows(visits);
    expect(rows.map((r) => r.time)).toEqual(['09:00', '≈ 09:00', '≈ 09:30', '', '09:00']);
    expect(rows[0]).toMatchObject({ duration: '2 h', location: 'Shibuya' });
  });
  it('attaches a transition only to the final occurrence sharing an access, retaining actual metrics', () => {
    const rows = mapSidebarRows(visits, segments);
    expect(rows[0]!.segment).toBeUndefined();
    expect(rows[1]!.segment).toBe(segments[0]);
    expect(rows[1]!.nextTitle).toBe('Café');
    expect(rows[2]!.segment?.status).toBe('unavailable');
  });
  it('provides a meaningful fallback when the linked entry is unavailable', () => {
    expect(mapSidebarRows(visits)[3]!.title).toBe('Fiche indisponible');
  });
});
describe('Map route selection versus transient emphasis', () => {
  it('retains a selected route while another item is hovered, then restores it on mouse leave', () => {
    expect(mapRouteHighlights(segments, 'shop', 'next')).toEqual(
      new Map([
        ['shared:cafe', 'selected'],
        ['cafe:next', 'hovered'],
      ]),
    );
    expect(mapRouteHighlights(segments, 'shop')).toEqual(
      new Map([
        ['shared:cafe', 'selected'],
        ['cafe:next', undefined],
      ]),
    );
  });
  it('emphasizes a hovered transition precisely without inventing geometry', () => {
    expect(mapRouteHighlights(segments, undefined, 'cafe', 'cafe:next')).toEqual(
      new Map([
        ['shared:cafe', undefined],
        ['cafe:next', 'hovered'],
      ]),
    );
  });
});
