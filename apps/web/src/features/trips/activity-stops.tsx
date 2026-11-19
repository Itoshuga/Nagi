'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  CornerDownRight,
  GripVertical,
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
  cn,
} from '@nagi/ui';
import type { TripPlan, TripPlanItem, TripPlanStop } from '@nagi/database';
import { CatalogTextarea } from '@/features/catalog/admin-form';
import { ActivityCardCopy } from './activity-card';
import { useTripCardDrag } from './card-drag';
import { tripDragSource } from './planner-dnd';
import {
  activityBudget,
  activityStops,
  activityNestingIssue,
  minuteTime,
  timeMinutes,
  type PlanMutation,
} from './planner-model';
import './activity-stops.css';

const durationLabel = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')}` : ''}`;

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
  const [duration, setDuration] = useState(String(stop.duration_minutes ?? ''));
  const [notes, setNotes] = useState(stop.notes);
  const [version, setVersion] = useState(stop.version);
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
          {removing ? 'Retirer cet arrêt ?' : (stop.entry?.title ?? 'Fiche indisponible')}
        </DialogTitle>
        <DialogDescription>
          {removing
            ? 'Cet arrêt et ses notes seront retirés de l’activité. La fiche du catalogue est conservée.'
            : 'Sa durée est comprise dans le créneau de l’activité principale.'}
        </DialogDescription>
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
                  : durationLabel(stop.duration_minutes)}
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
}: {
  item: TripPlanItem;
  plan: TripPlan;
  canEdit: boolean;
  busy: boolean;
  mutate: PlanMutation;
  onAdd?: () => void;
  always?: boolean;
}) {
  const id = useId();
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
  const [expanded, setExpanded] = useState(true);
  const [editor, setEditor] = useState<{ id: string; removing: boolean }>();
  const [error, setError] = useState('');
  const stops = item.stops ?? [];
  const schedule = activityStops(item);
  const budget = activityBudget(item);
  const edited = stops.find((stop) => stop.id === editor?.id);
  if (plan.stopsAvailable === false || (!stops.length && (!always || !canEdit))) return null;
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
        setDropRef(node);
      }}
      className={cn('trip-activity-stops', isOver && 'is-stop-drop-over')}
      data-stops-parent={item.id}
      aria-label={`Arrêts dans ${item.entry?.title ?? 'cette activité'}`}
    >
      <div className="trip-stops-heading">
        {stops.length ? (
          <button
            type="button"
            className="trip-stops-toggle"
            aria-expanded={expanded}
            aria-controls={`${id}-list`}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown className="size-3.5" data-expanded={expanded} aria-hidden="true" />
            <span>
              {stops.length} arrêt{stops.length > 1 ? 's' : ''} dans cette activité
            </span>
          </button>
        ) : (
          <p className="trip-stops-empty">Organisez les arrêts à l’intérieur de cette visite.</p>
        )}
        {canEdit && onAdd && (
          <button type="button" className="trip-stops-add" disabled={busy} onClick={onAdd}>
            <Plus className="size-3.5" aria-hidden="true" />
            Ajouter à cette activité
          </button>
        )}
      </div>
      {!!stops.length && (
        <div className="trip-stops-budget" data-overflow={budget.overflow > 0}>
          <p>
            {durationLabel(budget.used)} {budget.unknown ? 'renseignées' : 'd’arrêts'}
            {budget.available !== null
              ? ` sur ${durationLabel(budget.available)}`
              : ' · durée de l’activité libre'}
            {budget.unknown
              ? ` · ${budget.unknown} durée${budget.unknown > 1 ? 's' : ''} libre${budget.unknown > 1 ? 's' : ''}`
              : ''}
          </p>
          {budget.overflow > 0 && (
            <p role="status">
              {durationLabel(budget.overflow)} de plus que le créneau prévu.{' '}
              {budget.canExtend
                ? 'Allongez l’activité ou réduisez certaines durées.'
                : 'Réduisez certaines durées pour rester dans la journée.'}
            </p>
          )}
          {canEdit && budget.canExtend && (budget.overflow > 0 || budget.available === null) && (
            <button type="button" disabled={busy} onClick={() => void extend()}>
              {budget.available === null ? 'Définir la durée à' : 'Allonger à'}{' '}
              {durationLabel(budget.used)}
            </button>
          )}
        </div>
      )}
      <div id={`${id}-list`} hidden={!expanded}>
        <ol className="trip-stops-list">
          {schedule.map(({ stop, time }, index) => (
            <StopCard
              key={stop.id}
              stop={stop}
              parent={item}
              plan={plan}
              canEdit={canEdit}
              busy={busy}
            >
              <div className="trip-step-time" title="Horaire indicatif selon l’ordre des arrêts">
                <span className="trip-stop-time">
                  {time ?? <CornerDownRight className="size-3.5" aria-label="Horaire libre" />}
                </span>
                <small>
                  {stop.duration_minutes === null ? 'Durée libre' : `${stop.duration_minutes} min`}
                </small>
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
                <ActivityCardCopy entry={stop.entry} notes={stop.notes} />
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
        {!!stops.length && (
          <p className="trip-stop-help">
            Les arrêts suivent l’ordre de la visite. Leurs durées sont comprises dans celle de
            l’activité.
          </p>
        )}
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
