'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Check, LoaderCircle, MoreHorizontal, Plus } from 'lucide-react';
import { Button, Input, Popover, PopoverContent, PopoverTrigger, cn } from '@nagi/ui';
import type { TripPlan } from '@nagi/database';
import type { TripPlaceReference, TripResult } from '@nagi/shared';
import { CatalogSelect } from '@/features/catalog/admin-form';
import { dayLabel } from './add-place-dialog';
import type { CatalogEntry, CatalogPlacement } from './catalog-drag';
import { useExternalPlaces } from '@/features/integrations/mapbox/components';

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
  const external = useExternalPlaces();
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
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState('');
  const [time, setTime] = useState('');
  const [pending, setPending] = useState(false),
    [added, setAdded] = useState(false);
  const adding = useRef(false);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1400);
    return () => clearTimeout(timer);
  }, [added]);
  function changeOpen(value: boolean) {
    if (value) {
      setDestination(placement.parent ? `stop:${placement.parent}` : (placement.day ?? ''));
      setTime(placement.time ?? '');
    }
    setOpen(value);
  }
  async function create(target: CatalogPlacement) {
    if (adding.current || !canAdd) return;
    adding.current = true;
    setPending(true);
    try {
      const result = await insert(target);
      if (result.ok) {
        setAdded(true);
        setOpen(false);
      }
    } finally {
      adding.current = false;
      setPending(false);
    }
  }
  const action = (event: React.MouseEvent | React.TouchEvent) =>
    event.nativeEvent
      .composedPath()
      .some(
        (node) =>
          node instanceof Element &&
          node.matches('.trip-catalog-action,.trip-picker-add,[role="dialog"],input,select,a'),
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
      onMouseDown={(e) => {
        if (!action(e)) listeners?.onMouseDown?.(e);
      }}
      onTouchStart={(e) => {
        if (!action(e)) listeners?.onTouchStart?.(e);
      }}
      onDragStartCapture={(e) => e.preventDefault()}
      onContextMenu={(e) => {
        if (canAdd && draggable) {
          e.preventDefault();
          changeOpen(true);
        }
      }}
      onKeyDown={(e) => {
        if (canAdd && draggable && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
          e.preventDefault();
          changeOpen(true);
        }
      }}
    >
      {children}
      {canAdd && (
        <button
          type="button"
          className="trip-picker-add"
          aria-label={`Ajouter ${entry.title}`}
          title={
            added
              ? 'Ajouté · Ajouter une autre occurrence'
              : placement.parent
                ? 'Ajouter un arrêt à cette activité'
                : 'Ajouter à la journée choisie'
          }
          data-added={added || undefined}
          aria-disabled={pending}
          onClick={(event) => {
            if (event.detail < 2) void create(placement);
          }}
          onKeyDown={(event) => {
            if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
          }}
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
          ) : added ? (
            <Check className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
        </button>
      )}
      <span className="sr-only" role="status">
        {added ? `${entry.title} ajouté au voyage.` : ''}
      </span>
      {draggable && canAdd && (
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="trip-icon-button trip-catalog-action"
              aria-label={`Ajouter au voyage · ${entry.title}`}
              disabled={pending}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </PopoverTrigger>
          {open && (
            <PopoverContent
              className="trip-catalog-destination"
              align="end"
              aria-label={`Ajouter ${entry.title} au voyage`}
            >
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const parent = destination.startsWith('stop:')
                    ? plan.items.find((i) => i.id === destination.slice(5))
                    : undefined;
                  if (destination.startsWith('stop:') && !parent) return;
                  try {
                    await create({
                      day: parent ? parent.trip_day_id : destination || null,
                      parent: parent?.id,
                      time: parent || !time ? undefined : time,
                      before:
                        (parent?.id ?? null) === (placement.parent ?? null) &&
                        (parent ? parent.trip_day_id : destination || null) === placement.day
                          ? placement.before
                          : null,
                    });
                  } catch {
                    /* Resolution errors remain in the source panel. */
                  }
                }}
              >
                <div className="trip-catalog-destination-heading">
                  <strong>Ajouter au voyage</strong>
                  <span>{entry.title}</span>
                </div>
                <label>
                  Destination
                  <CatalogSelect
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    aria-label="Destination de la visite"
                  >
                    <option value="">À organiser</option>
                    {plan.days.map((day) => (
                      <option key={day.id} value={day.id}>
                        {dayLabel(day, plan.days)}
                      </option>
                    ))}
                    {plan.stopsAvailable !== false && plan.items.length > 0 && (
                      <optgroup label="Arrêt dans une activité">
                        {plan.items.map((item, index) => (
                          <option key={item.id} value={`stop:${item.id}`}>
                            {item.source === 'mapbox'
                              ? (external?.get(item.external_place_id ?? '').place?.title ??
                                `Étape ${index + 1}`)
                              : (item.entry?.title ?? 'Activité')}{' '}
                            · {item.start_time?.slice(0, 5) ?? 'Libre'} ·{' '}
                            {item.trip_day_id
                              ? dayLabel(
                                  plan.days.find((d) => d.id === item.trip_day_id)!,
                                  plan.days,
                                )
                              : 'À organiser'}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </CatalogSelect>
                </label>
                {!destination.startsWith('stop:') && (
                  <label>
                    Horaire facultatif
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      aria-label="Horaire de la visite"
                    />
                  </label>
                )}
                <Button size="sm" type="submit" disabled={pending}>
                  Ajouter au voyage
                </Button>
              </form>
            </PopoverContent>
          )}
        </Popover>
      )}
    </li>
  );
}
