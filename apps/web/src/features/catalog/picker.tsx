'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, Search } from 'lucide-react';
import { Button, Input, Label } from '@nagi/ui';

export function CatalogPicker<T extends { id: string }>({
  name,
  label,
  value,
  selectedName,
  onSelect,
  search,
  render,
  disabled = false,
}: {
  name: string;
  label: string;
  value?: T;
  selectedName: (item: T) => string;
  onSelect: (item: T | undefined) => void;
  search: (query: string) => Promise<T[]>;
  render?: (item: T) => ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ query: string; items: T[]; error?: string }>();
  const matches = result?.query === query ? result.items : [];
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);
  useEffect(() => {
    if (!open || value || disabled) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const items = await searchRef.current(query);
        if (!cancelled) setResult({ query, items });
      } catch {
        if (!cancelled)
          setResult({ query, items: [], error: 'La recherche est momentanément indisponible.' });
      }
    }, 190);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, value, disabled]);

  function pick(item: T) {
    setOpen(false);
    setActive(-1);
    setQuery('');
    onSelect(item);
    requestAnimationFrame(() => input.current?.focus());
  }

  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={value?.id ?? ''} />
      <div className="relative flex items-center">
        {value ? (
          <Check aria-hidden="true" className="absolute left-3 size-4 text-primary-ink" />
        ) : (
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
          />
        )}
        <Input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !value}
          aria-controls={open && !value ? `${id}-options` : undefined}
          aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
          value={value ? selectedName(value) : query}
          readOnly={Boolean(value)}
          autoComplete="off"
          maxLength={100}
          disabled={disabled}
          placeholder="Rechercher…"
          className={value ? 'pl-9 pr-20' : 'pl-9'}
          onFocus={() => {
            if (!value) setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.preventDefault();
              setOpen(false);
            }
            if (!value && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault();
              setOpen(true);
              const next =
                event.key === 'ArrowDown'
                  ? Math.min(active + 1, matches.length - 1)
                  : Math.max(active - 1, 0);
              setActive(next);
              document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: 'nearest' });
            }
            if (event.key === 'Enter' && open) {
              event.preventDefault();
              const choice = matches[active] ?? matches[0];
              if (choice) pick(choice);
            }
          }}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-form-change
            className="absolute right-1"
            onClick={() => {
              setResult(undefined);
              setOpen(true);
              onSelect(undefined);
              requestAnimationFrame(() => input.current?.focus());
            }}
          >
            Changer
          </Button>
        )}
      </div>
      {open && !value && !disabled && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-border bg-card shadow-lg">
          <ul
            id={`${id}-options`}
            role="listbox"
            aria-label={label}
            className="max-h-64 overflow-auto p-1"
          >
            {matches.map((item, index) => (
              <li
                key={item.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === active}
                data-form-change
                className="cursor-pointer rounded-lg p-2 text-sm hover:bg-accent aria-selected:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(item)}
              >
                {render ? render(item) : selectedName(item)}
              </li>
            ))}
          </ul>
          {!matches.length && (
            <p role="status" className="px-3 pb-3 text-sm text-muted-foreground">
              {result?.query !== query ? 'Recherche…' : (result.error ?? 'Aucun résultat.')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
