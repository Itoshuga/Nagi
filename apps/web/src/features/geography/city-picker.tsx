'use client';

import { useEffect, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Button, Input } from '@nagi/ui';
import { findNeighborhoodCities } from './actions';

export type CityOption = { id: string; name: string; countries: { name: string } | null };

export function CityPicker({
  initial,
  options,
  error,
}: {
  initial?: CityOption;
  options: CityOption[];
  error?: string;
}) {
  const [city, setCity] = useState(initial);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; options: CityOption[]; error?: string }>({
    query: '',
    options,
  });
  useEffect(() => {
    if (city || !query.trim()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const matches = await findNeighborhoodCities(query.trim());
        if (!cancelled) setResults({ query, options: matches });
      } catch {
        if (!cancelled) setResults({ query, options: [], error: 'La recherche est indisponible.' });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [city, query]);
  const current = query.trim() ? results : { query, options };

  return (
    <div>
      <input type="hidden" name="city_id" value={city?.id ?? ''} />
      {city ? (
        <div
          id="city_id"
          tabIndex={-1}
          className="flex items-center justify-between gap-3 rounded-xl border border-input bg-background px-3 py-2 text-sm"
        >
          <span className="flex min-w-0 items-start gap-2">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-ink" />
            <span className="break-words">
              {city.name}
              <span className="block text-xs text-muted-foreground">{city.countries?.name}</span>
            </span>
          </span>
          <Button
            variant="ghost"
            type="button"
            size="sm"
            onClick={() => {
              setQuery('');
              setCity(undefined);
            }}
          >
            Changer
          </Button>
        </div>
      ) : (
        <div>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
            />
            <Input
              id="city_id"
              autoComplete="off"
              maxLength={100}
              placeholder="Rechercher une ville"
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'city_id-error' : 'city-options-helper'}
            />
          </div>
          <p id="city-options-helper" className="mt-2 text-xs text-muted-foreground">
            Villes dont les quartiers sont activés.
          </p>
          {current.query !== query || current.options.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              {current.query !== query
                ? 'Recherche…'
                : (current.error ?? 'Aucune ville disponible.')}
            </p>
          ) : (
            <ul
              aria-label="Villes proposées"
              className="mt-2 max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-background"
            >
              {current.options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="flex w-full justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:outline-offset-[-2px]"
                    onClick={() => setCity(option)}
                  >
                    <span>{option.name}</span>
                    <span className="text-xs text-muted-foreground">{option.countries?.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
