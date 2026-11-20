'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, LoaderCircle, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  Button,
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
import { EntryImage } from '@/features/media/image';
import { tripPlaceOptions } from './actions';
import { dayLabel, TripDaySelect } from './add-place-dialog';
import type { PlaceAdder, PlanMutation } from './planner-model';

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
}) {
  const [day, setDay] = useState(initialDay ?? ''),
    [query, setQuery] = useState(initialEntry?.title.slice(0, 100) ?? '');
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
    rows: EntryCardRow[];
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
  const alreadyHere = (entryId: string) =>
    parentId
      ? !!parent?.stops.some((stop) => stop.entry_id === entryId)
      : plan.items.some((item) => item.entry_id === entryId && item.trip_day_id === (day || null));
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
  const sourceIds = plan.items
    .filter((i) => !day || i.trip_day_id === day)
    .map((i) => i.entry_id)
    .join(',');
  const ready = data?.key === key ? data : undefined;
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
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
    // Only catalogue criteria and real itinerary changes refresh the search, never unrelated UI state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guild, plan.id, key, page, sourceIds]);
  const rows = (ready?.rows ?? []).filter((entry) => !parentId || entry.id !== parent?.entry_id);
  async function insert(entry: EntryCardRow, repeat = false) {
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
        parentId ? parent!.trip_day_id : day || null,
        initialTime,
        repeat,
        parentId,
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
            {canAdd ? title : 'Catalogue mondial'}
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
          aria-controls={`${id}-results`}
          aria-activedescendant={rows[active] ? `${id}-${active}` : undefined}
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
              if (alreadyHere(rows[active]!.id))
                setError('Ce lieu est déjà prévu ici. Utilisez Revisiter pour une autre visite.');
              else void insert(rows[active]);
            }
          }}
        />
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="trip-icon-button"
              aria-label="Filtrer le catalogue"
              data-active={Boolean(category || country || city || area)}
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
          </PopoverContent>
        </Popover>
      </div>
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
      {canAdd && !parentId && (
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
            const same = alreadyHere(entry.id);
            const elsewhere =
              !same &&
              plan.items.some(
                (item) =>
                  item.entry_id === entry.id ||
                  item.stops.some((stop) => stop.entry_id === entry.id),
              );
            const inside = plan.items.find((item) =>
              item.stops.some((stop) => stop.entry_id === entry.id),
            );
            const relation = ready?.links.find((l) => l.entry.id === entry.id);
            return (
              <li
                key={entry.id}
                id={`${id}-${i}`}
                role="option"
                aria-selected={active === i}
                data-active={active === i}
                onMouseMove={() => setActive(i)}
              >
                <button
                  type="button"
                  className="trip-picker-preview"
                  onClick={() => onPreview(entry)}
                  aria-label={`Aperçu de ${entry.title}`}
                >
                  <EntryImage
                    src={entry.cover_image_url}
                    className="size-11 shrink-0 rounded-xl"
                    sizes="44px"
                  />
                  <span>
                    <strong>{entry.title}</strong>
                    <small>
                      {[
                        entry.category?.name,
                        entry.neighborhood?.name ?? entry.city?.name,
                        entry.country?.name,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                    {relation && (
                      <em>
                        {relation.from} · {relation.label}
                      </em>
                    )}
                    {same ? (
                      <em>
                        {parentId
                          ? 'Déjà dans cette activité'
                          : day
                            ? 'Déjà dans cette journée'
                            : 'Déjà à organiser'}
                      </em>
                    ) : inside ? (
                      <em>Dans {inside.entry?.title ?? 'une activité du voyage'}</em>
                    ) : elsewhere ? (
                      <em>
                        {plan.items.some((i) => i.entry_id === entry.id && !i.trip_day_id)
                          ? 'Déjà à organiser'
                          : 'Présent dans une autre journée'}
                      </em>
                    ) : null}
                  </span>
                </button>
                {canAdd && (
                  <button
                    type="button"
                    className="trip-picker-add"
                    disabled={busy || (!!parentId && !parent)}
                    aria-label={
                      same ? `Ajouter une autre visite de ${entry.title}` : `Ajouter ${entry.title}`
                    }
                    onClick={() => void insert(entry, same)}
                  >
                    {same ? (
                      <>
                        <Check className="size-3.5" />
                        <span>Revisiter</span>
                      </>
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </button>
                )}
              </li>
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
            Aucun lieu trouvé. Essayez un autre nom ou filtre.
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
