'use client';

import { useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { Alert, Button } from '@nagi/ui';
import type { CatalogResult } from './mutations';

export function SortableCatalog<T extends { id: string }>({
  items,
  label,
  render,
  save,
}: {
  items: T[];
  label: (item: T) => string;
  render: (item: T) => ReactNode;
  save: (ids: string[]) => Promise<CatalogResult>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<string[]>();
  const [status, setStatus] = useState('');
  const [pending, startTransition] = useTransition();
  const dragging = useRef<string | null>(null);
  const byId = new Map(items.map((item) => [item.id, item]));
  const ids =
    draft?.length === items.length && draft.every((id) => byId.has(id))
      ? draft
      : items.map((item) => item.id);
  const dirty = ids.some((id, index) => id !== items[index]?.id);

  function move(from: number, to: number) {
    if (pending || !ids[from] || !ids[to] || from === to) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    setDraft(next);
    setStatus(`${label(byId.get(next[to]!)!)} · position ${to + 1} sur ${ids.length}.`);
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {ids.map((id, index) => {
          const item = byId.get(id)!;
          return (
            <li
              key={id}
              className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-nowrap"
              onDragOver={(event) => {
                if (dragging.current) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging.current) move(ids.indexOf(dragging.current), index);
                dragging.current = null;
              }}
            >
              <span
                aria-hidden="true"
                draggable={!pending}
                title="Glisser pour déplacer"
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', id);
                  event.dataTransfer.effectAllowed = 'move';
                  dragging.current = id;
                }}
                onDragEnd={() => {
                  dragging.current = null;
                }}
                className="hidden cursor-grab text-muted-foreground sm:block"
              >
                <GripVertical className="size-5" />
              </span>
              <div className="min-w-0 flex-1">{render(item)}</div>
              <div className="ml-auto flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={pending || index === 0}
                  aria-label={`Monter ${label(item)}`}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={pending || index === ids.length - 1}
                  aria-label={`Descendre ${label(item)}`}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {status && !dirty && <Alert>{status}</Alert>}
      {dirty && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await save(ids);
                  setStatus(result.message);
                  if (result.ok) router.refresh();
                } catch {
                  setStatus('Impossible d’enregistrer cet ordre.');
                }
              })
            }
          >
            {pending ? 'Enregistrement…' : 'Enregistrer l’ordre'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setDraft(undefined);
              setStatus('');
            }}
          >
            Annuler le déplacement
          </Button>
          {status && (
            <p aria-hidden="true" className="text-sm text-muted-foreground">
              {status}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
