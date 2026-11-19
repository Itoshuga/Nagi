'use client';

import { useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Button, DialogContent, DialogDescription, DialogTitle, Input, Label } from '@nagi/ui';
import { FieldIcon } from './field-icon';
import { libraryIconNames, searchLibraryIcons } from './library';

const pageSize = 48;
export function IconBrowser({
  value,
  onSelect,
  onClose,
}: {
  value: string | null;
  onSelect: (name: string | null) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const results = searchLibraryIcons(query);
  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  const activePage = Math.min(page, pages - 1);
  const visible = results.slice(activePage * pageSize, (activePage + 1) * pageSize);
  function choose(name: string | null) {
    onSelect(name);
  }
  return (
    <DialogContent
      className="entry-editor-dialog max-w-3xl"
      onEscapeKeyDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        search.current?.focus();
      }}
    >
      <div className="entry-dialog-heading">
        <DialogTitle>Bibliothèque d’icônes</DialogTitle>
        <DialogDescription>
          Toutes les {libraryIconNames.length.toLocaleString('fr-FR')} icônes Lucide sont
          disponibles. Recherchez par nom ou parcourez la bibliothèque.
        </DialogDescription>
      </div>
      <div className="entry-dialog-body space-y-4">
        <div className="relative">
          <Label htmlFor={`${id}-search`} className="sr-only">
            Rechercher une icône
          </Label>
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            ref={search}
            id={`${id}-search`}
            type="search"
            value={query}
            maxLength={100}
            placeholder="Livre, source, book, link…"
            className="pl-9"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          {results.length} icône{results.length > 1 ? 's' : ''}
          {results.length > 0
            ? ` · ${activePage * pageSize + 1}–${Math.min((activePage + 1) * pageSize, results.length)}`
            : ''}
        </p>
        {visible.length ? (
          <div
            role="group"
            aria-label="Icônes disponibles"
            className="grid grid-cols-3 gap-2 sm:grid-cols-6"
          >
            {visible.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={`Choisir l’icône ${name}`}
                aria-pressed={value === name}
                title={name}
                className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-border px-1.5 py-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-accent"
                onClick={() => choose(name)}
              >
                <FieldIcon name={name} className="size-6 text-primary-ink" />
                <span className="block w-full truncate text-center text-[10px] text-muted-foreground">
                  {name}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Aucune icône trouvée. Essayez un autre mot ou son nom anglais.
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Page précédente des icônes"
            disabled={activePage === 0}
            onClick={() => setPage(activePage - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {activePage + 1} / {pages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Page suivante des icônes"
            disabled={activePage === pages - 1}
            onClick={() => setPage(activePage + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="entry-dialog-footer justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={() => choose(null)}>
          <X className="size-3.5" />
          Sans icône
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </DialogContent>
  );
}
