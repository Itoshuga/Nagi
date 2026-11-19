'use client';
import { useId, useRef, useState } from 'react';
import { ArrowLeftRight, Check, ChevronDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@nagi/ui';
import type { RelationType } from '@nagi/database';
import { relationLabel, relationOptions } from '@nagi/shared';
import { FieldIcon } from '@/features/icons/field-icon';

const searchable = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
export function RelationTypePicker({
  types,
  value,
  onChange,
  open,
  onOpenChange,
  disabled,
  triggerRef,
}: {
  types: RelationType[];
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''),
    [active, setActive] = useState(0);
  const options = relationOptions(types),
    selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) =>
    searchable(
      `${o.label} ${o.type.name} ${o.type.forward_label} ${o.type.inverse_label}`,
    ).includes(searchable(query)),
  );
  const index = filtered.length ? Math.min(active, filtered.length - 1) : -1;
  function pick(choice: (typeof options)[number]) {
    if (!choice.type.is_enabled) return;
    onChange(choice.value);
    onOpenChange(false);
  }
  function move(next: number) {
    if (!filtered.length) return;
    const step = next < index ? -1 : 1;
    let candidate = (next + filtered.length) % filtered.length;
    for (let visited = 0; visited < filtered.length; visited++) {
      if (filtered[candidate]?.type.is_enabled) break;
      candidate = (candidate + step + filtered.length) % filtered.length;
    }
    if (!filtered[candidate]?.type.is_enabled) return;
    setActive(candidate);
    const option = document.getElementById(`${id}-${candidate}`);
    if (document.activeElement !== input.current) option?.focus();
    else option?.scrollIntoView({ block: 'nearest' });
  }
  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuery('');
          setActive(
            Math.max(
              0,
              options.findIndex((o) => o.value === value),
            ),
          );
        }
        onOpenChange(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-label="Relation"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-haspopup="listbox"
          disabled={disabled}
          className={`relation-sentence-select${selected ? ' is-selected' : ''}`}
        >
          <span className="relation-sentence-select-icon">
            {selected?.type.icon ? (
              <FieldIcon name={selected.type.icon} />
            ) : (
              <ArrowLeftRight className="size-4" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {selected?.label ?? 'Choisir une relation'}
          </span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="relation-type-popover"
        aria-label="Choisir une relation"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          triggerRef.current?.focus();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenChange(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            move(index + (e.key === 'ArrowDown' ? 1 : -1));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[index]) pick(filtered[index]);
          }
        }}
      >
        <div className="relation-command-search">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            type="search"
            aria-label="Rechercher une relation"
            role="combobox"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-activedescendant={index >= 0 ? `${id}-${index}` : undefined}
            aria-autocomplete="list"
            placeholder="Rechercher une relation…"
            autoComplete="off"
          />
        </div>
        <div className="relation-type-options">
          <ul id={`${id}-list`} role="listbox" aria-label="Relations disponibles">
            {filtered.map((o, i) => (
              <li key={o.value}>
                <button
                  id={`${id}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={value === o.value}
                  tabIndex={index === i ? 0 : -1}
                  disabled={!o.type.is_enabled}
                  data-active={index === i}
                  className="relation-type-option"
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(o)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{o.label}</span>
                    {!o.type.is_symmetric && (
                      <small className="block truncate text-muted-foreground">
                        {relationLabel(o.type, o.direction === 'forward' ? 'inverse' : 'forward')}
                      </small>
                    )}
                    {!o.type.is_enabled && (
                      <small className="text-muted-foreground">Type inactif</small>
                    )}
                  </span>
                  {value === o.value && (
                    <Check className="size-4 shrink-0 text-primary-ink" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!filtered.length && (
            <p role="status" className="p-5 text-center text-xs text-muted-foreground">
              Aucune relation trouvée.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
