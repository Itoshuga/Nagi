'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useDndContext, useDndMonitor, useDroppable } from '@dnd-kit/core';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  GripVertical,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@nagi/ui';
import type { TripPlan, TripPlanItem, TripPlanStop } from '@nagi/database';
import { formatTripDuration, tripStopsSummary } from '@nagi/shared';
import { CatalogTextarea } from '@/features/catalog/admin-form';
import { ActivityCardCopy } from './activity-card';
import { CustomPlaceEditor } from './source-places';
import {
  ExternalPlaceView,
  useExternalPlaces,
  usePlacePresentation,
} from '@/features/integrations/mapbox/components';
import { PlaceImage } from '@/features/integrations/mapbox/place-image';
import { ImagePicker } from '@/features/images/components';
import { useTripCardDrag } from './card-drag';
import { tripDragSource } from './planner-dnd';
import { isCatalogDrag } from './catalog-drag';
import {
  activityBudget,
  activityStops,
  activityNestingIssue,
  minuteTime,
  timeMinutes,
  relevantTripConnection,
  type PlanMutation,
} from './planner-model';
import './activity-stops.css';

function StopCard({
  stop,
  parent,
  plan,
  canEdit,
  busy,
  children,
}: {
  stop: TripPlanStop;
  parent: TripPlanItem;
  plan: TripPlan;
  canEdit: boolean;
  busy: boolean;
  children: React.ReactNode;
}) {
  const instance = useId();
  const { active } = useDndContext();
  const source = tripDragSource(plan.items, active?.data.current, active?.id)?.card;
  const issue = source ? activityNestingIssue(source, parent) : null;
  const { setNodeRef, attributes, listeners, cardListeners, isDragging } = useTripCardDrag(
    `stop-drag:${stop.id}:${instance}`,
    { type: 'stop', id: stop.id },
    !canEdit || busy,
  );
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `stop-target:${instance}`,
    data: {
      type: 'stop',
      parent: parent.id,
      before: stop.id,
      title: parent.entry?.title ?? 'cette activité',
    },
    disabled: !canEdit || busy,
  });
  return (
    <li
      data-stop-id={stop.id}
      className={cn(
        'trip-step trip-stop',
        canEdit && !busy && 'trip-card-can-drag',
        isDragging && 'is-dragging',
        isOver && !isDragging && (issue ? 'is-nesting-blocked' : 'is-drop-over'),
      )}
      {...cardListeners}
      ref={(node) => {
        setNodeRef(node);
        setDropRef(node);
      }}
    >
      {canEdit && (
        <button
          type="button"
          className="trip-drag-handle"
          {...attributes}
          {...listeners}
          disabled={busy}
          aria-label={`Glisser l’arrêt ${stop.entry?.title ?? 'indisponible'}`}
        >
          <GripVertical className="size-3.5" />
        </button>
      )}
      {children}
    </li>
  );
}

function StopTiming({
  stop,
  time,
  plan,
  canEdit,
  busy,
  mutate,
}: {
  stop: TripPlanStop;
  time: string | null;
  plan: TripPlan;
  canEdit: boolean;
  busy: boolean;
  mutate: PlanMutation;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(String(stop.duration_minutes ?? ''));
  const [base, setBase] = useState({ trip: plan.version, stop: stop.version, snapshot: stop });
  const [error, setError] = useState('');
  const label = (
    <span className="trip-stop-timing-label">
      <span className="trip-stop-time" data-time-kind={time ? 'indicative' : 'unset'}>
        {time ? `≈ ${time}` : 'Libre'}
      </span>
      <small>{formatTripDuration(stop.duration_minutes) ?? 'Durée libre'}</small>
    </span>
  );
  if (!canEdit)
    return (
      <div
        className="trip-time-stack"
        title={time ? 'Horaire indicatif, calculé dans l’activité' : undefined}
      >
        {label}
      </div>
    );
  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        setError('');
        if (next) {
          setDuration(String(stop.duration_minutes ?? ''));
          setBase({ trip: plan.version, stop: stop.version, snapshot: stop });
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="trip-time-button trip-time-stack"
          disabled={busy}
          aria-label={`Modifier la durée de l’arrêt ${stop.entry?.title ?? 'indisponible'}`}
          title={time ? 'Horaire indicatif · Modifier la durée' : 'Définir une durée'}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="trip-quick-editor"
        aria-label="Durée de l’arrêt"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!busy) setOpen(false);
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const result = await mutate(
              {
                operation: 'edit_stop',
                data: {
                  id: stop.id,
                  stop_version: base.stop,
                  duration: duration ? Number(duration) : null,
                  notes: base.snapshot.notes,
                },
              },
              base.trip,
              { stop: base.snapshot },
            );
            if (result.ok) setOpen(false);
            else setError(result.error);
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <p className="text-sm font-bold">Durée de l’arrêt</p>
            <div>
              <Label htmlFor={id}>Durée (min)</Label>
              <Input
                id={id}
                type="number"
                min={1}
                max={1440}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                placeholder="Durée libre"
              />
              {Number(duration) >= 60 && (
                <p className="trip-duration-preview">{formatTripDuration(Number(duration))}</p>
              )}
            </div>
            <p className="trip-stops-info-text">
              {time ? `≈ ${time} est une indication calculée selon l’ordre des arrêts. ` : ''}La
              durée est comprise dans celle de l’activité.
            </p>
            {error && <Alert role="alert">{error}</Alert>}
            <Button type="submit" size="sm">
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </fieldset>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function StopEditor({
  stop,
  plan,
  busy,
  mutate,
  removing,
  canEdit,
  onClose,
  returnFocus,
}: {
  stop: TripPlanStop;
  plan: TripPlan;
  busy: boolean;
  mutate: PlanMutation;
  removing: boolean;
  canEdit: boolean;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const external = useExternalPlaces();
  const presentation = usePlacePresentation(stop, stop.entry, true);
  const photoReference = {
    source: stop.source ?? ('nagi' as const),
    id:
      stop.source === 'mapbox'
        ? stop.external_place_id!
        : stop.source === 'custom'
          ? stop.id
          : stop.entry_id!,
    visit: stop.id,
    proof: presentation.place?.imageProof,
    located: !!presentation.place?.coordinates,
  };
  const [duration, setDuration] = useState(String(stop.duration_minutes ?? ''));
  const [notes, setNotes] = useState(stop.notes);
  const [version, setVersion] = useState(stop.version);
  const [original, setOriginal] = useState(stop);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || busy) return;
    const result = await mutate(
      removing
        ? { operation: 'delete_stop', data: { id: stop.id } }
        : {
            operation: 'edit_stop',
            data: {
              id: stop.id,
              stop_version: version,
              duration: duration ? Number(duration) : null,
              notes,
            },
          },
      plan.version,
      { stop: original },
    );
    if (result.ok) onClose();
    else {
      setError(result.error);
      setConflict(result.reason === 'conflict');
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="trip-stop-dialog"
        closeDisabled={busy}
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          if (removing || !canEdit) {
            event.preventDefault();
            cancel.current?.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogTitle>
          {removing
            ? 'Retirer cet arrêt ?'
            : stop.source === 'mapbox'
              ? 'Détails de l’arrêt'
              : (stop.entry?.title ?? 'Fiche indisponible')}
        </DialogTitle>
        <DialogDescription>
          {removing
            ? 'Cet arrêt et ses notes seront retirés de l’activité. La fiche du catalogue est conservée.'
            : 'Sa durée est comprise dans le créneau de l’activité principale.'}
        </DialogDescription>
        {!removing && stop.source === 'mapbox' && stop.external_place_id && (
          <ExternalPlaceView
            occurrence={stop.id}
            placeId={stop.external_place_id}
            query={stop.external_query ?? ''}
            full
          />
        )}
        {!removing && stop.source !== 'mapbox' && (
          <PlaceImage
            category={stop.entry?.category?.name}
            photoReference={photoReference}
            credits="dialog"
            src={stop.entry?.cover_image_url}
            className="trip-detail-photo"
          />
        )}
        {!removing && canEdit && <ImagePicker reference={photoReference} />}
        {!removing && canEdit && stop.source === 'custom' && (
          <CustomPlaceEditor place={stop} mutate={mutate} />
        )}
        {!removing && canEdit && stop.source !== 'nagi' && external?.replace && (
          <button
            type="button"
            className="trip-remove-link"
            onClick={() => {
              external.replace?.(stop.id);
              onClose();
            }}
          >
            Remplacer le lieu associé
          </button>
        )}
        <form onSubmit={submit} aria-busy={busy}>
          {!removing && canEdit && (
            <fieldset disabled={busy} className="space-y-4">
              <div>
                <Label htmlFor={`${id}-duration`}>Durée (minutes)</Label>
                <Input
                  id={`${id}-duration`}
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  placeholder="Durée libre"
                />
                {Number(duration) >= 60 && (
                  <p className="trip-duration-preview">{formatTripDuration(Number(duration))}</p>
                )}
                <p className="trip-stop-help">
                  Laissez vide pour garder un arrêt sans durée précise.
                </p>
              </div>
              <div>
                <Label htmlFor={`${id}-notes`}>Notes de l’arrêt</Label>
                <CatalogTextarea
                  id={`${id}-notes`}
                  maxLength={4000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Étage, réservation, choses à voir…"
                />
              </div>
            </fieldset>
          )}
          {!canEdit && (
            <div className="space-y-4">
              <p className="text-sm">
                {stop.duration_minutes === null
                  ? 'Durée libre'
                  : formatTripDuration(stop.duration_minutes)}
              </p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {stop.notes || 'Aucune note pour cet arrêt.'}
              </p>
            </div>
          )}
          {error && (
            <Alert role="alert" className="mt-4">
              {error}
              {conflict && !removing && (
                <button
                  type="button"
                  className="mt-2 block underline"
                  disabled={busy}
                  onClick={() => {
                    setDuration(String(stop.duration_minutes ?? ''));
                    setNotes(stop.notes);
                    setVersion(stop.version);
                    setOriginal(stop);
                    setError('');
                    setConflict(false);
                  }}
                >
                  Recharger cet arrêt
                </button>
              )}
            </Alert>
          )}
          <div className="trip-dialog-actions">
            <Button ref={cancel} type="button" variant="ghost" disabled={busy} onClick={onClose}>
              {canEdit ? 'Annuler' : 'Fermer'}
            </Button>
            {canEdit && (
              <Button type="submit" variant={removing ? 'destructive' : 'default'} disabled={busy}>
                {busy ? 'Enregistrement…' : removing ? 'Retirer l’arrêt' : 'Enregistrer'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ActivityStops({
  item,
  plan,
  canEdit,
  busy,
  mutate,
  onAdd,
  always = false,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  item: TripPlanItem;
  plan: TripPlan;
  canEdit: boolean;
  busy: boolean;
  mutate: PlanMutation;
  onAdd?: () => void;
  always?: boolean;
  expanded?: boolean;
  onExpandedChange?: () => void;
}) {
  const id = useId();
  const { active } = useDndContext();
  const catalogDragging = isCatalogDrag(active?.data.current);
  const section = useRef<HTMLElement>(null);
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `stops-end:${id}`,
    data: {
      type: 'stop',
      parent: item.id,
      before: null,
      title: item.entry?.title ?? 'cette activité',
    },
    disabled: !canEdit || busy || plan.stopsAvailable === false,
  });
  const { setNodeRef: setCatalogDropRef, isOver: isCatalogOver } = useDroppable({
    id: `catalog-stop:${id}`,
    data: {
      type: 'stop',
      parent: item.id,
      before: null,
      title: item.entry?.title ?? 'cette activité',
    },
    disabled: !catalogDragging || !canEdit || plan.stopsAvailable === false,
  });
  const [localExpanded, setLocalExpanded] = useState(true);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  useDndMonitor({
    onDragStart: () => setHoverExpanded(false),
    onDragEnd: () => setHoverExpanded(false),
    onDragCancel: () => setHoverExpanded(false),
  });
  const expanded = hoverExpanded || (controlledExpanded ?? localExpanded);
  useEffect(() => {
    if (!catalogDragging || !isCatalogOver) return;
    const timer = setTimeout(() => setHoverExpanded(true), 550);
    return () => clearTimeout(timer);
  }, [catalogDragging, isCatalogOver]);
  const [editor, setEditor] = useState<{ id: string; removing: boolean }>();
  const [error, setError] = useState('');
  const stops = item.stops ?? [];
  const schedule = activityStops(item);
  const budget = activityBudget(item);
  const edited = stops.find((stop) => stop.id === editor?.id);
  if (plan.stopsAvailable === false || (!stops.length && !catalogDragging && (!always || !canEdit)))
    return null;
  async function move(stop: TripPlanStop, before: string | null) {
    const result = await mutate({ operation: 'move_stop', data: { id: stop.id, before } });
    setError(result.ok ? '' : result.error);
  }
  async function detach(stop: TripPlanStop) {
    const result = await mutate({ operation: 'detach_stop', data: { id: stop.id } });
    setError(result.ok ? '' : result.error);
  }
  async function extend() {
    const start = item.start_time?.slice(0, 5) ?? null;
    const result = await mutate({
      operation: 'edit_item',
      data: {
        id: item.id,
        item_version: item.version,
        start_time: start,
        end_time:
          start && timeMinutes(start) + budget.used < 1440
            ? minuteTime(timeMinutes(start) + budget.used)
            : null,
        duration: budget.used,
        notes: item.notes,
      },
    });
    setError(result.ok ? '' : result.error);
  }
  return (
    <section
      ref={(node) => {
        section.current = node;
        setDropRef(catalogDragging ? null : node);
      }}
      className={cn(
        'trip-activity-stops',
        expanded && stops.length > 0 && 'is-expanded',
        isOver && 'is-stop-drop-over',
      )}
      data-stops-parent={item.id}
      aria-label={`Arrêts dans ${item.entry?.title ?? 'cette activité'}`}
    >
      {!!stops.length && (
        <div className="trip-stops-heading">
          <button
            type="button"
            className="trip-stops-toggle"
            aria-expanded={expanded}
            aria-controls={`${id}-list`}
            onClick={() =>
              onExpandedChange ? onExpandedChange() : setLocalExpanded((value) => !value)
            }
          >
            <ChevronDown className="size-3.5" data-expanded={expanded} aria-hidden="true" />
            <span>{tripStopsSummary(stops.length, budget.used)}</span>
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="trip-stops-info"
                aria-label="Comprendre les durées et horaires des arrêts"
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="trip-stops-info-content"
              onEscapeKeyDown={(event) => event.stopPropagation()}
            >
              <p>
                Les durées des arrêts sont comprises dans celle de l’activité. Les heures précédées
                de ≈ sont indicatives, calculées selon l’ordre des durées connues.
              </p>
              {budget.unknown > 0 && (
                <p>
                  {budget.unknown} arrêt{budget.unknown > 1 ? 's' : ''} sans durée définie{' '}
                  {budget.unknown > 1 ? 'ne sont pas comptés' : 'n’est pas compté'} dans ce total.
                  Après une durée libre, aucun horaire suivant n’est calculé.
                </p>
              )}
              {canEdit && budget.available === null && budget.canExtend && (
                <button
                  type="button"
                  className="trip-stops-define-duration"
                  disabled={busy}
                  onClick={() => void extend()}
                >
                  Définir la durée de l’activité à {formatTripDuration(budget.used)}
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
      {budget.overflow > 0 && (
        <div className="trip-stops-budget">
          <p role="status">
            Les arrêts dépassent la durée prévue de {formatTripDuration(budget.overflow)}.
          </p>
          {canEdit && budget.canExtend && (
            <button type="button" disabled={busy} onClick={() => void extend()}>
              Ajuster à {formatTripDuration(budget.used)}
            </button>
          )}
        </div>
      )}
      {catalogDragging && canEdit && (
        <div
          ref={setCatalogDropRef}
          className={cn('trip-catalog-stop-target', isCatalogOver && 'is-over')}
          role="status"
        >
          Déposer ici pour ajouter un arrêt
        </div>
      )}
      <div
        id={`${id}-list`}
        className={cn('trip-stops-disclosure', (expanded || !stops.length) && 'is-expanded')}
        inert={stops.length > 0 && !expanded}
        aria-hidden={stops.length > 0 && !expanded}
      >
        <div className="trip-stops-disclosure-inner">
          <ol className="trip-stops-list">
            {schedule.map(({ stop, time }, index) => (
              <StopCard
                key={stop.id}
                stop={stop}
                parent={item}
                plan={plan}
                canEdit={canEdit && expanded}
                busy={busy}
              >
                <div className="trip-step-time">
                  <StopTiming
                    stop={stop}
                    time={time}
                    plan={plan}
                    canEdit={canEdit}
                    busy={busy}
                    mutate={mutate}
                  />
                </div>
                <span
                  className="trip-timeline-dot"
                  aria-hidden="true"
                  style={{ backgroundColor: stop.entry?.category?.color ?? undefined }}
                />
                <button
                  type="button"
                  className="trip-step-main trip-stop-main"
                  onClick={() => setEditor({ id: stop.id, removing: false })}
                  disabled={busy}
                  aria-label={`Détails de l’arrêt ${stop.entry?.title ?? 'indisponible'}`}
                >
                  <ActivityCardCopy entry={stop.entry} notes={stop.notes} place={stop}>
                    {(() => {
                      const relation = relevantTripConnection(
                        plan,
                        stop.entry_id,
                        item.trip_day_id,
                      );
                      return relation ? (
                        <span className="trip-step-note trip-step-relation">
                          {relation.label} · {relation.entry.title}
                        </span>
                      ) : null;
                    })()}
                  </ActivityCardCopy>
                </button>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="trip-step-menu trip-icon-button"
                        disabled={busy}
                        aria-label={`Options de l’arrêt ${stop.entry?.title ?? 'indisponible'}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        disabled={busy}
                        onSelect={() => setEditor({ id: stop.id, removing: false })}
                      >
                        <Pencil className="size-3.5" />
                        Durée et notes
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={busy || index === 0}
                        onSelect={() => void move(stop, stops[index - 1]!.id)}
                      >
                        <ArrowUp className="size-3.5" />
                        Monter l’arrêt
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={busy || index === stops.length - 1}
                        onSelect={() => void move(stop, stops[index + 2]?.id ?? null)}
                      >
                        <ArrowDown className="size-3.5" />
                        Descendre l’arrêt
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={busy} onSelect={() => void detach(stop)}>
                        <ArrowUpRight className="size-3.5" />
                        Sortir de l’activité
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={busy}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setEditor({ id: stop.id, removing: true })}
                      >
                        <Trash2 className="size-3.5" />
                        Retirer l’arrêt
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </StopCard>
            ))}
          </ol>
          {canEdit && onAdd && (
            <button type="button" className="trip-stops-add" disabled={busy} onClick={onAdd}>
              <Plus className="size-3.5" aria-hidden="true" />
              Ajouter un arrêt
            </button>
          )}
        </div>
      </div>
      {error && <Alert role="alert">{error}</Alert>}
      {edited && editor && (
        <StopEditor
          key={`${edited.id}:${editor.removing}`}
          stop={edited}
          plan={plan}
          busy={busy}
          mutate={mutate}
          removing={editor.removing}
          canEdit={canEdit}
          onClose={() => setEditor(undefined)}
          returnFocus={() =>
            requestAnimationFrame(() => {
              const target =
                section.current?.querySelector<HTMLElement>(
                  `[data-stop-id="${edited.id}"] .trip-stop-main`,
                ) ??
                section.current?.querySelector<HTMLElement>('button') ??
                document.querySelector<HTMLElement>(
                  `[data-activity-id="${item.id}"] .trip-step-main`,
                ) ??
                document.querySelector<HTMLElement>('.trip-day-nav-item.is-active');
              target?.focus();
            })
          }
        />
      )}
    </section>
  );
}
