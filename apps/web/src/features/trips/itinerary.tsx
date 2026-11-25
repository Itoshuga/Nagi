'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  Compass,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  cn,
} from '@nagi/ui';
import type { TripPlanItem, TripPlannerDay } from '@nagi/database';
import {
  formatTripDuration,
  formatTripTime,
  isOutsideTrip,
  overlappingTripItems,
  tripDayLabel,
  tripStepCount,
} from '@nagi/shared';
import { ActivityCardCopy } from './activity-card';
import { ActivityNestingDialog } from './activity-nesting';
import { TripDayEditor } from './plan-dialogs';
import { QuickStepEditor } from './step-editor';
import { RemoveTripStepDialog } from './remove-step-dialog';
import { ActivityStops } from './activity-stops';
import { useTripCardDrag } from './card-drag';
import { tripDragSource } from './planner-dnd';
import { isCatalogDrag } from './catalog-drag';
import {
  itemDuration,
  activityNestingIssue,
  stepLocation,
  visibleTripItems,
  relevantTripConnection,
  type LanePosition,
  type WorkspaceViewProps,
} from './planner-model';

export function TripDropTarget({
  day,
  before,
  children,
  className,
}: LanePosition & { children?: React.ReactNode; className?: string }) {
  const { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({
    id: before ? `before:${before}` : `lane:${day ?? 'pending'}`,
    data: { day, before },
  });
  return (
    <div ref={setNodeRef} className={cn('trip-drop-target', className, isOver && 'is-over')}>
      {isOver && active?.data.current?.type === 'stop' && (
        <span className="trip-drop-label">Remettre en activité</span>
      )}
      {isOver && isCatalogDrag(active?.data.current) && (
        <span className="trip-drop-label">Déposer ici</span>
      )}
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
  const [nesting, setNesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const { active } = useDndContext();
  const source = tripDragSource(plan.items, active?.data.current, active?.id)?.card;
  const nestingIssue = source ? activityNestingIssue(source, item) : null;
  const title = item.entry?.title ?? 'Fiche indisponible';
  const connection = relevantTripConnection(plan, item.entry_id, item.trip_day_id);
  const { setNodeRef, attributes, listeners, cardListeners, isDragging } = useTripCardDrag(
    item.id,
    { type: 'item', id: item.id },
    !canEdit || busy,
  );
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `step:${item.id}`,
    data: { day: item.trip_day_id, before: item.id },
    disabled: !canEdit || busy,
  });
  const { setNodeRef: setNestRef, isOver: isNestOver } = useDroppable({
    id: `activity:${item.id}`,
    data: { type: 'activity', parent: item.id, title },
    disabled: !canEdit || busy || plan.stopsAvailable === false,
  });
  const index = items.findIndex((i) => i.id === item.id);
  const sameTime = (other?: TripPlanItem) =>
    !!other && other.start_time?.slice(0, 5) === item.start_time?.slice(0, 5);
  const move = (offset: number) =>
    void mutate({
      operation: 'move_item',
      data: {
        id: item.id,
        day: item.trip_day_id,
        before:
          offset < 0
            ? (items[index - 1]?.id ?? null)
            : sameTime(items[index + 2])
              ? items[index + 2]!.id
              : null,
      },
    });
  return (
    <motion.li
      {...cardListeners}
      data-activity-id={item.id}
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
        canEdit && !busy && 'trip-card-can-drag',
        isDragging && 'is-dragging',
        isOver && !isDragging && !isNestOver && 'is-drop-over',
        isNestOver && !isDragging && (nestingIssue ? 'is-nesting-blocked' : 'is-nesting-over'),
        selectedItem === item.id && 'is-selected',
        props.recentItem === item.id && !active && 'is-added',
      )}
    >
      <div className="trip-step-time">
        {canEdit ? (
          <QuickStepEditor item={item} plan={plan} mutate={mutate} busy={busy} showDuration />
        ) : (
          <>
            <span>{formatTripTime(item.start_time) ?? 'Libre'}</span>
            {itemDuration(item) != null && <small>{formatTripDuration(itemDuration(item))}</small>}
          </>
        )}
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
        ref={setNestRef}
        type="button"
        className="trip-step-main"
        onClick={() => onDetails(item)}
        aria-label={`Détails de ${title}`}
      >
        <ActivityCardCopy entry={item.entry} notes={item.notes} place={item}>
          {connection && (
            <span className="trip-step-note trip-step-relation">
              {connection.label} · {connection.entry.title}
            </span>
          )}
          {conflict && <span className="trip-time-conflict">Chevauchement d’horaire</span>}
        </ActivityCardCopy>
      </button>
      {isNestOver && !isDragging && (
        <span className="trip-nesting-hint" role="status">
          <CornerDownRight className="size-3.5" aria-hidden="true" />
          {nestingIssue ?? `Ajouter un arrêt dans ${title}`}
        </span>
      )}
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              ref={menuTrigger}
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
            {plan.stopsAvailable !== false && (
              <DropdownMenuItem disabled={busy} onSelect={() => props.onAddStop(item.id)}>
                <Plus className="size-3.5" /> Ajouter un arrêt
              </DropdownMenuItem>
            )}
            {plan.stopsAvailable !== false && (
              <DropdownMenuItem
                disabled={busy || !!item.stops?.length}
                onSelect={() => setNesting(true)}
              >
                <CornerDownRight className="size-3.5" /> Intégrer à une activité…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={busy || !sameTime(items[index - 1])}
              onSelect={() => move(-1)}
            >
              <ArrowUp className="size-3.5" /> Monter l’étape
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy || !sameTime(items[index + 1])}
              onSelect={() => move(1)}
            >
              <ArrowDown className="size-3.5" /> Descendre l’étape
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDetails(item)}>
              Déplacer vers une journée…
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1 h-px bg-border" />
            <DropdownMenuItem
              className="text-destructive"
              disabled={busy}
              onSelect={() => setRemoving(true)}
            >
              <Trash2 className="size-3.5" /> Supprimer l’étape
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {removing && canEdit && (
        <RemoveTripStepDialog
          item={item}
          version={plan.version}
          busy={busy}
          mutate={mutate}
          onClose={() => setRemoving(false)}
          returnFocus={() => menuTrigger.current?.focus()}
        />
      )}
      {nesting && (
        <ActivityNestingDialog
          item={item}
          items={plan.items}
          days={plan.days}
          busy={busy}
          mutate={mutate}
          onClose={() => setNesting(false)}
        />
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
        <p>{day.date ? tripDayLabel(day.date) : `Jour ${index + 1}`}</p>
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
              Jour {index + 1} · {tripStepCount(count)}
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
                  setError('');
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
  const { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({
    id: `day-background:${day?.id ?? 'pending'}`,
    data: { day: day?.id ?? null, before: null },
    disabled: !props.canEdit || props.busy,
  });
  const items = visibleTripItems(props.plan, day?.id ?? 'pending');
  const visible = search
    ? items.filter((i) =>
        `${i.entry?.title} ${stepLocation(i)} ${i.notes}`
          .toLocaleLowerCase('fr')
          .includes(search.toLocaleLowerCase('fr')),
      )
    : items;
  const conflicts = overlappingTripItems(items);
  return (
    <section
      ref={setNodeRef}
      className={cn(
        'trip-day-timeline',
        !items.length && 'is-empty',
        isOver && isCatalogDrag(active?.data.current) && 'is-catalog-day-over',
      )}
    >
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
      <ol className="trip-timeline">
        {visible.map((item) => (
          <li key={item.id} className="trip-timeline-entry">
            <TripDropTarget day={day?.id ?? null} before={item.id} />
            <ol className="trip-step-shell">
              <TripStep item={item} items={items} props={props} conflict={conflicts.has(item.id)} />
            </ol>
            <ActivityStops
              item={item}
              plan={props.plan}
              canEdit={props.canEdit}
              busy={props.busy}
              mutate={props.mutate}
              onAdd={() => props.onAddStop(item.id)}
              expanded={props.expandedStops?.[item.id]}
              onExpandedChange={
                props.onToggleStops ? () => props.onToggleStops!(item.id) : undefined
              }
            />
          </li>
        ))}
      </ol>
      <TripDropTarget day={day?.id ?? null} before={null} className="trip-timeline-end">
        {!items.length && !day && props.selectedDay !== 'all' && (
          <p className="trip-empty-inline">
            {search ? 'Aucun lieu trouvé.' : 'Gardez ici les idées pour la suite.'}
          </p>
        )}
        {props.canEdit && (
          <button
            type="button"
            className="trip-add-step"
            disabled={props.busy}
            aria-expanded={props.catalogOpen ?? false}
            aria-controls={props.catalogPanelId}
            onClick={() => props.onAdd(day?.id ?? null)}
          >
            <Compass className="size-4" aria-hidden="true" /> Ajouter une étape
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
  const content = useRef<HTMLDivElement>(null);
  const { active, measureDroppableContainers } = useDndContext();
  const catalogDragging = isCatalogDrag(active?.data.current);
  useEffect(() => {
    if (!catalogDragging || !content.current) return;
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measureDroppableContainers([]));
    };
    // The stop targets are intentionally absent at rest. Re-measure positions
    // after their layout and after a folded activity opens, without polling.
    const observer = new ResizeObserver(refresh);
    observer.observe(content.current);
    refresh();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [catalogDragging, measureDroppableContainers]);
  const [search, setSearch] = useState('');
  const { selectedDay, plan } = props;
  if (selectedDay === 'pending')
    return (
      <div ref={content} className="trip-itinerary">
        <div className="trip-ideas-search">
          <SearchInput value={search} onChange={setSearch} />
        </div>
        <DayTimeline props={props} search={search} />
      </div>
    );
  const days = selectedDay === 'all' ? plan.days : plan.days.filter((d) => d.id === selectedDay);
  return (
    <div ref={content} className="trip-itinerary">
      {days.map((day) => (
        <DayTimeline key={day.id} day={day} props={props} />
      ))}
      {!days.length && (
        <div className="trip-workspace-empty">
          <h2>Le voyage commence avec une idée.</h2>
          <p>Ajoutez une journée, ou gardez des lieux à organiser.</p>
          {props.canEdit && (
            <Button
              onClick={() => props.onAdd(null)}
              aria-expanded={props.catalogOpen ?? false}
              aria-controls={props.catalogPanelId}
            >
              <Compass className="size-4" aria-hidden="true" /> Ajouter une étape
            </Button>
          )}
        </div>
      )}
      {selectedDay === 'all' && visibleTripItems(plan, 'pending').length > 0 && (
        <button type="button" className="trip-open-ideas" onClick={() => props.onDay('pending')}>
          {visibleTripItems(plan, 'pending').length} lieu
          {visibleTripItems(plan, 'pending').length > 1 ? 'x' : ''} à organiser →
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
