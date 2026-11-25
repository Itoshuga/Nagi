'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, LoaderCircle, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@nagi/ui';
import type { CatalogLocation, EntryCardRow, TripCatalogLink, TripPlan } from '@nagi/database';
import { CatalogPicker } from '@/features/catalog/picker';
import { CatalogSelect } from '@/features/catalog/admin-form';
import { tripPlaceOptions } from './actions';
import { TripDaySelect } from './add-place-dialog';
import type { PlaceAdder, PlanMutation, SourcePlaceAdder } from './planner-model';
import { CustomStepDialog, MapboxPlaceSearch } from './source-places';
import { CatalogPlaceCard } from './catalog-place-card';
import {
  defaultMapboxFilters,
  mapboxPlaceTypes,
} from '@/features/integrations/mapbox/search-model';
import { CatalogResult } from './catalog-result';
import {
  catalogDurationKey,
  catalogHintKey,
  type CatalogEntry,
  type CatalogPlacement,
} from './catalog-drag';

export function TripPlacePicker({
  guild,
  plan,
  categories,
  placement,
  onDayChange,
  initialEntry,
  add,
  mutate,
  busy,
  onClose,
  onPreview,
  canAdd = true,
  addSource,
}: {
  guild: string;
  plan: TripPlan;
  categories: { id: string; name: string }[];
  placement: CatalogPlacement;
  onDayChange: (day: string | null) => void;
  initialEntry?: EntryCardRow;
  add: PlaceAdder;
  mutate: PlanMutation;
  busy: boolean;
  onClose: () => void;
  onPreview: (entry: EntryCardRow) => void;
  canAdd?: boolean;
  addSource?: SourcePlaceAdder;
}) {
  const { day, time: initialTime, parent: parentId } = placement;
  const [query, setQuery] = useState(initialEntry?.title.slice(0, 100) ?? '');
  const [source, setSource] = useState<'nagi' | 'mapbox'>('nagi');
  const [mapboxRequest, setMapboxRequest] = useState({ query: '', nonce: 0 });
  const [mapboxFilters, setMapboxFilters] = useState(defaultMapboxFilters),
    [mapboxBusy, setMapboxBusy] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false),
    [category, setCategory] = useState('');
  const [country, setCountry] = useState<CatalogLocation>(),
    [city, setCity] = useState<CatalogLocation>(),
    [area, setArea] = useState<CatalogLocation>();
  const [page, setPage] = useState(0),
    [retry, setRetry] = useState(0),
    [active, setActive] = useState(0);
  const [data, setData] = useState<{
    key: string;
    rows: CatalogEntry[];
    hasMore: boolean;
    links: TripCatalogLink[];
    suggested?: boolean;
    page: number;
    error?: string;
  }>();
  const [receipt, setReceipt] = useState<{ id: string; title: string; stop: boolean }>(),
    [error, setError] = useState('');
  const id = useId(),
    adding = useRef(false);
  const parent = plan.items.find((item) => item.id === parentId);
  const [hint, setHint] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState(30);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setHint(localStorage.getItem(catalogHintKey) !== '1');
        const saved = Number(localStorage.getItem(catalogDurationKey));
        if (Number.isInteger(saved) && saved > 0 && saved <= 1440) setDefaultDuration(saved);
      } catch {
        setHint(true);
      }
    }, 0);
    const used = () => setHint(false);
    window.addEventListener('nagi:catalog-dropped', used);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('nagi:catalog-dropped', used);
    };
  }, []);
  const key = JSON.stringify([
    query.trim(),
    category,
    country?.id,
    city?.id,
    area?.id,
    day,
    parentId,
    retry,
  ]);
  const ready = data?.key === key ? data : undefined;
  useEffect(() => {
    const controller = new AbortController();
    if (source !== 'nagi') return () => controller.abort();
    const timer = setTimeout(
      async () => {
        const p = new URLSearchParams({ q: query.trim(), page: String(page) });
        if (day) p.set('day', day);
        if (parentId) p.set('activity', parentId);
        if (category) p.set('category', category);
        if (country) p.set('country', country.id);
        if (city) p.set('city', city.id);
        if (area) p.set('neighborhood', area.id);
        try {
          const response = await fetch(`/app/${guild}/trips/${plan.id}/places?${p}`, {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!response.ok) throw new Error('search');
          const result = (await response.json()) as NonNullable<typeof data>;
          if (!controller.signal.aborted)
            setData((old) => ({
              ...result,
              key,
              page,
              rows:
                page && old?.key === key
                  ? [
                      ...old.rows,
                      ...result.rows.filter((r) => !old.rows.some((o) => o.id === r.id)),
                    ]
                  : result.rows,
            }));
        } catch {
          if (!controller.signal.aborted)
            setData({
              key,
              rows: [],
              links: [],
              hasMore: false,
              page,
              error: 'Le catalogue est indisponible. Réessayez.',
            });
        }
      },
      query.trim() ? 220 : 0,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // Only catalogue criteria refresh these results; successful visit mutations keep them intact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guild, plan.id, key, page, source]);
  const rows = ready?.rows ?? [];
  async function insert(entry: CatalogEntry, target: CatalogPlacement) {
    if (adding.current || busy || !canAdd)
      return { ok: false as const, error: 'Cet ajout n’est pas disponible.' };
    if (parentId && !parent) {
      const error = 'Cette activité ne fait plus partie du voyage.';
      setError(error);
      return { ok: false as const, error };
    }
    adding.current = true;
    setError('');
    try {
      const time = target.time;
      const suggested = entry.suggested_duration_minutes;
      const duration =
        target.duration !== undefined
          ? target.duration
          : suggested && Number.isInteger(suggested) && suggested > 0 && suggested <= 1440
            ? suggested
            : null;
      const result = await add(entry, target.day, time, undefined, target.parent, {
        before: target.before,
        duration:
          time && duration != null
            ? Math.min(duration, 1440 - Number(time.slice(0, 2)) * 60 - Number(time.slice(3, 5)))
            : duration,
      });
      if (result.ok && result.id)
        setReceipt({ id: result.id, title: entry.title, stop: !!target.parent });
      else if (!result.ok) setError(result.error);
      return result;
    } finally {
      adding.current = false;
    }
  }
  const title = parent?.entry?.title ?? (parent ? 'Cette activité' : 'Activité indisponible');
  const heading = (
    <div className="trip-picker-heading">
      <div>
        <h2>Explorer le catalogue</h2>
        <p>
          {parentId ? `Ajouter un arrêt · ${title}` : 'Catalogue mondial'}
          {initialTime ? ` · ${initialTime}` : ''}
        </p>
      </div>
      <button
        type="button"
        className="trip-icon-button"
        aria-label="Fermer le catalogue"
        onClick={onClose}
      >
        <X className="size-4" />
      </button>
    </div>
  );
  const content = (
    <>
      {heading}
      <div className="trip-picker-search">
        <Search className="size-4 shrink-0" />
        <input
          role="combobox"
          aria-label="Rechercher un lieu"
          aria-expanded
          aria-controls={source === 'mapbox' ? `${id}-mapbox-results` : `${id}-results`}
          aria-activedescendant={source === 'nagi' && rows[active] ? `${id}-${active}` : undefined}
          value={query}
          maxLength={100}
          type="search"
          autoComplete="off"
          placeholder="Rechercher un lieu, une activité, un restaurant…"
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (source === 'mapbox') {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const cards = document.querySelectorAll<HTMLElement>('[data-external-place-card]');
                cards[e.key === 'ArrowDown' ? 0 : cards.length - 1]?.focus();
              }
              if (e.key === 'Enter' && !e.repeat) {
                e.preventDefault();
                setMapboxRequest({ query: query.trim(), nonce: Date.now() });
              }
              return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const next =
                (active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % (rows.length || 1);
              setActive(next);
              document.getElementById(`${id}-${next}`)?.scrollIntoView({ block: 'nearest' });
            }
            if (e.key === 'Enter' && rows[active]) {
              e.preventDefault();
              if (e.repeat) return;
              if (!canAdd) {
                onPreview(rows[active]);
                return;
              }
              document
                .getElementById(`${id}-${active}`)
                ?.querySelector<HTMLButtonElement>('.trip-picker-add')
                ?.click();
            }
          }}
        />
        {source === 'mapbox' && (
          <button
            type="button"
            className="trip-icon-button"
            aria-label="Rechercher sur Mapbox"
            onClick={() => setMapboxRequest({ query: query.trim(), nonce: Date.now() })}
          >
            <Search className="size-4" />
          </button>
        )}
        {source === 'mapbox' && mapboxBusy && (
          <LoaderCircle
            className="size-4 animate-spin text-muted-foreground"
            aria-label="Recherche Mapbox en cours"
          />
        )}
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="trip-icon-button"
              aria-label="Filtrer le catalogue"
              data-active={
                source === 'nagi'
                  ? Boolean(category || country || city || area)
                  : Boolean(mapboxFilters.type || !mapboxFilters.destination)
              }
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="trip-picker-filters"
            aria-label="Filtres du catalogue"
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setFiltersOpen(false);
            }}
          >
            {source === 'mapbox' ? (
              <>
                <label className="grid gap-1 text-xs font-semibold">
                  Type de lieu
                  <CatalogSelect
                    value={mapboxFilters.type}
                    onChange={(e) => setMapboxFilters((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="">Tous les types</option>
                    {mapboxPlaceTypes.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </CatalogSelect>
                </label>
                <label className="trip-external-bias">
                  <input
                    type="checkbox"
                    checked={mapboxFilters.destination}
                    onChange={(e) =>
                      setMapboxFilters((f) => ({ ...f, destination: e.target.checked }))
                    }
                  />
                  Privilégier la destination du voyage
                </label>
              </>
            ) : (
              <>
                <label className="grid gap-1 text-xs font-semibold">
                  Catégorie
                  <CatalogSelect
                    aria-label="Catégorie"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">Toutes les catégories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </CatalogSelect>
                </label>
                <CatalogPicker
                  name="picker-country"
                  label="Pays"
                  value={country}
                  selectedName={(c) => c.name}
                  search={(q) => tripPlaceOptions(guild, 'countries', q)}
                  onSelect={(c) => {
                    setCountry(c);
                    setCity(undefined);
                    setArea(undefined);
                    setPage(0);
                  }}
                />
                <CatalogPicker
                  key={country?.id ?? 'country'}
                  name="picker-city"
                  label="Ville"
                  value={city}
                  disabled={!country}
                  selectedName={(c) => c.name}
                  search={(q) => tripPlaceOptions(guild, 'cities', q, country?.id)}
                  onSelect={(c) => {
                    setCity(c);
                    setArea(undefined);
                    setPage(0);
                  }}
                />
                {city?.has_neighborhoods && (
                  <CatalogPicker
                    key={city.id}
                    name="picker-area"
                    label="Quartier"
                    value={area}
                    selectedName={(c) => c.name}
                    search={(q) => tripPlaceOptions(guild, 'neighborhoods', q, city.id)}
                    onSelect={(c) => {
                      setArea(c);
                      setPage(0);
                    }}
                  />
                )}
              </>
            )}
            {canAdd && (
              <label className="grid gap-1 text-xs font-semibold">
                Durée par défaut · minutes
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={defaultDuration}
                  aria-label="Durée par défaut des nouvelles visites"
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isInteger(value) || value < 1 || value > 1440) return;
                    setDefaultDuration(value);
                    try {
                      localStorage.setItem(catalogDurationKey, String(value));
                    } catch {
                      /* Optional preference. */
                    }
                  }}
                />
                <small className="text-muted-foreground">
                  Pour les lieux glissés dans le calendrier sans durée conseillée.
                </small>
              </label>
            )}
          </PopoverContent>
        </Popover>
      </div>
      {canAdd && !parentId && (
        <div className="trip-picker-target">
          <label htmlFor={`${id}-target`}>Ajouter à</label>
          <TripDaySelect
            id={`${id}-target`}
            days={plan.days}
            value={day ?? ''}
            onChange={(v) => {
              onDayChange(v || null);
              setPage(0);
            }}
          />
        </div>
      )}
      {addSource && (
        <div className="trip-source-tabs" role="tablist" aria-label="Source des lieux">
          {(['nagi', 'mapbox'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={source === value}
              onClick={() => setSource(value)}
              onKeyDown={(event) => {
                if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 'nagi'
                      : event.key === 'End'
                        ? 'mapbox'
                        : value === 'nagi'
                          ? 'mapbox'
                          : 'nagi';
                  setSource(next);
                  (
                    event.currentTarget.parentElement?.querySelectorAll('button')[
                      next === 'nagi' ? 0 : 1
                    ] as HTMLButtonElement | undefined
                  )?.focus();
                }
              }}
            >
              {value === 'nagi' ? 'Nagi' : 'Mapbox'}
            </button>
          ))}
        </div>
      )}
      {addSource && (
        <div hidden={source !== 'mapbox'}>
          <MapboxPlaceSearch
            resultsId={`${id}-mapbox-results`}
            query={query}
            active={source === 'mapbox'}
            filters={mapboxFilters}
            onLoading={setMapboxBusy}
            request={mapboxRequest}
            plan={plan}
            placement={placement}
            defaultDuration={defaultDuration}
            canAdd={canAdd && !busy && (!parentId || !!parent)}
            add={addSource}
          />
        </div>
      )}
      <div className="trip-source-nagi" hidden={source !== 'nagi'}>
        {(category || country || city || area) && (
          <div className="trip-picker-chips">
            {category && (
              <button
                type="button"
                onClick={() => {
                  setCategory('');
                  setPage(0);
                }}
              >
                {categories.find((c) => c.id === category)?.name}
                <X className="size-3" />
              </button>
            )}
            {country && (
              <button
                type="button"
                onClick={() => {
                  setCountry(undefined);
                  setCity(undefined);
                  setArea(undefined);
                  setPage(0);
                }}
              >
                {country.name}
                <X className="size-3" />
              </button>
            )}
            {city && (
              <button
                type="button"
                onClick={() => {
                  setCity(undefined);
                  setArea(undefined);
                  setPage(0);
                }}
              >
                {city.name}
                <X className="size-3" />
              </button>
            )}
            {area && (
              <button
                type="button"
                onClick={() => {
                  setArea(undefined);
                  setPage(0);
                }}
              >
                {area.name}
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
        {canAdd && hint && (
          <p className="trip-catalog-hint">Glissez un lieu directement dans votre itinéraire.</p>
        )}
        <div className="trip-picker-results">
          <p className="trip-section-caption">
            {ready?.suggested
              ? parentId
                ? 'Fiches liées à cette activité et lieux proches'
                : 'Pour votre voyage'
              : 'Catalogue mondial'}
          </p>
          <ul role="listbox" aria-label="Lieux du catalogue" id={`${id}-results`}>
            {rows.map((entry, i) => {
              const relation = ready?.links.find((l) => l.entry.id === entry.id);
              return (
                <CatalogResult
                  key={entry.id}
                  entry={entry}
                  plan={plan}
                  placement={placement}
                  defaultDuration={defaultDuration}
                  draggable
                  canAdd={canAdd && !busy && (!parentId || !!parent)}
                  active={active === i}
                  id={`${id}-${i}`}
                  onActive={() => setActive(i)}
                  insert={(placement) => insert(entry, placement)}
                >
                  <CatalogPlaceCard entry={entry} onClick={() => onPreview(entry)}>
                    {relation && (
                      <em>
                        {relation.from} · {relation.label}
                      </em>
                    )}
                  </CatalogPlaceCard>
                </CatalogResult>
              );
            })}
          </ul>
          {!ready ? (
            <p role="status" className="trip-empty-inline">
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> Recherche…
            </p>
          ) : ready.error ? (
            <p role="alert" className="trip-empty-inline">
              {ready.error}
              <button type="button" onClick={() => setRetry((v) => v + 1)}>
                Réessayer
              </button>
            </p>
          ) : !rows.length ? (
            <p role="status" className="trip-empty-inline">
              Aucun lieu trouvé dans Nagi.
              {addSource && (
                <button
                  type="button"
                  onClick={() => {
                    setSource('mapbox');
                    setMapboxRequest({ query: query.trim(), nonce: Date.now() });
                  }}
                >
                  Rechercher sur Mapbox
                </button>
              )}
            </p>
          ) : null}
          {ready?.hasMore && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              disabled={ready.page !== page}
              onClick={() => setPage((v) => v + 1)}
            >
              Voir plus de lieux
            </Button>
          )}
        </div>
      </div>
      {addSource && canAdd && (
        <button type="button" className="trip-custom-create" onClick={() => setCustomOpen(true)}>
          Créer une étape personnalisée
        </button>
      )}
      {addSource && canAdd && customOpen && (
        <CustomStepDialog
          open
          onClose={() => setCustomOpen(false)}
          add={addSource}
          placement={{
            day: (parent?.trip_day_id ?? day) || null,
            parent: parentId,
            time: initialTime,
          }}
        />
      )}
      <footer className="trip-picker-footer">
        <div aria-live="polite">
          {receipt ? (
            <>
              <Check className="size-3" /> Ajouté{' '}
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const r = await mutate({
                    operation: receipt.stop ? 'delete_stop' : 'delete_item',
                    data: { id: receipt.id },
                  });
                  if (r.ok) setReceipt(undefined);
                  else setError(r.error);
                }}
              >
                Annuler
              </button>
            </>
          ) : (
            <span>
              {canAdd
                ? parentId
                  ? 'Ajoutez plusieurs arrêts à cette activité.'
                  : 'Plusieurs lieux, sans quitter votre voyage.'
                : 'Le catalogue, sans quitter votre voyage.'}
            </span>
          )}
        </div>
        <Button size="sm" disabled={busy} onClick={onClose}>
          Terminé
        </Button>
      </footer>
      {error && (
        <p role="alert" className="trip-inline-error">
          {error}
        </p>
      )}
    </>
  );
  return <div className="trip-picker-panel">{content}</div>;
}
