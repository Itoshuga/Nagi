'use client';
import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  cn,
} from '@nagi/ui';
import type { TripPlanItem, TripPlannerDay } from '@nagi/database';
import { isOutsideTrip, overlappingTripItems, tripDateLabel } from '@nagi/shared';
import { EntryImage } from '@/features/media/image';
import { TripDayEditor } from './plan-dialogs';
import { QuickStepEditor } from './step-editor';
import {
  itemDuration,
  stepLocation,
  visibleTripItems,
  type LanePosition,
  type WorkspaceViewProps,
} from './planner-model';

export function TripDropTarget({
  day,
  before,
  children,
  className,
}: LanePosition & { children?: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: before ? `before:${before}` : `lane:${day ?? 'pending'}`,
    data: { day, before },
  });
  return (
    <div ref={setNodeRef} className={cn('trip-drop-target', className, isOver && 'is-over')}>
      {children}
    </div>
  );
}
export function TripStep({
  item,
  items,
  props,
  conflict = false,
}: {
  item: TripPlanItem;
  items: TripPlanItem[];
  props: WorkspaceViewProps;
  conflict?: boolean;
}) {
  const { canEdit, busy, mutate, plan, onDetails, selectedItem } = props;
  const reducedMotion = useReducedMotion();
  const title = item.entry?.title ?? 'Fiche indisponible';
  const connection = plan.connections.find(
    (c) =>
      c.fromId === item.entry_id &&
      plan.items.some((other) => other.entry_id === c.entry.id && other.id !== item.id),
  );
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: item.id,
    disabled: !canEdit || busy,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `step:${item.id}`,
    data: { day: item.trip_day_id, before: item.id },
    disabled: !canEdit || busy,
  });
  const index = items.findIndex((i) => i.id === item.id);
  const move = (offset: number) =>
    void mutate({
      operation: 'move_item',
      data: {
        id: item.id,
        day: item.trip_day_id,
        before: items[index + (offset < 0 ? -1 : 2)]?.id ?? null,
      },
    });
  return (
    <motion.li
      layout="position"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: isDragging ? 0.3 : 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.15 }}
      ref={(node) => {
        setNodeRef(node);
        setDropRef(node);
      }}
      className={cn(
        'trip-step',
        isDragging && 'is-dragging',
        isOver && !isDragging && 'is-drop-over',
        selectedItem === item.id && 'is-selected',
      )}
    >
      <div className="trip-step-time">
        {canEdit ? (
          <QuickStepEditor item={item} plan={plan} mutate={mutate} busy={busy} />
        ) : (
          <span>{item.start_time?.slice(0, 5) ?? 'Libre'}</span>
        )}
        {itemDuration(item) != null && <small>{itemDuration(item)} min</small>}
      </div>
      <span
        className="trip-timeline-dot"
        aria-hidden="true"
        style={{ backgroundColor: item.entry?.category?.color ?? undefined }}
      />
      {canEdit && (
        <button
          type="button"
          className="trip-drag-handle"
          {...attributes}
          {...listeners}
          disabled={busy}
          aria-label={`Glisser ${title}`}
        >
          <GripVertical className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        className="trip-step-main"
        onClick={() => onDetails(item)}
        aria-label={`Détails de ${title}`}
      >
        <EntryImage src={item.entry?.cover_image_url} className="trip-step-photo" sizes="56px" />
        <span className="trip-step-copy">
          <strong>{title}</strong>
          <small>
            {[item.entry?.category?.name, item.entry?.neighborhood?.name ?? item.entry?.city?.name]
              .filter(Boolean)
              .join(' · ')}
          </small>
          {item.notes && <span className="trip-step-note">{item.notes}</span>}
          {connection && (
            <span className="trip-step-note">
              {connection.label} · {connection.entry.title}
            </span>
          )}
          {conflict && <span className="trip-time-conflict">Chevauchement d’horaire</span>}
        </span>
      </button>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="trip-step-menu trip-icon-button"
              aria-label={`Options de ${title}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => onDetails(item)}>
              <Pencil className="size-3.5" /> Détails et notes
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy || index === 0} onSelect={() => move(-1)}>
              <ArrowUp className="size-3.5" /> Monter l’étape
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy || index === items.length - 1}
              onSelect={() => move(1)}
            >
              <ArrowDown className="size-3.5" /> Descendre l’étape
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDetails(item)}>
              Déplacer vers une journée…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </motion.li>
  );
}
function DayHeading({
  day,
  props,
  count,
}: {
  day: TripPlannerDay;
  props: WorkspaceViewProps;
  count: number;
}) {
  const { plan, canEdit, busy, mutate } = props,
    index = plan.days.findIndex((d) => d.id === day.id);
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(day.title),
    [error, setError] = useState('');
  const base = useRef(plan.version);
  return (
    <header className="trip-day-heading">
      <div>
        <p>
          {day.date
            ? tripDateLabel(day.date, { weekday: 'long', day: 'numeric', month: 'long' })
            : `Jour ${index + 1}`}
        </p>
        {editing ? (
          <form
            className="trip-day-title-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await mutate(
                { operation: 'edit_day', data: { id: day.id, date: day.date, title } },
                base.current,
              );
              if (r.ok) setEditing(false);
              else setError(r.error);
            }}
          >
            <Input
              autoFocus
              aria-label="Titre de la journée"
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <button type="submit" disabled={busy}>
              Enregistrer
            </button>
          </form>
        ) : (
          <div className="trip-day-subtitle">
            <span>
              Jour {index + 1} · {count} étape{count > 1 ? 's' : ''}
              {day.title ? ` · ${day.title}` : ''}
            </span>
            {canEdit && (
              <button
                type="button"
                className="trip-icon-button"
                aria-label="Modifier le titre de la journée"
                onClick={() => {
                  setTitle(day.title);
                  setEditing(true);
                  base.current = plan.version;
                }}
              >
                <Pencil className="size-3" />
              </button>
            )}
          </div>
        )}
        {isOutsideTrip(day.date, plan.start_date, plan.end_date) && (
          <small className="trip-time-conflict">
            Hors de la période du voyage · vous pouvez déplacer les étapes.
          </small>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      {canEdit && (
        <TripDayEditor plan={plan} day={day} mutate={mutate}>
          <button
            type="button"
            className="trip-icon-button"
            disabled={busy}
            aria-label={`Options du jour ${index + 1}`}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </TripDayEditor>
      )}
    </header>
  );
}
function DayTimeline({
  day,
  props,
  search = '',
}: {
  day?: TripPlannerDay;
  props: WorkspaceViewProps;
  search?: string;
}) {
  const items = props.plan.items.filter((i) => i.trip_day_id === (day?.id ?? null));
  const visible = search
    ? items.filter((i) =>
        `${i.entry?.title} ${stepLocation(i)} ${i.notes}`
          .toLocaleLowerCase('fr')
          .includes(search.toLocaleLowerCase('fr')),
      )
    : items;
  const conflicts = overlappingTripItems(items);
  const timed = items.filter((i) => i.start_time),
    disorder = timed.some((i, n) => n > 0 && i.start_time! < timed[n - 1]!.start_time!);
  return (
    <section className="trip-day-timeline">
      {day ? (
        <DayHeading day={day} props={props} count={items.length} />
      ) : (
        <header className="trip-day-heading">
          <div>
            <p>À organiser</p>
            <small>
              {items.length} idée{items.length > 1 ? 's' : ''} à garder pour la suite
            </small>
          </div>
        </header>
      )}
      {disorder && (
        <div className="trip-order-notice">
          <span>Les horaires suivent un autre ordre que vos visites.</span>
          {props.canEdit && (
            <button
              type="button"
              disabled={props.busy}
              onClick={() =>
                void props.mutate({ operation: 'sort_items', data: { day: day?.id ?? null } })
              }
            >
              Trier par horaire
            </button>
          )}
        </div>
      )}
      <ol className="trip-timeline">
        {visible.map((item) => (
          <li key={item.id} className="trip-timeline-entry">
            <TripDropTarget day={day?.id ?? null} before={item.id} />
            <ol>
              <TripStep item={item} items={items} props={props} conflict={conflicts.has(item.id)} />
            </ol>
          </li>
        ))}
      </ol>
      <TripDropTarget day={day?.id ?? null} before={null} className="trip-timeline-end">
        {!items.length && props.selectedDay !== 'all' && (
          <p className="trip-empty-inline">
            {search
              ? 'Aucun lieu trouvé.'
              : day
                ? 'Votre journée commence ici.'
                : 'Gardez ici les idées pour la suite.'}
          </p>
        )}
        {props.canEdit && (
          <button
            type="button"
            className="trip-add-step"
            disabled={props.busy}
            onClick={() => props.onAdd(day?.id ?? null)}
          >
            <Plus className="size-4" /> Ajouter une étape
          </button>
        )}
      </TripDropTarget>
      {day && props.canEdit && !props.plan.start_date && !props.plan.end_date && !day.date && (
        <div className="trip-day-order">
          <button
            type="button"
            disabled={props.busy || props.plan.days[0]?.id === day.id}
            onClick={() =>
              void props.mutate({ operation: 'move_day', data: { id: day.id, direction: 'up' } })
            }
          >
            Monter la journée
          </button>
          <button
            type="button"
            disabled={props.busy || props.plan.days.at(-1)?.id === day.id}
            onClick={() =>
              void props.mutate({ operation: 'move_day', data: { id: day.id, direction: 'down' } })
            }
          >
            Descendre la journée
          </button>
        </div>
      )}
    </section>
  );
}
export function TripItinerary(props: WorkspaceViewProps) {
  const [search, setSearch] = useState('');
  const { selectedDay, plan } = props;
  if (selectedDay === 'pending')
    return (
      <div className="trip-itinerary">
        <div className="trip-ideas-search">
          <SearchInput value={search} onChange={setSearch} />
        </div>
        <DayTimeline props={props} search={search} />
      </div>
    );
  const days = selectedDay === 'all' ? plan.days : plan.days.filter((d) => d.id === selectedDay);
  return (
    <div className="trip-itinerary">
      {days.map((day) => (
        <DayTimeline key={day.id} day={day} props={props} />
      ))}
      {!days.length && (
        <div className="trip-workspace-empty">
          <h2>Le voyage commence avec une idée.</h2>
          <p>Ajoutez une journée, ou gardez des lieux à organiser.</p>
          {props.canEdit && <Button onClick={() => props.onAdd(null)}>Ajouter un lieu</Button>}
        </div>
      )}
      {selectedDay === 'all' && visibleTripItems(plan, 'pending').length > 0 && (
        <button type="button" className="trip-open-ideas" onClick={() => props.onDay('pending')}>
          {visibleTripItems(plan, 'pending').length} lieux à organiser →
        </button>
      )}
    </div>
  );
}
function SearchInput({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <Input
      type="search"
      aria-label="Rechercher dans À organiser"
      placeholder="Rechercher dans vos idées…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
