'use client';
import { useState, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { MoreHorizontal } from 'lucide-react';
import { Button, Input, Popover, PopoverContent, PopoverTrigger, cn } from '@nagi/ui';
import type { TripPlan } from '@nagi/database';
import type { TripPlaceReference } from '@nagi/shared';
import { CatalogSelect } from '@/features/catalog/admin-form';
import { dayLabel } from './add-place-dialog';
import type { CatalogEntry, CatalogPlacement } from './catalog-drag';
import { useExternalPlaces } from '@/features/integrations/mapbox/components';

export function CatalogResult({
  entry,
  plan,
  initialDay,
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
  initialDay: string | null;
  defaultDuration: number;
  draggable: boolean;
  canAdd: boolean;
  active: boolean;
  id: string;
  onActive: () => void;
  insert: (placement: CatalogPlacement) => Promise<void>;
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
  const [destination, setDestination] = useState(initialDay ?? '');
  const [time, setTime] = useState('');
  const action = (event: React.MouseEvent | React.TouchEvent) =>
    event.nativeEvent
      .composedPath()
      .some(
        (node) =>
          node instanceof Element &&
          node.matches('.trip-catalog-action,[role="dialog"],input,select,a'),
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
          setOpen(true);
        }
      }}
      onKeyDown={(e) => {
        if (canAdd && draggable && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      {children}
      {draggable && canAdd && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="trip-icon-button trip-catalog-action"
              aria-label={`Ajouter au voyage · ${entry.title}`}
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
                    await onCommit?.();
                    await insert({
                      day: parent ? parent.trip_day_id : destination || null,
                      parent: parent?.id,
                      time: parent || !time ? undefined : time,
                    });
                    setOpen(false);
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
                <Button size="sm" type="submit">
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
