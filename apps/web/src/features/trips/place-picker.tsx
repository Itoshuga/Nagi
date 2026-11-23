'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, LoaderCircle, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@nagi/ui';
import type { CatalogLocation, EntryCardRow, TripCatalogLink, TripPlan } from '@nagi/database';
import { CatalogPicker } from '@/features/catalog/picker';
import { CatalogSelect } from '@/features/catalog/admin-form';
import { tripPlaceOptions } from './actions';
import { dayLabel, TripDaySelect } from './add-place-dialog';
import type { PlaceAdder, PlanMutation, SourcePlaceAdder } from './planner-model';
import { CustomStepDialog, MapboxPlaceSearch } from './source-places';
import { CatalogPlaceCard } from './catalog-place-card';
import {
  defaultMapboxFilters,
  mapboxPlaceTypes,
} from '@/features/integrations/mapbox/search-model';
import { CatalogResult } from './catalog-result';
import {
  catalogDuration,
  catalogDurationKey,
  catalogHintKey,
  type CatalogEntry,
  type CatalogPlacement,
} from './catalog-drag';

export function TripPlacePicker({
  guild,
  plan,
  categories,
  initialDay,
  initialTime,
  initialEntry,
  add,
  mutate,
  busy,
  onClose,
  onPreview,
  panel = false,
  canAdd = true,
  parentId,
  addSource,
}: {
  guild: string;
  plan: TripPlan;
  categories: { id: string; name: string }[];
  initialDay: string | null;
  initialTime?: string;
  initialEntry?: EntryCardRow;
  add: PlaceAdder;
  mutate: PlanMutation;
  busy: boolean;
  onClose: () => void;
  onPreview: (entry: EntryCardRow) => void;
  panel?: boolean;
  canAdd?: boolean;
  parentId?: string;
  addSource?: SourcePlaceAdder;
}) {
  const [day, setDay] = useState(initialDay ?? ''),
    [query, setQuery] = useState(initialEntry?.title.slice(0, 100) ?? '');
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
  const [receipt, setReceipt] = useState<{ id: string; title: string }>(),
    [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null),
    id = useId(),
    adding = useRef(false);
  const [viewport, setViewport] = useState<{ height: number; bottom: number }>();
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
  useEffect(() => {
    const visual = window.visualViewport;
    const update = () => {
      if (matchMedia('(max-width: 639px)').matches && visual)
        setViewport({
          height: visual.height,
          bottom: Math.max(0, window.innerHeight - visual.height - visual.offsetTop),
        });
      else setViewport(undefined);
    };
    update();
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
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
    input.current?.focus();
  }, []);
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
  async function insert(entry: CatalogEntry, placement?: CatalogPlacement) {
    if (adding.current || busy || !canAdd) return;
    if (parentId && !parent) {
      setError('Cette activité ne fait plus partie du voyage.');
      return;
    }
    adding.current = true;
    setError('');
    try {
      const result = await add(
        entry,
        placement ? placement.day : parentId ? parent!.trip_day_id : day || null,
        placement?.time ?? initialTime,
        undefined,
        placement?.parent ?? parentId,
        {
          ...placement,
          duration:
            placement?.time || initialTime
              ? Math.min(
                  catalogDuration(entry, defaultDuration),
                  1440 -
                    Number((placement?.time ?? initialTime)!.slice(0, 2)) * 60 -
                    Number((placement?.time ?? initialTime)!.slice(3, 5)),
                )
              : null,
        },
      );
      if (result.ok && result.id) setReceipt({ id: result.id, title: entry.title });
      else if (!result.ok) setError(result.error);
    } finally {
      adding.current = false;
    }
  }
  const target = plan.days.find((d) => d.id === day),
    title = parentId
      ? (parent?.entry?.title ?? 'Activité indisponible')
      : target
        ? dayLabel(target, plan.days)
        : 'À organiser';
  const heading = (
    <div className="trip-picker-heading">
      <div>
        {panel ? (
          <h2>Explorer le catalogue</h2>
        ) : (
          <DialogTitle>{parentId ? 'Ajouter un arrêt' : 'Ajouter une étape'}</DialogTitle>
        )}
        {panel ? (
          <p>
            Catalogue mondial
            {initialTime ? ` · ${initialTime}` : ''}
          </p>
        ) : (
          <DialogDescription>
            {title}
            {initialTime ? ` · ${initialTime}` : ''}
          </DialogDescription>
        )}
      </div>
      {panel && (
        <button
          type="button"
          className="trip-icon-button"
          aria-label="Fermer le catalogue"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
  const content = (
    <>
      {heading}
      <div className="trip-picker-search">
        <Search className="size-4 shrink-0" />
        <input
          ref={input}
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
              if (panel)
                document
                  .getElementById(`${id}-${active}`)
                  ?.querySelector<HTMLButtonElement>('.trip-catalog-action')
                  ?.click();
              else void insert(rows[active]);
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
                  Pour les créneaux sans durée conseillée. Modifiable ensuite.
                </small>
              </label>
            )}
          </PopoverContent>
        </Popover>
      </div>
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
            day={day || null}
            parent={parentId}
            time={initialTime}
            defaultDuration={defaultDuration}
            canAdd={canAdd}
            panel={panel}
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
        {canAdd && !parentId && !panel && (
          <div className="trip-picker-target">
            <label htmlFor={`${id}-target`}>Ajouter à</label>
            <TripDaySelect
              id={`${id}-target`}
              days={plan.days}
              value={day}
              onChange={(v) => {
                setDay(v);
                setPage(0);
              }}
            />
          </div>
        )}
        {panel && canAdd && hint && (
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
                  initialDay={day || null}
                  defaultDuration={defaultDuration}
                  draggable={panel}
                  canAdd={canAdd}
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
                  {canAdd && !panel && (
                    <button
                      type="button"
                      className="trip-picker-add"
                      disabled={busy || (!!parentId && !parent)}
                      aria-label={`Ajouter ${entry.title}`}
                      onClick={() => void insert(entry)}
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
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
      {addSource && customOpen && (
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
                    operation: parentId ? 'delete_stop' : 'delete_item',
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
  return panel ? (
    <div className="trip-picker-panel">{content}</div>
  ) : (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !filtersOpen && !busy) onClose();
      }}
    >
      <DialogContent
        className="trip-place-dialog"
        style={
          viewport
            ? {
                height: Math.min(660, viewport.height - 24),
                maxHeight: viewport.height - 24,
                bottom: viewport.bottom,
              }
            : undefined
        }
        closeDisabled={busy}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
          else if (filtersOpen) {
            e.preventDefault();
            setFiltersOpen(false);
          }
        }}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
