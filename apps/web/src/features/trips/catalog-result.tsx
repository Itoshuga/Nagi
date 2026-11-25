'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CalendarDays, Check, Inbox, LoaderCircle, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, cn } from '@nagi/ui';
import type { TripPlan } from '@nagi/database';
import type { TripPlaceReference, TripResult } from '@nagi/shared';
import { dayLabel } from './add-place-dialog';
import { TripDayEditor } from './plan-dialogs';
import type { CatalogEntry, CatalogPlacement } from './catalog-drag';
import type { PlanMutation } from './planner-model';

const AddContext = createContext<{
  open: string | null;
  setOpen: (id: string) => void;
  close: (id: string) => void;
  mutate: PlanMutation;
  replacing: boolean;
} | null>(null);
/** Both sources share one contextual picker, scoped to the current search. */
export function CatalogAddProvider({
  scope,
  mutate,
  replacing,
  children,
}: {
  scope: string;
  mutate: PlanMutation;
  replacing: boolean;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState<{ scope: string; id: string | null }>({ scope, id: null });
  // Discard the previous search’s picker, including when that search is revisited.
  if (opened.scope !== scope) setOpened({ scope, id: null });
  return (
    <AddContext.Provider
      value={{
        open: opened.scope === scope ? opened.id : null,
        setOpen: (id) =>
          setOpened((current) => (current.scope === scope ? { scope, id } : current)),
        close: (id) =>
          setOpened((current) =>
            current.scope === scope && current.id === id ? { scope, id: null } : current,
          ),
        mutate,
        replacing,
      }}
    >
      {children}
    </AddContext.Provider>
  );
}

export function CatalogResult({
  entry,
  plan,
  placement,
  defaultDuration,
  draggable,
  canAdd,
  active,
  id,
  onActive,
  insert,
  children,
  reference,
  onCommit,
}: {
  entry: CatalogEntry;
  plan: TripPlan;
  placement: CatalogPlacement;
  defaultDuration: number;
  draggable: boolean;
  canAdd: boolean;
  active: boolean;
  id: string;
  onActive: () => void;
  insert: (placement: CatalogPlacement) => Promise<TripResult>;
  children: ReactNode;
  reference?: TripPlaceReference;
  onCommit?: () => void | TripPlaceReference | Promise<void | TripPlaceReference>;
}) {
  const context = useContext(AddContext);
  if (!context) throw new Error('CatalogAddProvider requis.');
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `catalog:${id}`,
    data: {
      type: 'catalog-entry',
      provider: reference?.source ?? 'nagi',
      entry,
      reference,
      onCommit,
      defaultDuration,
    },
    disabled: !draggable || !canAdd,
  });
  const [pending, setPending] = useState(false),
    [added, setAdded] = useState(false),
    [error, setError] = useState('');
  const adding = useRef(false);
  const open = context.open === id && canAdd;
  const explicitTarget =
    context.replacing ||
    !!placement.parent ||
    (!!placement.day && plan.days.some((day) => day.id === placement.day));
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1400);
    return () => clearTimeout(timer);
  }, [added]);
  function changeOpen(value: boolean) {
    if (value)
      setError(
        placement.day && !plan.days.some((day) => day.id === placement.day)
          ? 'Cette journée n’existe plus. Choisissez une autre destination.'
          : '',
      );
    if (value) context!.setOpen(id);
    else context!.close(id);
  }
  async function create(target: CatalogPlacement) {
    if (adding.current || !canAdd) return;
    if (!context!.replacing && target.day && !plan.days.some((day) => day.id === target.day)) {
      setError('Cette journée n’existe plus. Choisissez une autre destination.');
      context!.setOpen(id);
      return;
    }
    adding.current = true;
    setPending(true);
    setError('');
    try {
      const result = await insert(target);
      if (result.ok) {
        setAdded(true);
        context!.close(id);
      } else setError(result.error);
    } catch {
      setError('L’ajout a échoué. Réessayez.');
    } finally {
      adding.current = false;
      setPending(false);
    }
  }
  function choose(day: string | null) {
    // A one-off choice does not change the catalogue default or carry a clock
    // and insertion position from a different day.
    void create(day === placement.day ? { ...placement, day } : { day, before: null });
  }
  const action = (event: React.MouseEvent | React.TouchEvent) =>
    event.nativeEvent
      .composedPath()
      .some(
        (node) =>
          node instanceof Element &&
          node.matches('.trip-picker-add,[role="dialog"],input,select,a'),
      );
  return (
    <li
      ref={setNodeRef}
      id={id}
      role="option"
      aria-selected={active}
      data-active={active}
      data-catalog-entry={entry.id}
      className={cn(draggable && canAdd && 'trip-catalog-draggable', isDragging && 'is-copying')}
      onMouseMove={onActive}
      onMouseDown={(event) => {
        if (!action(event)) listeners?.onMouseDown?.(event);
      }}
      onTouchStart={(event) => {
        if (!action(event)) listeners?.onTouchStart?.(event);
      }}
      onDragStartCapture={(event) => event.preventDefault()}
    >
      {children}
      {canAdd && (
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="trip-picker-add"
              aria-label={`Ajouter ${entry.title}`}
              title={
                added
                  ? 'Ajouté · Ajouter une autre occurrence'
                  : placement.parent
                    ? 'Ajouter un arrêt à cette activité'
                    : explicitTarget
                      ? 'Ajouter à la journée choisie'
                      : 'Choisir une journée'
              }
              data-added={added || undefined}
              aria-disabled={pending}
              aria-busy={pending}
              aria-haspopup={explicitTarget ? undefined : 'dialog'}
              aria-expanded={explicitTarget ? undefined : open}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                if (event.detail >= 2 || pending) {
                  event.preventDefault();
                  return;
                }
                if (explicitTarget) {
                  event.preventDefault();
                  void create(placement);
                }
              }}
              onKeyDown={(event) => {
                if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
              }}
            >
              {pending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : added ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Plus aria-hidden="true" className="size-4" />
              )}
            </button>
          </PopoverTrigger>
          {open && (
            <PopoverContent
              className="trip-catalog-destination"
              align="end"
              sideOffset={6}
              collisionPadding={12}
              aria-label={`Ajouter ${entry.title} à une journée`}
              onKeyDown={(event) => {
                if (!event.currentTarget.contains(event.target as Node)) return;
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  changeOpen(false);
                }
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                  const choices = [
                    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      '[data-catalog-choice]:not(:disabled)',
                    ),
                  ];
                  if (!choices.length) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const index = choices.indexOf(document.activeElement as HTMLButtonElement);
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? choices.length - 1
                        : index < 0
                          ? event.key === 'ArrowUp'
                            ? choices.length - 1
                            : 0
                          : (index + (event.key === 'ArrowUp' ? -1 : 1) + choices.length) %
                            choices.length;
                  choices[next]?.focus();
                }
              }}
            >
              <div className="trip-catalog-destination-heading">
                <strong>Ajouter à une journée</strong>
                <span>{entry.title}</span>
              </div>
              {plan.days.length ? (
                <div className="trip-catalog-days" role="group" aria-label="Journées disponibles">
                  {plan.days.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      data-catalog-choice
                      data-day={day.id}
                      disabled={pending}
                      onClick={(event) => {
                        if (event.detail < 2) choose(day.id);
                      }}
                    >
                      <CalendarDays aria-hidden="true" className="size-4" />
                      <span>{dayLabel(day, plan.days)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="trip-catalog-no-days">
                  <p>Ce voyage ne contient aucune journée.</p>
                  <TripDayEditor
                    plan={plan}
                    mutate={context.mutate}
                    onSaved={() => changeOpen(false)}
                  >
                    <button type="button" data-catalog-choice>
                      <Plus aria-hidden="true" className="size-4" />
                      Créer une journée
                    </button>
                  </TripDayEditor>
                </div>
              )}
              <button
                type="button"
                className="trip-catalog-unplanned"
                data-catalog-choice
                disabled={pending}
                onClick={(event) => {
                  if (event.detail < 2) choose(null);
                }}
              >
                <Inbox aria-hidden="true" className="size-4" />
                <span>Garder dans « À organiser »</span>
              </button>
              {error && (
                <p role="alert" className="trip-catalog-add-error">
                  {error}
                </p>
              )}
            </PopoverContent>
          )}
        </Popover>
      )}
      <span className="sr-only" role="status">
        {added ? `${entry.title} ajouté au voyage.` : ''}
      </span>
      {error && !open && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
    </li>
  );
}
