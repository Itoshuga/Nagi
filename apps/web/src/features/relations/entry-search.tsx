'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  LoaderCircle,
  Pencil,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@nagi/ui';
import type { CatalogCategory, CatalogLocation, EntryCardRow } from '@nagi/database';
import { EntryImage } from '@/features/media/image';

export type RelationEntry = Pick<
  EntryCardRow,
  'id' | 'title' | 'cover_image_url' | 'category' | 'country' | 'city' | 'neighborhood'
>;
export function RelatedEntry({
  entry,
  compact = false,
}: {
  entry: RelationEntry;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <EntryImage
        src={entry.cover_image_url}
        className={`${compact ? 'h-10 w-12' : 'h-14 w-16'} shrink-0 rounded-xl`}
        sizes="64px"
      />
      <div className="min-w-0">
        <span className="block break-words text-sm font-bold leading-6">{entry.title}</span>
        <span className="block break-words text-[11px] leading-5 text-muted-foreground">
          {[entry.category?.name, entry.country?.name, entry.city?.name, entry.neighborhood?.name]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
    </div>
  );
}
export function RelationEntrySummary({ entry }: { entry: RelationEntry }) {
  const location = entry.neighborhood?.name ?? entry.city?.name ?? entry.country?.name;
  return (
    <span className="relation-subject">
      <EntryImage
        src={entry.cover_image_url}
        className="size-11 shrink-0 rounded-xl"
        sizes="44px"
      />
      <span className="min-w-0 flex-1">
        <span className="relation-subject-title">{entry.title}</span>
        <span className="relation-subject-location">
          {[entry.category?.name, location].filter(Boolean).join(' · ')}
        </span>
      </span>
    </span>
  );
}

type Mode = 'entries' | 'category' | 'country' | 'city' | 'neighborhood';
type Filters = {
  category?: CatalogCategory;
  country?: CatalogLocation;
  city?: CatalogLocation;
  neighborhood?: CatalogLocation;
};
type Results = {
  key: string;
  rows: EntryCardRow[];
  hasMore: boolean;
  suggested?: boolean;
  page: number;
  error?: string;
};
const searchUrl = '/admin/relations/search';
const modeLabels = {
  entries: 'Rechercher une fiche',
  category: 'Choisir une catégorie',
  country: 'Choisir un pays',
  city: 'Choisir une ville',
  neighborhood: 'Choisir un quartier',
};
export function RelationEntryPicker({
  current,
  categories,
  value,
  onSelect,
  disabled,
  open,
  onOpenChange,
  escapeRef,
}: {
  current: RelationEntry;
  categories: CatalogCategory[];
  value?: EntryCardRow;
  onSelect: (entry: EntryCardRow) => void;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  escapeRef: React.RefObject<(() => void) | null>;
}) {
  const reducedMotion = useReducedMotion();
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('entries'),
    [query, setQuery] = useState(''),
    [filterQuery, setFilterQuery] = useState(''),
    [filters, setFilters] = useState<Filters>({}),
    [showFilters, setShowFilters] = useState(false),
    [active, setActive] = useState(0),
    [retry, setRetry] = useState(0);
  const [data, setData] = useState<Results>(),
    [locations, setLocations] = useState<{
      key: string;
      rows: CatalogLocation[];
      error?: string;
    }>(),
    [loading, setLoading] = useState(false);
  const moreAbort = useRef<AbortController | null>(null),
    requestVersion = useRef(0);
  const key = JSON.stringify([
    current.id,
    query.trim(),
    filters.category?.id,
    filters.country?.id,
    filters.city?.id,
    filters.neighborhood?.id,
    retry,
  ]);
  const locationKey = JSON.stringify([
    mode,
    filterQuery,
    filters.country?.id,
    filters.city?.id,
    retry,
  ]);
  const ready = data?.key === key ? data : undefined,
    locationReady = locations?.key === locationKey ? locations : undefined;
  const filterCount = Object.values(filters).filter(Boolean).length;
  function entriesParams(page = 0) {
    const p = new URLSearchParams({ exclude: current.id, q: query.trim(), page: String(page) });
    for (const k of ['category', 'country', 'city', 'neighborhood'] as const)
      if (filters[k]) p.set(k, filters[k].id);
    return p;
  }
  function focusSearch() {
    requestAnimationFrame(() => input.current?.focus());
  }
  function changeMode(next: Mode) {
    setMode(next);
    setFilterQuery('');
    setActive(0);
    focusSearch();
  }
  function escape() {
    if (mode !== 'entries') changeMode('entries');
    else onOpenChange(false);
  }
  useEffect(() => {
    escapeRef.current = escape;
    return () => {
      escapeRef.current = null;
    };
  });
  useEffect(() => {
    if (!open || mode !== 'entries') return;
    const controller = new AbortController();
    const version = ++requestVersion.current;
    moreAbort.current?.abort();
    const timer = setTimeout(
      async () => {
        setLoading(true);
        try {
          const response = await fetch(`${searchUrl}?${entriesParams()}`, {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!response.ok) throw new Error('search');
          const result = (await response.json()) as {
            rows: EntryCardRow[];
            hasMore: boolean;
            suggested?: boolean;
          };
          if (!controller.signal.aborted && version === requestVersion.current)
            setData({ key, ...result, page: 0 });
        } catch {
          if (!controller.signal.aborted && version === requestVersion.current)
            setData({
              key,
              rows: [],
              hasMore: false,
              page: 0,
              error: 'La recherche est indisponible.',
            });
        } finally {
          if (!controller.signal.aborted && version === requestVersion.current) setLoading(false);
        }
      },
      query.trim() ? 220 : 0,
    );
    return () => {
      controller.abort();
      moreAbort.current?.abort();
      clearTimeout(timer);
    };
    // Primitive keys deliberately keep type selection and unrelated renders out of the search lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, key]);
  useEffect(() => {
    if (!open || mode === 'entries' || mode === 'category') return;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        const kind =
          mode === 'country' ? 'countries' : mode === 'city' ? 'cities' : 'neighborhoods';
        const p = new URLSearchParams({ mode: 'locations', kind, q: filterQuery });
        const parent =
          mode === 'city'
            ? filters.country?.id
            : mode === 'neighborhood'
              ? filters.city?.id
              : undefined;
        if (parent) p.set('parent', parent);
        try {
          const response = await fetch(`${searchUrl}?${p}`, {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!response.ok) throw new Error('locations');
          const result = (await response.json()) as { rows: CatalogLocation[] };
          if (!controller.signal.aborted) setLocations({ key: locationKey, rows: result.rows });
        } catch {
          if (!controller.signal.aborted)
            setLocations({
              key: locationKey,
              rows: [],
              error: 'Impossible de charger ces destinations.',
            });
        }
      },
      filterQuery ? 180 : 0,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, locationKey]);
  useEffect(() => {
    if (!open) moreAbort.current?.abort();
    return () => moreAbort.current?.abort();
  }, [open]);
  async function more() {
    if (!ready || loading) return;
    const controller = new AbortController();
    moreAbort.current = controller;
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const response = await fetch(`${searchUrl}?${entriesParams(ready.page + 1)}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('more');
      const result = (await response.json()) as { rows: EntryCardRow[]; hasMore: boolean };
      if (!controller.signal.aborted && version === requestVersion.current)
        setData((old) =>
          old?.key === key
            ? {
                ...old,
                rows: [
                  ...old.rows,
                  ...result.rows.filter((r) => !old.rows.some((v) => v.id === r.id)),
                ],
                hasMore: result.hasMore,
                page: old.page + 1,
                error: undefined,
              }
            : old,
        );
    } catch {
      if (!controller.signal.aborted)
        setData((old) =>
          old?.key === key ? { ...old, error: 'Impossible de charger la suite.' } : old,
        );
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) setLoading(false);
    }
  }
  function chooseFilter(row: CatalogLocation | CatalogCategory) {
    setFilters((old) =>
      mode === 'country'
        ? { category: old.category, country: row }
        : mode === 'city'
          ? { ...old, city: row, neighborhood: undefined }
          : mode === 'neighborhood'
            ? { ...old, neighborhood: row }
            : { ...old, category: row as CatalogCategory },
    );
    changeMode('entries');
  }
  function clearFilter(which: keyof Filters) {
    setFilters((old) =>
      which === 'country'
        ? { category: old.category }
        : which === 'city'
          ? { ...old, city: undefined, neighborhood: undefined }
          : { ...old, [which]: undefined },
    );
    setActive(0);
  }
  const filterRows =
    mode === 'category'
      ? categories.filter((c) =>
          c.name.toLocaleLowerCase('fr').includes(filterQuery.toLocaleLowerCase('fr')),
        )
      : (locationReady?.rows ?? []);
  const rows = mode === 'entries' ? (ready?.rows ?? []) : filterRows;
  const index = rows.length ? Math.min(active, rows.length - 1) : -1;
  function pick(i: number) {
    const row = rows[i];
    if (!row || disabled) return;
    if (mode === 'entries') {
      onSelect(row as EntryCardRow);
      onOpenChange(false);
    } else chooseFilter(row as CatalogLocation);
  }
  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setMode('entries');
          setActive(0);
        }
        onOpenChange(next);
      }}
    >
      <input type="hidden" name="target" value={value?.id ?? ''} />
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          className={`relation-object-trigger${value ? ' has-selection' : ''}`}
          disabled={disabled}
          aria-label={
            value ? `Changer la fiche associée : ${value.title}` : 'Sélectionner une fiche'
          }
        >
          {value ? (
            <motion.span
              key={value.id}
              className="flex min-w-0 flex-1 items-center gap-3"
              initial={{ opacity: reducedMotion ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reducedMotion ? 0 : 0.12 }}
            >
              <RelationEntrySummary entry={value} />
              <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </motion.span>
          ) : (
            <>
              <span className="relation-object-search-icon">
                <Search className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[13px] font-semibold">Sélectionner une fiche</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Rechercher dans le catalogue
                </span>
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="relation-entry-palette"
        aria-label="Sélectionner une fiche du catalogue"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          trigger.current?.focus();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          escape();
        }}
      >
        <div className="relation-command-search">
          {mode !== 'entries' ? (
            <button
              type="button"
              className="relation-palette-icon"
              aria-label="Retour aux fiches"
              onClick={() => changeMode('entries')}
            >
              <ArrowLeft className="size-4" />
            </button>
          ) : (
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <input
            ref={input}
            type="search"
            value={mode === 'entries' ? query : filterQuery}
            onChange={(e) => {
              if (mode === 'entries') setQuery(e.target.value);
              else setFilterQuery(e.target.value);
              setActive(0);
            }}
            maxLength={180}
            aria-label={modeLabels[mode]}
            role="combobox"
            aria-expanded
            aria-autocomplete="list"
            aria-controls={`${id}-list`}
            aria-activedescendant={index >= 0 ? `${id}-${index}` : undefined}
            placeholder={mode === 'entries' ? 'Rechercher une fiche…' : `${modeLabels[mode]}…`}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const next = rows.length
                  ? (index + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
                  : 0;
                setActive(next);
                document.getElementById(`${id}-${next}`)?.scrollIntoView({ block: 'nearest' });
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                pick(index);
              }
            }}
          />
          {mode === 'entries' && (
            <button
              type="button"
              className="relation-palette-icon"
              aria-label="Filtres"
              aria-expanded={showFilters}
              data-active={filterCount > 0 || showFilters}
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal className="size-4" />
              {filterCount > 0 && <span className="relation-filter-count">{filterCount}</span>}
            </button>
          )}
        </div>
        {mode === 'entries' && showFilters && (
          <div className="relation-palette-filters" aria-label="Filtres du catalogue">
            {(
              [
                { key: 'category', label: 'Catégorie', disabled: false },
                { key: 'country', label: 'Pays', disabled: false },
                { key: 'city', label: 'Ville', disabled: !filters.country },
                {
                  key: 'neighborhood',
                  label: 'Quartier',
                  disabled: !filters.city?.has_neighborhoods,
                },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                disabled={f.disabled}
                onClick={() => changeMode(f.key)}
              >
                <span>{f.label}</span>
                <span className="truncate">{filters[f.key]?.name ?? 'Tous'}</span>
                <ChevronDown className="size-3" />
              </button>
            ))}
          </div>
        )}
        {mode === 'entries' && filterCount > 0 && (
          <div className="relation-filter-chips">
            {(['category', 'country', 'city', 'neighborhood'] as const).map(
              (f) =>
                filters[f] && (
                  <button
                    key={f}
                    type="button"
                    aria-label={`Retirer le filtre ${filters[f].name}`}
                    onClick={() => clearFilter(f)}
                  >
                    {filters[f].name}
                    <X className="size-3" />
                  </button>
                ),
            )}
          </div>
        )}
        <div className="relation-palette-caption">
          <span>
            {mode !== 'entries' ? modeLabels[mode] : ready?.suggested ? 'Suggestions' : 'Catalogue'}
          </span>
          {mode === 'entries' && loading && (
            <LoaderCircle
              className="size-3 animate-spin motion-reduce:animate-none"
              aria-label="Recherche en cours"
            />
          )}
        </div>
        <div className="relation-palette-results">
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label={mode === 'entries' ? 'Fiches du catalogue' : modeLabels[mode]}
          >
            {rows.map((row, i) => (
              <li key={row.id}>
                <button
                  id={`${id}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={
                    mode === 'entries' ? value?.id === row.id : filters[mode]?.id === row.id
                  }
                  tabIndex={index === i ? 0 : -1}
                  className="relation-palette-option"
                  data-active={index === i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      const next =
                        (i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
                      setActive(next);
                      document.getElementById(`${id}-${next}`)?.focus();
                    }
                  }}
                >
                  {mode === 'entries' ? (
                    <>
                      <EntryImage
                        src={(row as EntryCardRow).cover_image_url}
                        className="size-10 shrink-0 rounded-lg"
                        sizes="40px"
                      />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-xs font-semibold">
                          {(row as EntryCardRow).title}
                        </strong>
                        <small className="block truncate text-[10px] text-muted-foreground">
                          {[
                            (row as EntryCardRow).category?.name,
                            (row as EntryCardRow).neighborhood?.name,
                            (row as EntryCardRow).city?.name,
                            (row as EntryCardRow).country?.name,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </span>
                      {value?.id === row.id && <Check className="size-3.5 text-primary-ink" />}
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {(row as CatalogLocation).name}
                      </span>
                      {filters[mode]?.id === row.id && (
                        <Check className="size-3.5 text-primary-ink" />
                      )}
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {(mode === 'entries' && (!ready || (loading && !rows.length))) ||
          (mode !== 'entries' && mode !== 'category' && !locationReady) ? (
            <p role="status" className="relation-palette-empty">
              Recherche…
            </p>
          ) : !rows.length ? (
            <p role="status" className="relation-palette-empty">
              {(mode === 'entries' ? ready?.error : locationReady?.error) ??
                'Aucun résultat. Essayez un autre nom ou filtre.'}
            </p>
          ) : null}
          {mode === 'entries' && ready?.error && rows.length > 0 && (
            <p role="alert" className="px-4 py-2 text-xs text-destructive">
              {ready.error}
            </p>
          )}
          {(mode === 'entries' ? ready?.error : locationReady?.error) && (
            <button
              type="button"
              className="relation-palette-more"
              onClick={() => setRetry((v) => v + 1)}
            >
              Réessayer
            </button>
          )}
          {mode === 'entries' && ready?.hasMore && !ready.error && (
            <button
              type="button"
              className="relation-palette-more"
              disabled={loading}
              onClick={() => void more()}
            >
              Voir plus de fiches
            </button>
          )}
        </div>
        <div className="relation-palette-hint">
          <span>↑↓ parcourir</span>
          <span>↵ choisir</span>
          <span>esc fermer</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
