'use client';

import { useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Label } from '@nagi/ui';
import { catalogButtonsLimit, catalogButtonsValue, safeCatalogUrl } from '@nagi/shared';
import type { CategoryField, Json } from '@nagi/database';
import { FieldIcon } from '@/features/icons/field-icon';

export function EntryButtonLinks({ field, value }: { field: CategoryField; value?: Json }) {
  const id = useId();
  const add = useRef<HTMLButtonElement>(null);
  const [buttons, setButtons] = useState(() => {
    const parsed = catalogButtonsValue.safeParse(value);
    return parsed.success
      ? parsed.data.map((button, index) => ({ ...button, id: `initial-${index}` }))
      : [];
  });
  const serialized = buttons
    .filter((button) => button.label.trim() || button.url.trim())
    .map(({ label, url }) => ({ label, url }));
  function move(index: number, direction: number) {
    setButtons((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }
  return (
    <fieldset className="min-w-0 space-y-4 rounded-2xl border border-border p-4 sm:p-5">
      <legend className="px-2 text-sm font-bold">
        <span className="inline-flex items-center gap-2">
          <FieldIcon name={field.icon} className="text-primary-ink" />
          {field.label}
          {field.is_required ? ' *' : ''}
        </span>
      </legend>
      <input type="hidden" name={`field-${field.id}`} value={JSON.stringify(serialized)} />
      <p className="text-xs leading-6 text-muted-foreground">
        Ajoutez un libellé et un lien HTTP ou HTTPS pour chaque bouton. Leur ordre sera conservé sur
        la fiche.
      </p>
      {buttons.map((button, index) => {
        const href = safeCatalogUrl(button.url.trim());
        return (
          <div
            key={button.id}
            className="min-w-0 space-y-4 rounded-xl border border-border bg-muted/25 p-3 sm:p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-muted-foreground">Bouton {index + 1}</p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  data-form-change
                  disabled={index === 0}
                  aria-label={`Monter le bouton ${index + 1} de ${field.label}`}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  data-form-change
                  disabled={index === buttons.length - 1}
                  aria-label={`Descendre le bouton ${index + 1} de ${field.label}`}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  data-form-change
                  aria-label={`Retirer le bouton ${index + 1} de ${field.label}`}
                  onClick={() => {
                    setButtons((current) => current.filter((item) => item.id !== button.id));
                    requestAnimationFrame(() => add.current?.focus());
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor={`${id}-${button.id}-label`} className="text-xs">
                Libellé du bouton {index + 1}
              </Label>
              <Input
                id={`${id}-${button.id}-label`}
                value={button.label}
                maxLength={80}
                required={Boolean(button.url.trim())}
                placeholder="Site officiel, source…"
                onChange={(event) =>
                  setButtons((current) =>
                    current.map((item) =>
                      item.id === button.id ? { ...item, label: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <div>
              <Label htmlFor={`${id}-${button.id}-url`} className="text-xs">
                Lien du bouton {index + 1}
              </Label>
              <Input
                id={`${id}-${button.id}-url`}
                type="url"
                value={button.url}
                maxLength={2048}
                required={Boolean(button.label.trim())}
                placeholder="https://…"
                onChange={(event) =>
                  setButtons((current) =>
                    current.map((item) =>
                      item.id === button.id ? { ...item, url: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            {href && button.label.trim() && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-primary-ink hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <FieldIcon name={field.icon} />
                <span className="min-w-0 break-words">{button.label}</span>
                <ArrowUpRight className="size-3.5 shrink-0" />
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          ref={add}
          type="button"
          variant="secondary"
          size="sm"
          data-form-change
          disabled={buttons.length >= catalogButtonsLimit}
          onClick={() => {
            const key = crypto.randomUUID();
            setButtons((current) => [...current, { id: key, label: '', url: '' }]);
            requestAnimationFrame(() => document.getElementById(`${id}-${key}-label`)?.focus());
          }}
        >
          <Plus className="size-3.5" />
          Ajouter un bouton
        </Button>
        <span className="text-xs text-muted-foreground">
          {buttons.length} / {catalogButtonsLimit} boutons
        </span>
      </div>
    </fieldset>
  );
}
