'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import { Compass, List, LoaderCircle, Plus, X } from 'lucide-react';
import { cn } from '@nagi/ui';
import type { EntryCardRow } from '@nagi/database';
import { tripMapLongitudes, tripPoints, tripStepCount, tripStopCount } from '@nagi/shared';
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
  GooglePlaceView,
  useExternalPlaces,
} from '@/features/integrations/google-places/components';
import {
  googleClientRequest,
  watchGoogleCoordinateExpiry,
} from '@/features/integrations/google-places/client';

export default function TripMap(
  props: WorkspaceViewProps & { onPreview: (entry: EntryCardRow) => void; add: PlaceAdder },
) {
  const { plan, selectedDay, selectedItem, onDetails, canEdit, add } = props;
  const external = useExternalPlaces();
  const [googlePoints, setGooglePoints] = useState<
    Record<string, { latitude: number; longitude: number; expiresAt: number }>
  >({});
  const [googleError, setGoogleError] = useState(''),
    [googleRetry, setGoogleRetry] = useState(0);
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
  const visible = useMemo(
    () => visibleTripItems({ items: plan.items, days: plan.days }, selectedDay),
    [plan.items, plan.days, selectedDay],
  );
  const visits = useMemo(() => tripMapVisits(visible), [visible]);
  const googleIds = JSON.stringify(
    [
      ...new Set(
        visits.map((v) => (v.stop ?? v.parent).google_place_id).filter((id): id is string => !!id),
      ),
    ].sort(),
  );
  useEffect(() => {
    if (!external) return;
    const ids = JSON.parse(googleIds) as string[];
    if (!ids.length) return;
    let cancelled = false;
    let stopExpiry: (() => void) | undefined;
    const resolve = async () => {
      try {
        for (const [id, point] of external.coordinates)
          if (point.expiresAt <= Date.now()) external.coordinates.delete(id);
        const missing = ids.filter((id) => !external.coordinates.has(id));
        for (let index = 0; index < missing.length; index += 30) {
          const data = (await googleClientRequest(external.url, {
            operation: 'coordinates',
            ids: missing.slice(index, index + 30),
          })) as {
            points: Record<
              string,
              { latitude: number; longitude: number; expiresAt: number } | null
            >;
          };
          for (const [id, point] of Object.entries(data.points))
            if (point) external.coordinates.set(id, point);
        }
        if (cancelled) return;
        setGooglePoints(Object.fromEntries(external.coordinates));
        setGoogleError('');
        stopExpiry = watchGoogleCoordinateExpiry(external.coordinates, () => {
          setGooglePoints(Object.fromEntries(external.coordinates));
          setGoogleError('Actualisez les lieux Google Maps pour les localiser à nouveau.');
        });
      } catch (error) {
        if (!cancelled)
          setGoogleError(
            error instanceof Error ? error.message : 'Les lieux Google Maps sont indisponibles.',
          );
      }
    };
    void resolve();
    return () => {
      cancelled = true;
      stopExpiry?.();
    };
  }, [external, googleIds, googleRetry]);
  const locatedVisits = useMemo(
    () =>
      visits.map((visit) => {
        const id = (visit.stop ?? visit.parent).google_place_id,
          point = id ? googlePoints[id] : undefined;
        return point && visit.entry
          ? {
              ...visit,
              entry: { ...visit.entry, latitude: point.latitude, longitude: point.longitude },
            }
          : visit;
      }),
    [visits, googlePoints],
  );
  const { located, missing } = useMemo(() => tripPoints(locatedVisits, 'all'), [locatedVisits]);
  const points = useMemo(() => {
    const lons = tripMapLongitudes(located.map((p) => p.longitude));
    return located.map((p, i) => ({
      ...p,
      longitude: lons[i]!,
      number: p.item.number,
    }));
  }, [located]);
  useEffect(() => {
    let mounted = true;
    let observer: ResizeObserver | undefined;
    import('leaflet')
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
      map.current?.remove();
      map.current = null;
      markers.current = null;
      catalogue.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current,
      layer = markers.current,
      leaflet = library.current;
    if (phase !== 'ready' || !instance || !layer || !leaflet) return;
    layer.clearLayers();
    const b = leaflet.latLngBounds([]);
    for (const group of groupTripMapPoints(points)) {
      const { item, latitude, longitude, number } = group[0]!;
      const grouped = group.length > 1;
      const label = document.createElement('span');
      label.textContent = grouped ? String(group.length) : number;
      const point: [number, number] = [latitude, longitude];
      b.extend(point);
      const marker = leaflet
        .marker(point, {
          title: grouped
            ? `${group.length} lieux au même emplacement`
            : (item.entry?.title ?? 'Étape'),
          alt: grouped
            ? `${group.length} lieux au même emplacement`
            : (item.entry?.title ?? 'Étape'),
          icon: leaflet.divIcon({
            className: `nagi-trip-marker${group.some((p) => p.item.parent.id === selectedItem) ? ' is-selected' : ''}${grouped ? ' is-group' : ''}${item.stop ? ' is-stop' : ''}`,
            html: label,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
        })
        .addTo(layer);
      if (grouped) {
        const choices = document.createElement('div');
        choices.className = 'trip-map-shared-location';
        for (const point of group) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = `${point.number}. ${point.item.entry?.title ?? 'Fiche indisponible'}`;
          button.addEventListener('click', () => {
            instance.closePopup();
            onDetails(point.item.parent);
          });
          choices.append(button);
        }
        marker.bindPopup(choices, { className: 'trip-map-location-popup' });
      } else marker.on('click', () => onDetails(item.parent));
      marker
        .getElement()
        ?.setAttribute(
          'aria-label',
          grouped
            ? `${group.length} lieux au même emplacement`
            : `${number}. ${item.entry?.title ?? 'Étape'}`,
        );
    }
    if (!b.isValid() && fitted.current === null) {
      const fallback = tripPoints(tripMapVisits(plan.items), 'all').located;
      const longitudes = tripMapLongitudes(fallback.map((p) => p.longitude));
      fallback.forEach((p, i) => b.extend([p.latitude, longitudes[i]!]));
    }
    const fitKey = `${selectedDay}:${points.map((p) => `${p.item.parent.id}:${p.latitude}:${p.longitude}`).join('|')}`;
    if (b.isValid() && fitted.current !== fitKey) {
      instance.fitBounds(b, { padding: [50, 50], maxZoom: 15, animate: false });
      fitted.current = fitKey;
    }
    const chosen = points.find((p) => p.item.parent.id === selectedItem);
    if (chosen)
      instance.panInside([chosen.latitude, chosen.longitude], {
        padding: [45, 45],
        animate: false,
      });
  }, [phase, points, selectedDay, selectedItem, onDetails, plan.items]);
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
      const label = document.createElement('span');
      label.textContent = '+';
      const marker = leaflet
        .marker([entry.latitude, entry.longitude], {
          title: entry.title,
          alt: entry.title,
          icon: leaflet.divIcon({
            className: `nagi-catalog-marker${selected?.id === entry.id ? ' is-selected' : ''}${otherDays.has(entry.id) ? ' is-in-trip' : ''}`,
            html: label,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
        })
        .on('click', () => {
          setSelected(entry);
          setAddStatus('');
        })
        .addTo(layer);
      marker.getElement()?.setAttribute('aria-label', `Découvrir ${entry.title}`);
    }
  }, [nearby, explore, plan.items, selectedDay, selected?.id, phase]);
  return (
    <div className="trip-map-workspace">
      <div className="trip-map-toolbar">
        {googleError && (
          <button
            type="button"
            className="trip-explore-button"
            onClick={() => setGoogleRetry((v) => v + 1)}
            title={googleError}
          >
            Actualiser les lieux Google Maps
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
          onClick={() => {
            setExplore((v) => !v);
            setSearching(false);
          }}
        >
          <Compass className="size-4" /> Explorer les alentours
        </button>
        {searching && <LoaderCircle className="size-3.5 animate-spin" />}
      </div>
      <div className="trip-map-layout">
        {list && (
          <div className="trip-map-place-list">
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
            <ol>
              {points.map(({ item, number }) => (
                <li key={item.id} className={item.stop ? 'trip-map-stop' : undefined}>
                  <button
                    type="button"
                    aria-pressed={item.parent.id === selectedItem}
                    onClick={() => onDetails(item.parent)}
                  >
                    <span>{number}</span>
                    <div>
                      {(item.stop ?? item.parent).source === 'google' &&
                      (item.stop ?? item.parent).google_place_id ? (
                        <GooglePlaceView
                          occurrence={item.id}
                          placeId={(item.stop ?? item.parent).google_place_id!}
                          appearance="thumbnail"
                        />
                      ) : (
                        <strong>{item.entry?.title}</strong>
                      )}
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
                </li>
              ))}
            </ol>
            {missing.length > 0 && (
              <div className="trip-map-missing">
                <p>Sans coordonnées</p>
                {missing.map((item) => (
                  <button type="button" key={item.id} onClick={() => onDetails(item.parent)}>
                    {item.entry?.title ?? 'Fiche indisponible'}
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
