'use client';

import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import { Alert, Card, EmptyState, cn } from '@nagi/ui';
import type { TripPlan, TripPlanItem } from '@nagi/database';
import { tripMapLongitudes, tripPoints } from '@nagi/shared';
import { CatalogSelect } from '@/features/catalog/admin-form';
import { entryHref } from '@/features/entries/links';
import { EntryImage } from '@/features/media/image';
import { dayLabel } from './add-place-dialog';
import { stepLocation, stepTime } from './planner-model';
import { tripTileProvider } from './map-config';

function markerDetails(guild: string, item: TripPlanItem, day: string) {
  const content = document.createElement('div');
  content.className = 'grid w-40 gap-1 text-sm';
  const entry = item.entry;
  if (!entry) return content;
  if (entry.cover_image_url) {
    const photo = document.createElement('img');
    photo.src = entry.cover_image_url;
    photo.alt = '';
    photo.loading = 'lazy';
    photo.className = 'aspect-[16/9] w-full rounded-lg object-cover';
    content.append(photo);
  }
  const title = document.createElement('a');
  title.href = entryHref(guild, entry);
  title.textContent = entry.title;
  title.className = 'break-words font-bold';
  const detail = document.createElement('small');
  detail.textContent = [entry.category?.name, day, stepTime(item)].filter(Boolean).join(' · ');
  content.append(title, detail);
  return content;
}

export default function TripMap({ guild, plan }: { guild: string; plan: TripPlan }) {
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [status, setStatus] = useState<{ phase: 'loading' | 'ready' | 'failed' }>({
    phase: 'loading',
  });
  const [tilesFailed, setTilesFailed] = useState(false);
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap>(null);
  const markers = useRef<LayerGroup>(null);
  const library = useRef<typeof import('leaflet')>(null);
  const active =
    filter === 'pending' || plan.days.some((day) => day.id === filter) ? filter : 'all';
  const { located, missing } = useMemo(() => tripPoints(plan.items, active), [plan.items, active]);
  const points = useMemo(() => {
    const longitudes = tripMapLongitudes(located.map((point) => point.longitude));
    return located.map((point, index) => ({ ...point, longitude: longitudes[index]! }));
  }, [located]);
  const selected = located.find((point) => point.item.id === selectedId);
  const hasPoints = located.length > 0;

  useEffect(() => {
    if (!hasPoints || !node.current) return;
    let mounted = true;
    let observer: ResizeObserver | undefined;
    import('leaflet')
      .then((leaflet) => {
        if (!mounted || !node.current) return;
        const instance = leaflet.map(node.current, {
          scrollWheelZoom: false,
          zoomAnimation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        library.current = leaflet;
        map.current = instance;
        instance.attributionControl.setPrefix(false);
        const tiles = leaflet.tileLayer(tripTileProvider.url, {
          maxZoom: tripTileProvider.maxZoom,
          attribution: tripTileProvider.attribution,
        });
        tiles.on('tileerror', () => {
          if (mounted) setTilesFailed(true);
        });
        tiles.on('tileload', () => {
          if (mounted) setTilesFailed(false);
        });
        tiles.addTo(instance);
        markers.current = leaflet.layerGroup().addTo(instance);
        observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
        observer.observe(node.current);
        setStatus({ phase: 'ready' });
      })
      .catch(() => {
        if (mounted) setStatus({ phase: 'failed' });
      });
    return () => {
      mounted = false;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
      markers.current = null;
    };
  }, [hasPoints]);

  useEffect(() => {
    const instance = map.current,
      layer = markers.current,
      leaflet = library.current;
    if (status.phase !== 'ready' || !instance || !layer || !leaflet || !points.length) return;
    layer.clearLayers();
    const numbered = new Map<string | null, number>();
    const bounds = leaflet.latLngBounds([]);
    const labels = new Map(plan.days.map((day) => [day.id, dayLabel(day, plan.days)]));
    points.forEach(({ item, latitude, longitude }) => {
      const number = (numbered.get(item.trip_day_id) ?? 0) + 1;
      numbered.set(item.trip_day_id, number);
      const label = document.createElement('span');
      label.textContent = String(number);
      const title = item.entry?.title ?? 'Étape';
      const point: [number, number] = [latitude, longitude];
      leaflet
        .marker(point, {
          title,
          alt: title,
          icon: leaflet.divIcon({
            className: 'nagi-trip-marker',
            html: label,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        })
        .bindPopup(markerDetails(guild, item, labels.get(item.trip_day_id ?? '') ?? 'À organiser'))
        .on('click', () => setSelectedId(item.id))
        .addTo(layer);
      bounds.extend(point);
    });
    instance.fitBounds(bounds, { padding: [42, 42], maxZoom: 15, animate: false });
  }, [status, points, guild, plan.days]);

  const labelFor = (dayId: string | null) => {
    const day = plan.days.find((item) => item.id === dayId);
    return day ? dayLabel(day, plan.days) : 'À organiser';
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold">Carte du voyage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Les repères suivent l’ordre prévu dans chaque journée.
          </p>
        </div>
        <label className="grid w-full gap-1 text-sm font-medium sm:w-auto">
          Journée affichée
          <CatalogSelect
            value={active}
            onChange={(event) => {
              setSelectedId(undefined);
              setFilter(event.target.value);
            }}
          >
            <option value="all">Toutes les journées</option>
            <option value="pending">À organiser</option>
            {plan.days.map((day) => (
              <option key={day.id} value={day.id}>
                {dayLabel(day, plan.days)}
              </option>
            ))}
          </CatalogSelect>
        </label>
      </div>
      {hasPoints ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]">
          <div>
            <div
              ref={node}
              role="region"
              aria-label="Carte interactive des étapes du voyage"
              className="relative z-0 h-[min(58svh,36rem)] min-h-72 overflow-hidden rounded-2xl border border-border bg-muted
          [&_.nagi-trip-marker]:grid [&_.nagi-trip-marker]:place-items-center [&_.nagi-trip-marker]:rounded-full
          [&_.nagi-trip-marker]:border-2 [&_.nagi-trip-marker]:border-white [&_.nagi-trip-marker]:bg-[#214b75]
          [&_.nagi-trip-marker]:text-sm [&_.nagi-trip-marker]:font-bold [&_.nagi-trip-marker]:text-white [&_.nagi-trip-marker]:shadow-md"
            />
            {(status.phase === 'failed' || tilesFailed) && (
              <Alert role="status" className="mt-2">
                Le fond de carte est momentanément indisponible.
              </Alert>
            )}
          </div>
          <Card className="space-y-3 p-4">
            {selected?.item.entry && (
              <div className="space-y-2 rounded-xl border border-border p-2.5">
                <EntryImage
                  src={selected.item.entry.cover_image_url}
                  className="aspect-[16/9] rounded-lg"
                />
                <Link
                  className="text-sm font-bold text-primary-ink hover:underline"
                  href={entryHref(guild, selected.item.entry)}
                >
                  {selected.item.entry.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {[
                    selected.item.entry.category?.name,
                    labelFor(selected.item.trip_day_id),
                    stepTime(selected.item),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            )}
            <h3 className="font-bold">Étapes localisées</h3>
            <ul className="max-h-[26rem] space-y-1 overflow-y-auto">
              {points.map(({ item, latitude, longitude }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={item.id === selectedId}
                    onClick={() => {
                      setSelectedId(item.id);
                      map.current?.panInside([latitude, longitude], {
                        padding: [30, 30],
                        animate: false,
                      });
                    }}
                    className={cn(
                      'w-full rounded-lg p-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
                      selectedId === item.id && 'bg-accent',
                    )}
                  >
                    <span className="block break-words font-semibold">{item.entry?.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[stepTime(item), stepLocation(item)].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : (
        <EmptyState
          title="Aucun lieu à placer sur la carte"
          description="Les étapes apparaissent sur la carte lorsque leur fiche comporte des coordonnées."
        />
      )}
      {missing.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-bold">Étapes sans coordonnées</h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
            {missing.map((item) => (
              <li key={item.id} className="rounded-lg bg-muted px-2.5 py-1">
                {item.entry ? (
                  <Link href={entryHref(guild, item.entry)} className="hover:underline">
                    {item.entry.title}
                  </Link>
                ) : (
                  'Fiche indisponible'
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
