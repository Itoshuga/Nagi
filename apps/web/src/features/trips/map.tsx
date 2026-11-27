'use client';
import 'leaflet/dist/leaflet.css';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSON, LayerGroup, Map as LeafletMap, Marker } from 'leaflet';
import { Bike, Compass, LocateFixed, List, LoaderCircle, Plus, X } from 'lucide-react';
import { cn } from '@nagi/ui';
import type { EntryCardRow } from '@nagi/database';
import {
  calendarEventColor,
  calendarSwatchInk,
  tripMapLongitudes,
  tripPoints,
  tripStepCount,
  tripStopCount,
} from '@nagi/shared';
import { EntryImage } from '@/features/media/image';
import {
  type PlaceAdder,
  type WorkspaceViewProps,
  stepTime,
  visibleTripItems,
  tripMapVisits,
  groupTripMapPoints,
} from './planner-model';
import { tripTileProvider } from './map-config';
import {
  prepareDayRoute,
  routeDistanceLabel,
  routeDurationLabel,
  unwrapRoute,
  type RouteVisit,
  type RouteFeature,
} from './map-route-model';
import { useDayRoute } from './map-route-client';
import {
  useExternalPlaces,
  useExternalPlaceVersion,
  externalStatus,
} from '@/features/integrations/mapbox/components';
import { catalogPlaceEntry } from '@/features/integrations/mapbox/model';

function mapPin(label: string, color: string, grouped = false, stop = false, extra = 0) {
  const pin = document.createElement('span');
  pin.className = 'trip-map-pin';
  pin.setAttribute('aria-hidden', 'true');
  pin.style.setProperty('--trip-pin-color', color);
  pin.style.setProperty('--trip-pin-ink', calendarSwatchInk(color));
  if (grouped) {
    const stack = document.createElement('span');
    stack.className = 'trip-map-pin-stack';
    pin.append(stack);
  }
  // One continuous outline keeps the body and its tip centred on the same
  // coordinate, including when the pin is scaled on hover or selection.
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  shape.classList.add('trip-map-pin-shape');
  shape.setAttribute('viewBox', '0 0 44 44');
  shape.setAttribute('focusable', 'false');
  const outline = stop
    ? 'M18 5H26C32.075 5 37 9.925 37 16V24C37 30.075 32.075 35 27 35L22 43L17 35C11.925 35 7 30.075 7 24V16C7 9.925 11.925 5 18 5Z'
    : 'M18 1H26C33.18 1 39 6.82 39 14V22C39 29.18 34.5 35 27 35L22 43L17 35C9.5 35 5 29.18 5 22V14C5 6.82 10.82 1 18 1Z';
  for (const className of ['trip-map-pin-halo', 'trip-map-pin-body']) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add(className);
    path.setAttribute('d', outline);
    shape.append(path);
  }
  pin.append(shape);
  const face = document.createElement('span');
  face.className = 'trip-map-pin-label';
  face.textContent = label;
  pin.append(face);
  if (extra) {
    const count = document.createElement('span');
    count.className = 'trip-map-pin-count';
    count.textContent = `+${extra}`;
    pin.append(count);
  }
  return pin;
}

function markerTooltip(title: string, subtitle?: string) {
  const content = document.createElement('span');
  content.className = 'trip-map-pin-caption';
  const name = document.createElement('strong');
  name.textContent = title;
  content.append(name);
  if (subtitle) {
    const detail = document.createElement('small');
    detail.textContent = subtitle;
    content.append(detail);
  }
  return content;
}

function enableMarkerKeyboard(marker: Marker) {
  marker.on('keydown', ({ originalEvent }) => {
    if (originalEvent.key !== 'Enter' && originalEvent.key !== ' ') return;
    originalEvent.preventDefault();
    originalEvent.stopPropagation();
    if (!originalEvent.repeat) marker.fire('click');
  });
}

export default function TripMap(
  props: WorkspaceViewProps & { onPreview: (entry: EntryCardRow) => void; add: PlaceAdder },
) {
  const { plan, selectedDay, selectedItem, onDetails, canEdit, add } = props;
  const external = useExternalPlaces();
  useExternalPlaceVersion();
  const [mapboxError, setMapboxError] = useState(''),
    [mapboxRetry, setMapboxRetry] = useState(0);
  const listNode = useRef<HTMLDivElement>(null);
  const node = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap>(null),
    markers = useRef<LayerGroup>(null),
    catalogue = useRef<LayerGroup>(null),
    library = useRef<typeof import('leaflet')>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading'),
    [tileError, setTileError] = useState(false);
  const [explore, setExplore] = useState(false),
    [list, setList] = useState(true),
    [selected, setSelected] = useState<EntryCardRow>();
  const [bounds, setBounds] = useState<{
    south: number;
    north: number;
    west: number;
    east: number;
  }>();
  const [nearby, setNearby] = useState<{
      rows: EntryCardRow[];
      hasMore: boolean;
      error?: boolean;
    }>(),
    [searching, setSearching] = useState(false),
    [addStatus, setAddStatus] = useState('');
  const fitted = useRef<string | null>(null);
  const routeFitted = useRef<string | null>(null);
  const manualCamera = useRef(false);
  const routeLayer = useRef<GeoJSON>(null);
  const pinRegistry = useRef(new Map<string, Marker>());
  const lastRetry = useRef(0);
  const lastSelected = useRef<string | undefined>(undefined);
  const [hovered, setHovered] = useState<string>();
  const activeId = props.selectedStop ?? selectedItem;
  const daily = selectedDay !== 'all' && selectedDay !== 'pending';
  const visible = useMemo(
    () => visibleTripItems({ items: plan.items, days: plan.days }, selectedDay),
    [plan.items, plan.days, selectedDay],
  );
  const visits = useMemo(() => tripMapVisits(visible), [visible]);
  const references = JSON.stringify([
    ...new Map(
      visits
        .filter((v) => (v.stop ?? v.parent).source === 'mapbox')
        .map((v) => {
          const row = v.stop ?? v.parent;
          return [row.external_place_id, { id: row.external_place_id, query: row.external_query }];
        }),
    ).values(),
  ]);
  useEffect(() => {
    if (!external) return;
    let active = true;
    const refs = JSON.parse(references) as { id: string; query: string }[];
    const force = lastRetry.current !== mapboxRetry;
    lastRetry.current = mapboxRetry;
    void Promise.allSettled(
      refs.filter((r) => r.id && r.query).map((r) => external.ensure(r.id, r.query, force)),
    ).then((results) => {
      if (active)
        setMapboxError(
          results.some((r) => r.status === 'rejected')
            ? 'Certains lieux Mapbox sont indisponibles. Les étapes restent modifiables.'
            : '',
        );
    });
    return () => {
      active = false;
    };
  }, [external, references, mapboxRetry]);
  const coordinateKey = JSON.stringify(
    JSON.parse(references).map((r: { id: string }) => {
      const p = external?.get(r.id).place;
      return p
        ? {
            source: p.source,
            id: p.id,
            title: p.title,
            coordinates: p.coordinates,
            featureType: p.featureType,
            category: p.category,
          }
        : null;
    }),
  );
  const routePlaces = useMemo(
    () =>
      new Map(
        (JSON.parse(coordinateKey) as (import('@nagi/shared').CatalogPlace | null)[])
          .filter((p): p is import('@nagi/shared').CatalogPlace => p !== null)
          .map((p) => [p.id, p]),
      ),
    [coordinateKey],
  );
  const locatedVisits = useMemo(() => {
    return visits.map((visit) => {
      const row = visit.stop ?? visit.parent;
      const place =
        row.source === 'mapbox' && row.external_place_id
          ? routePlaces.get(row.external_place_id)
          : undefined;
      return place?.coordinates ? { ...visit, entry: catalogPlaceEntry(place) } : visit;
    });
  }, [visits, routePlaces]);
  const { located, missing } = useMemo(() => tripPoints(locatedVisits, 'all'), [locatedVisits]);
  const points = useMemo(() => {
    const lons = tripMapLongitudes(located.map((p) => p.longitude));
    return located.map((p, i) => ({
      ...p,
      longitude: lons[i]!,
      number: p.item.number,
    }));
  }, [located]);
  const routePlan = useMemo(() => prepareDayRoute(visits, routePlaces), [visits, routePlaces]);
  const resolved = JSON.parse(references) as { id: string; query: string }[];
  const resolving =
    !!external &&
    resolved.some((r) => {
      const state = external.get(r.id);
      return !state.error && (!state.place?.coordinates || state.loading);
    });
  const route = useDayRoute(
    `/app/${props.guild}/trips/${plan.id}/directions`,
    {
      day: selectedDay,
      plan: routePlan,
      places: resolved.flatMap((r) => {
        const place = external?.get(r.id).place;
        return place?.coordinates && place.proof ? [{ ...r, proof: place.proof }] : [];
      }),
    },
    daily && phase === 'ready' && !resolving,
    mapboxRetry,
  );
  function openVisit(visit: RouteVisit) {
    const point = points.find((p) => p.item.id === visit.id);
    if (point && map.current) {
      manualCamera.current = true;
      map.current.setView([point.latitude, point.longitude], Math.max(14, map.current.getZoom()), {
        animate: false,
      });
    }
    if (visit.stop && props.onStopDetails) props.onStopDetails(visit.stop);
    else onDetails(visit.parent);
  }
  function fitMap(bounds: import('leaflet').LatLngBounds) {
    const instance = map.current;
    if (!instance || !bounds.isValid()) return;
    instance.invalidateSize({ pan: false });
    const panel = listNode.current;
    const overlay = panel && getComputedStyle(panel).position === 'absolute';
    // The mobile place list overlays the canvas. Keep the route and pin tips in
    // the usable area above it, while respecting the attribution underneath.
    const bottom = overlay ? Math.min(instance.getSize().y * 0.7, panel.offsetHeight + 70) : 48;
    instance.fitBounds(bounds, {
      paddingTopLeft: [48, 48],
      paddingBottomRight: [48, bottom],
      maxZoom: 15,
      animate: false,
    });
  }
  function recenter() {
    const instance = map.current,
      leaflet = library.current;
    if (!instance || !leaflet) return;
    const bounds = leaflet.latLngBounds(points.map((p) => [p.latitude, p.longitude]));
    const anchor = points[0]?.longitude ?? 0;
    route.result?.geometry.features.forEach((f) =>
      unwrapRoute(f.geometry.coordinates, anchor).forEach(([lon, lat]) =>
        bounds.extend([lat, lon]),
      ),
    );
    fitMap(bounds);
    manualCamera.current = false;
  }
  useEffect(() => {
    const pins = pinRegistry.current;
    let mounted = true;
    let observer: ResizeObserver | undefined;
    let cleanInteractions: (() => void) | undefined;
    (async () => {
      if (external) {
        const status = await externalStatus(external);
        if (!status.mapAvailable) throw new Error('Mapbox map disabled');
      }
      return import('leaflet');
    })()
      .then((leaflet) => {
        if (!mounted || !node.current) return;
        const instance = leaflet.map(node.current, {
          scrollWheelZoom: true,
          zoomAnimation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        map.current = instance;
        library.current = leaflet;
        instance.attributionControl.setPrefix(false);
        const tiles = leaflet.tileLayer(tripTileProvider.url, {
          maxZoom: tripTileProvider.maxZoom,
          tileSize: 512,
          zoomOffset: -1,
          attribution: tripTileProvider.attribution,
        });
        tiles.on('tileerror', () => {
          if (mounted) setTileError(true);
        });
        tiles.on('tileload', () => {
          if (mounted) setTileError(false);
        });
        tiles.addTo(instance);
        markers.current = leaflet.layerGroup().addTo(instance);
        catalogue.current = leaflet.layerGroup().addTo(instance);
        instance.setView([20, 0], 2);
        const update = () => {
          const b = instance.getBounds(),
            normalize = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
          setBounds({
            south: Math.max(-90, b.getSouth()),
            north: Math.min(90, b.getNorth()),
            west: b.getEast() - b.getWest() >= 360 ? -180 : normalize(b.getWest()),
            east: b.getEast() - b.getWest() >= 360 ? 180 : normalize(b.getEast()),
          });
        };
        instance.on('moveend', update);
        const interact = () => {
          manualCamera.current = true;
        };
        instance.on('dragstart', interact);
        instance.getContainer().addEventListener('wheel', interact, { passive: true });
        instance.getContainer().addEventListener('pointerdown', interact);
        instance.getContainer().addEventListener('keydown', interact);
        cleanInteractions = () => {
          instance.off('dragstart', interact);
          instance.getContainer().removeEventListener('wheel', interact);
          instance.getContainer().removeEventListener('pointerdown', interact);
          instance.getContainer().removeEventListener('keydown', interact);
        };
        update();
        observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
        observer.observe(node.current);
        setPhase('ready');
      })
      .catch(() => {
        if (mounted) setPhase('failed');
      });
    return () => {
      mounted = false;
      observer?.disconnect();
      cleanInteractions?.();
      routeLayer.current = null;
      pins.clear();
      map.current?.remove();
      map.current = null;
      markers.current = null;
      catalogue.current = null;
    };
  }, [external]);
  useEffect(() => {
    const instance = map.current,
      layer = markers.current,
      leaflet = library.current;
    if (phase !== 'ready' || !instance || !layer || !leaflet) return;
    // Opening the details panel changes the canvas width before ResizeObserver
    // runs. Centre the selected pin using the current viewport dimensions.
    instance.invalidateSize({ pan: false });
    layer.clearLayers();
    pinRegistry.current.clear();
    const b = leaflet.latLngBounds([]);
    for (const group of groupTripMapPoints(points)) {
      const representative = group.find((p) => p.item.id === activeId) ?? group[0]!;
      const { item, latitude, longitude, number } = representative;
      const grouped = group.length > 1;
      const active = group.some((p) => p.item.id === activeId);
      const color = calendarEventColor(
        item.stop?.calendar_color ?? item.parent.calendar_color,
        item.entry?.category?.color,
      );
      const title = grouped
        ? `${group.length} lieux au même emplacement`
        : (item.entry?.title ?? 'Étape');
      const point: [number, number] = [latitude, longitude];
      b.extend(point);
      const marker = leaflet
        .marker(point, {
          alt: title,
          riseOnHover: true,
          zIndexOffset: active ? 1000 : 0,
          icon: leaflet.divIcon({
            className: `nagi-trip-marker${active ? ' is-selected' : ''}${grouped ? ' is-group' : ''}${item.stop && !grouped ? ' is-stop' : ''}`,
            html: mapPin(
              grouped ? (daily ? group[0]!.number : String(group.length)) : number,
              color,
              grouped,
              !!item.stop && !grouped,
              daily && grouped ? group.length - 1 : 0,
            ),
            iconSize: [44, 48],
            iconAnchor: [22, 44],
            tooltipAnchor: [0, -42],
            popupAnchor: [0, -38],
          }),
        })
        .bindTooltip(
          markerTooltip(
            title,
            grouped ? 'Choisir une étape' : item.stop ? `Arrêt ${number}` : `Étape ${number}`,
          ),
          { direction: 'top', offset: [0, -6], className: 'trip-map-pin-tooltip', opacity: 1 },
        )
        .addTo(layer);
      if (grouped) {
        marker.on('popupopen', () => marker.closeTooltip());
        marker.on('mouseover', () => {
          if (marker.isPopupOpen()) marker.closeTooltip();
        });
        const choices = document.createElement('div');
        choices.className = 'trip-map-shared-location';
        for (const point of group) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = `${point.number}. ${point.item.entry?.title ?? 'Fiche indisponible'}`;
          button.addEventListener('click', () => {
            instance.closePopup();
            openVisit(point.item);
          });
          choices.append(button);
        }
        marker.bindPopup(choices, { className: 'trip-map-location-popup' });
      } else marker.on('click', () => openVisit(item));
      group.forEach((p) => pinRegistry.current.set(p.item.id, marker));
      marker.on('mouseover', () => setHovered(item.id));
      marker.on('mouseout', () => setHovered(undefined));
      marker
        .getElement()
        ?.setAttribute(
          'aria-label',
          grouped
            ? `${group.length} lieux au même emplacement`
            : `${number}. ${item.entry?.title ?? 'Étape'}`,
        );
      marker.getElement()?.setAttribute('aria-pressed', String(active));
      enableMarkerKeyboard(marker);
    }
    if (!b.isValid() && fitted.current === null) {
      const fallback = tripPoints(tripMapVisits(plan.items), 'all').located;
      const longitudes = tripMapLongitudes(fallback.map((p) => p.longitude));
      fallback.forEach((p, i) => b.extend([p.latitude, longitudes[i]!]));
    }
    if (b.isValid() && fitted.current !== selectedDay && !resolving) {
      fitMap(b);
      fitted.current = selectedDay;
      routeFitted.current = null;
      manualCamera.current = false;
    }
    const chosen = points.find((p) => p.item.id === activeId);
    if (chosen && lastSelected.current !== activeId)
      instance.panInside([chosen.latitude, chosen.longitude], {
        padding: [48, 48],
        animate: false,
      });
    lastSelected.current = activeId;
    // openVisit is an event callback; rebuild marker handlers with the current visits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    phase,
    points,
    selectedDay,
    activeId,
    onDetails,
    props.onStopDetails,
    resolving,
    plan.items,
    daily,
  ]);
  useEffect(() => {
    const instance = map.current,
      leaflet = library.current;
    if (phase !== 'ready' || !instance || !leaflet) return;
    routeLayer.current?.remove();
    routeLayer.current = null;
    const result = route.result;
    if (!daily || !result?.geometry.features.length) return;
    const anchor = points[0]?.longitude ?? 0;
    const data = {
      ...result.geometry,
      features: result.geometry.features.map((f) => ({
        ...f,
        geometry: { ...f.geometry, coordinates: unwrapRoute(f.geometry.coordinates, anchor) },
      })),
    };
    const casing = leaflet
      .geoJSON(data, {
        interactive: false,
        style: { color: '#fff', weight: 7, opacity: 0.9, lineCap: 'round', lineJoin: 'round' },
      })
      .addTo(instance);
    const line = leaflet
      .geoJSON(data, {
        interactive: false,
        style: {
          color: '#73A6DF',
          weight: 4,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          className: 'trip-day-route',
        },
      })
      .addTo(instance);
    routeLayer.current = line;
    if (routeFitted.current !== selectedDay && !manualCamera.current) {
      const bounds = line.getBounds();
      points.forEach((p) => bounds.extend([p.latitude, p.longitude]));
      fitMap(bounds);
    }
    routeFitted.current = selectedDay;
    return () => {
      casing.remove();
      line.remove();
      if (routeLayer.current === line) routeLayer.current = null;
    };
    // Geometry is already tied to the exact day/coordinate signature by useDayRoute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, route.result, daily, selectedDay]);
  useEffect(() => {
    const focused = hovered ? pinRegistry.current.get(hovered) : undefined;
    new Set(pinRegistry.current.values()).forEach((marker) =>
      marker.getElement()?.classList.toggle('is-highlighted', marker === focused),
    );
    routeLayer.current?.eachLayer((layer) => {
      const line = layer as import('leaflet').Polyline & { feature?: RouteFeature };
      const highlighted =
        !!hovered &&
        route.result?.segments.some(
          (s) =>
            line.feature?.properties.segments.includes(s.id) &&
            [...s.from, ...s.to].includes(hovered),
        );
      line.setStyle({ color: highlighted ? '#3977b9' : '#73A6DF', weight: highlighted ? 5 : 4 });
    });
  }, [hovered, route.result, points, activeId]);
  const boundKey = JSON.stringify(bounds);
  useEffect(() => {
    if (!explore || !bounds) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const p = new URLSearchParams({
          mode: 'nearby',
          ...Object.fromEntries(Object.entries(bounds).map(([k, v]) => [k, String(v)])),
        });
        const r = await fetch(`/app/${props.guild}/trips/${plan.id}/places?${p}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!r.ok) throw new Error('nearby');
        const data = await r.json();
        if (!controller.signal.aborted) setNearby(data);
      } catch {
        if (!controller.signal.aborted) setNearby({ rows: [], hasMore: false, error: true });
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 280);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // Bounds are serialized to avoid restarting searches during unrelated selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explore, boundKey, props.guild, plan.id]);
  useEffect(() => {
    const layer = catalogue.current,
      leaflet = library.current;
    if (!layer || !leaflet || phase !== 'ready') return;
    layer.clearLayers();
    if (!explore) return;
    const included = new Set(
      tripMapVisits(plan.items)
        .filter(
          (i) =>
            selectedDay === 'all' ||
            i.trip_day_id === (selectedDay === 'pending' ? null : selectedDay),
        )
        .map((i) => i.entry?.id),
    );
    const otherDays = new Set(tripMapVisits(plan.items).map((i) => i.entry?.id));
    for (const entry of nearby?.rows ?? []) {
      if (
        included.has(entry.id) ||
        entry.latitude == null ||
        entry.longitude == null ||
        Math.abs(entry.latitude) > 90 ||
        Math.abs(entry.longitude) > 180
      )
        continue;
      const marker = leaflet
        .marker([entry.latitude, entry.longitude], {
          alt: entry.title,
          riseOnHover: true,
          zIndexOffset: selected?.id === entry.id ? 500 : -100,
          icon: leaflet.divIcon({
            className: `nagi-catalog-marker${selected?.id === entry.id ? ' is-selected' : ''}${otherDays.has(entry.id) ? ' is-in-trip' : ''}`,
            html: mapPin('+', calendarEventColor(null, entry.category?.color)),
            iconSize: [44, 44],
            iconAnchor: [22, 22],
            tooltipAnchor: [0, -16],
          }),
        })
        .bindTooltip(markerTooltip(entry.title, 'Catalogue Nagi'), {
          direction: 'top',
          offset: [0, -6],
          className: 'trip-map-pin-tooltip',
          opacity: 1,
        })
        .on('click', () => {
          setSelected(entry);
          setAddStatus('');
        })
        .addTo(layer);
      marker.getElement()?.setAttribute('aria-label', `Découvrir ${entry.title}`);
      marker.getElement()?.setAttribute('aria-pressed', String(selected?.id === entry.id));
      enableMarkerKeyboard(marker);
    }
  }, [nearby, explore, plan.items, selectedDay, selected?.id, phase]);
  return (
    <div className="trip-map-workspace">
      <div className="trip-map-toolbar">
        {(mapboxError || route.code === 'refresh_places') && (
          <button
            type="button"
            className="trip-explore-button"
            onClick={() => setMapboxRetry((v) => v + 1)}
            title={mapboxError}
          >
            Actualiser les lieux Mapbox
          </button>
        )}
        <button
          type="button"
          className="trip-icon-button"
          aria-label="Afficher la liste des lieux"
          aria-expanded={list}
          onClick={() => setList((v) => !v)}
        >
          <List className="size-4" />
        </button>
        <button
          type="button"
          className={cn('trip-explore-button', explore && 'is-active')}
          aria-pressed={explore}
          aria-label="Explorer les alentours"
          onClick={() => {
            setExplore((v) => !v);
            setSearching(false);
          }}
        >
          <Compass className="size-4" />{' '}
          <span className="trip-explore-copy">
            Explorer <span>les alentours</span>
          </span>
        </button>
        <button
          type="button"
          className="trip-icon-button"
          aria-label="Recentrer la carte"
          onClick={recenter}
        >
          <LocateFixed className="size-4" />
        </button>
        {daily && (
          <span className="trip-route-mode">
            <Bike className="size-3.5" aria-hidden="true" /> À vélo
          </span>
        )}
        {searching && <LoaderCircle className="size-3.5 animate-spin" />}
      </div>
      <div className="trip-map-layout">
        {list && (
          <div ref={listNode} className="trip-map-place-list">
            <h2>
              {selectedDay === 'all'
                ? 'Tout le voyage'
                : selectedDay === 'pending'
                  ? 'À organiser'
                  : `Jour ${plan.days.findIndex((d) => d.id === selectedDay) + 1}`}
              <small>
                {tripStepCount(visible.length)}
                {visits.length > visible.length
                  ? ` · ${tripStopCount(visits.length - visible.length)}`
                  : ''}
              </small>
            </h2>
            {daily && (
              <div className="trip-route-summary" role="status" aria-live="polite">
                <strong>
                  {route.result?.status === 'partial' ? 'Trajet partiel' : 'Trajet du jour'}
                </strong>
                {route.loading || resolving ? (
                  <p>Calcul du parcours…</p>
                ) : route.error ? (
                  <p>{route.error}</p>
                ) : routePlan.points.length < 2 ? (
                  <p>
                    {routePlan.points.length
                      ? 'Un seul emplacement à rejoindre.'
                      : 'Aucun déplacement calculable.'}
                  </p>
                ) : route.result?.segments.some((s) => s.status === 'ok') ? (
                  <p>
                    {routeDistanceLabel(route.result.distance)} ·{' '}
                    {routeDurationLabel(route.result.duration)} de déplacement
                    {route.result.status === 'partial' ? ' calculé' : ''}
                  </p>
                ) : (
                  <p>Trajet indisponible pour ces lieux et ce mode.</p>
                )}
                {route.result?.segments.some((s) => s.status !== 'ok') && (
                  <small>
                    {route.result.segments.filter((s) => s.status !== 'ok').length} liaison(s) non
                    calculée(s)
                    {route.result.segments.some((s) => s.status === 'quota' || s.status === 'limit')
                      ? ' · Limite de calcul atteinte'
                      : route.result.segments.some((s) => s.status === 'too-far')
                        ? ' · Distance incompatible avec ce mode'
                        : ''}
                    .
                  </small>
                )}
                <details className="trip-route-notes">
                  <summary>À propos du trajet</summary>
                  {routePlan.sameLocation > 0 && (
                    <small>
                      {routePlan.sameLocation} arrêt(s) au même emplacement, sans déplacement
                      ajouté.
                    </small>
                  )}
                  {!!routePlan.missing.length && (
                    <small>{routePlan.missing.length} lieu(x) sans position ignoré(s).</small>
                  )}
                  <small>Visites exclues des durées · Métro, train et bus non calculés.</small>
                </details>
              </div>
            )}
            <ol>
              {points.map(({ item, number }) => (
                <li
                  key={item.id}
                  data-map-visit={item.id}
                  className={item.stop ? 'trip-map-stop' : undefined}
                  onMouseEnter={() => setHovered(item.id)}
                  onMouseLeave={() => setHovered(undefined)}
                  onFocus={() => setHovered(item.id)}
                  onBlur={() => setHovered(undefined)}
                >
                  <button
                    type="button"
                    aria-pressed={item.id === activeId}
                    onClick={() => openVisit(item)}
                  >
                    <span>{number}</span>
                    <div>
                      <strong>{item.entry?.title}</strong>
                      <small>
                        {[
                          item.stop
                            ? `Arrêt dans ${item.parent.entry?.title ?? 'cette activité'}`
                            : stepTime(item.parent),
                          item.entry?.neighborhood?.name ?? item.entry?.city?.name,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </div>
                  </button>
                  {daily && (
                    <div className="trip-map-route-detail">
                      {route.result?.segments
                        .filter((s) => s.from.at(-1) === item.id)
                        .map((segment) => (
                          <p
                            key={segment.id}
                            className="trip-route-leg"
                            data-route-leg={segment.id}
                          >
                            {segment.status === 'ok'
                              ? `${routeDistanceLabel(segment.distance!)} · ${routeDurationLabel(segment.duration!)} → ${visits.find((v) => v.id === segment.to[0])?.entry?.title ?? 'lieu suivant'}`
                              : 'Liaison suivante indisponible'}
                          </p>
                        ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {missing.length > 0 && (
              <div className="trip-map-missing">
                <p>Sans coordonnées</p>
                {missing.map((item) => (
                  <button type="button" key={item.id} onClick={() => openVisit(item)}>
                    {item.entry?.title ?? 'Fiche indisponible'}
                    <small>Position indisponible</small>
                  </button>
                ))}
              </div>
            )}
            {!points.length && (
              <p className="trip-empty-inline">Les lieux avec des coordonnées apparaîtront ici.</p>
            )}
            {canEdit && (
              <button
                type="button"
                className="trip-add-step"
                onClick={() =>
                  props.onAdd(
                    selectedDay === 'all' || selectedDay === 'pending' ? null : selectedDay,
                  )
                }
              >
                <Plus className="size-4" /> Ajouter une étape
              </button>
            )}
          </div>
        )}
        <div className="trip-map-frame">
          <a
            className="trip-mapbox-logo"
            href="https://www.mapbox.com/about/maps/"
            target="_blank"
            rel="noreferrer"
          >
            <Image src="/mapbox-logo.svg" alt="Mapbox" width="88" height="23" />
          </a>
          <div
            ref={node}
            role="region"
            aria-label="Carte interactive du voyage"
            className="trip-leaflet-map"
          />
          {phase === 'loading' && (
            <p role="status" className="trip-map-message">
              Chargement de la carte…
            </p>
          )}
          {(phase === 'failed' || tileError) && (
            <p role="status" className="trip-map-message">
              Le fond de carte est momentanément indisponible.
            </p>
          )}
          {explore && (
            <p className="trip-map-legend">
              <span className="trip-legend-planned" /> Votre voyage{' '}
              <span className="trip-legend-catalog" /> Catalogue
              {nearby?.hasMore && ' · Zoomez pour affiner'}
              {nearby?.error && ' · Recherche indisponible'}
            </p>
          )}
          {selected && explore && (
            <div className="trip-map-preview">
              <button
                type="button"
                className="trip-icon-button"
                aria-label="Fermer l’aperçu"
                onClick={() => setSelected(undefined)}
              >
                <X className="size-3.5" />
              </button>
              <EntryImage
                src={selected.cover_image_url}
                className="size-12 shrink-0 rounded-lg"
                sizes="48px"
              />
              <div>
                <strong>{selected.title}</strong>
                <small>
                  {selected.category?.name} · {selected.city?.name}
                </small>
                <div className="flex gap-3">
                  <button type="button" onClick={() => props.onPreview(selected)}>
                    Aperçu
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={props.busy}
                      onClick={async () => {
                        const r = await add(
                          selected,
                          selectedDay === 'all' || selectedDay === 'pending' ? null : selectedDay,
                        );
                        setAddStatus(r.ok ? 'Ajouté au voyage' : r.error);
                      }}
                    >
                      Ajouter
                    </button>
                  )}
                </div>
                {addStatus && <p role="status">{addStatus}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
