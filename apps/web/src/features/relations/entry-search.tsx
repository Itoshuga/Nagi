'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Input, Label } from '@nagi/ui';
import type { CatalogCategory, CatalogLocation, EntryCardRow } from '@nagi/database';
import { CatalogSelect } from '@/features/catalog/admin-form';
import { CatalogPicker } from '@/features/catalog/picker';
import { EntryImage } from '@/features/media/image';
import { findRelationCountries, findRelationEntries } from './actions';

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
export function RelationEntrySearch({
  current,
  categories,
  value,
  onSelect,
  disabled,
}: {
  current: string;
  categories: CatalogCategory[];
  value?: EntryCardRow;
  onSelect: (entry: EntryCardRow | undefined) => void;
  disabled: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [country, setCountry] = useState<CatalogLocation>();
  const [data, setData] = useState<{
    key: string;
    rows: EntryCardRow[];
    more: boolean;
    page: number;
    error?: string;
  }>();
  const [loading, setLoading] = useState(false),
    [active, setActive] = useState(-1);
  const key = JSON.stringify([query, category, country?.id]);
  const ready = data?.key === key ? data : undefined;
  useEffect(() => {
    if (value || disabled) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await findRelationEntries(
          query,
          current,
          category || undefined,
          country?.id,
          0,
        );
        if (!cancelled) setData({ key, rows: result.rows, more: result.hasMore, page: 0 });
      } catch {
        if (!cancelled)
          setData({
            key,
            rows: [],
            more: false,
            page: 0,
            error: 'La recherche est indisponible. Modifiez la recherche pour réessayer.',
          });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, category, country?.id, current, key, value, disabled]);
  async function more() {
    if (!ready || loading) return;
    setLoading(true);
    try {
      const result = await findRelationEntries(
        query,
        current,
        category || undefined,
        country?.id,
        ready.page + 1,
      );
      setData((old) =>
        old?.key === key
          ? {
              key,
              rows: [
                ...old.rows,
                ...result.rows.filter((r) => !old.rows.some((v) => v.id === r.id)),
              ],
              more: result.hasMore,
              page: old.page + 1,
            }
          : old,
      );
    } catch {
      setData((old) =>
        old ? { ...old, error: 'Impossible de charger la suite. Réessayez.' } : old,
      );
    } finally {
      setLoading(false);
    }
  }
  function pick(entry: EntryCardRow) {
    onSelect(entry);
    setActive(-1);
  }
  return (
    <div className="space-y-4">
      <input type="hidden" name="target" value={value?.id ?? ''} />
      {value ? (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <RelatedEntry entry={value} />
          <div className="flex items-center justify-between gap-2">
            {!value.published ? (
              <span className="text-[10px] text-muted-foreground">Brouillon</span>
            ) : (
              <span />
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                onSelect(undefined);
                requestAnimationFrame(() => input.current?.focus());
              }}
            >
              Changer la fiche
            </Button>
          </div>
        </div>
      ) : (
        <>
          <details className="relation-filters">
            <summary className="rounded text-xs font-medium text-muted-foreground">
              Filtrer par catégorie ou pays
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`${id}-category`}>Catégorie</Label>
                <CatalogSelect
                  id={`${id}-category`}
                  value={category}
                  disabled={disabled}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setActive(-1);
                  }}
                >
                  <option value="">Toutes les catégories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </CatalogSelect>
              </div>
              <CatalogPicker
                name="relation-country-filter"
                label="Pays"
                value={country}
                selectedName={(c) => c.name}
                onSelect={(c) => {
                  setCountry(c);
                  setActive(-1);
                }}
                search={findRelationCountries}
                disabled={disabled}
              />
            </div>
          </details>
          <div>
            <Label htmlFor={`${id}-search`}>Fiche associée</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
              <Input
                ref={input}
                id={`${id}-search`}
                className="pl-9"
                value={query}
                maxLength={180}
                disabled={disabled}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(-1);
                }}
                placeholder="Rechercher dans tout le catalogue…"
                role="combobox"
                aria-expanded
                aria-autocomplete="list"
                aria-controls={`${id}-results`}
                aria-activedescendant={ready?.rows[active] ? `${id}-option-${active}` : undefined}
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const next = Math.max(
                      0,
                      Math.min(
                        (ready?.rows.length ?? 0) - 1,
                        active + (e.key === 'ArrowDown' ? 1 : -1),
                      ),
                    );
                    setActive(next);
                    document
                      .getElementById(`${id}-option-${next}`)
                      ?.scrollIntoView({ block: 'nearest' });
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const row = ready?.rows[active] ?? ready?.rows[0];
                    if (row) pick(row);
                  }
                }}
              />
            </div>
          </div>
          <div className="relation-search-results">
            <ul id={`${id}-results`} role="listbox" aria-label="Fiches du catalogue">
              {ready?.rows.map((entry, i) => (
                <li
                  key={entry.id}
                  id={`${id}-option-${i}`}
                  role="option"
                  aria-selected={active === i}
                  className="cursor-pointer rounded-xl p-3 hover:bg-accent aria-selected:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!disabled) pick(entry);
                  }}
                >
                  <RelatedEntry entry={entry} compact />
                </li>
              ))}
            </ul>
            {loading || !ready ? (
              <p role="status" className="p-4 text-xs text-muted-foreground">
                Recherche…
              </p>
            ) : ready.error ? (
              <p role="alert" className="p-4 text-xs text-destructive">
                {ready.error}
              </p>
            ) : !ready.rows.length ? (
              <p role="status" className="p-4 text-xs text-muted-foreground">
                Aucune fiche trouvée. Essayez un autre nom ou filtre.
              </p>
            ) : null}
            {ready?.more && (
              <Button
                type="button"
                className="m-3"
                size="sm"
                variant="secondary"
                disabled={loading || disabled}
                onClick={() => void more()}
              >
                Voir plus de fiches
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
