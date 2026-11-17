'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
} from 'lucide-react';
import { Badge, Button, Card, Input, cn } from '@nagi/ui';
import type { TripPlan, TripPlanItem, TripPlannerDay } from '@nagi/database';
import { isOutsideTrip, overlappingTripItems, tripDateLabel } from '@nagi/shared';
import { entryHref } from '@/features/entries/links';
import { EntryImage } from '@/features/media/image';
import { AddPlaceDialog } from './add-place-dialog';
import { TripDayEditor, TripStepDialog } from './plan-dialogs';
import { stepLocation, stepTime, type LanePosition, type PlanMutation } from './planner-model';

type Props = {
  guild: string;
  plan: TripPlan;
  categories: { id: string; name: string }[];
  canEdit: boolean;
  busy: boolean;
  mutate: PlanMutation;
};

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length)
    return hits.sort(
      (a, b) =>
        Number(b.id.toString().startsWith('before:')) -
        Number(a.id.toString().startsWith('before:')),
    );
  return args.pointerCoordinates ? [] : rectIntersection(args);
};

function DropMark({ day, before, active }: LanePosition & { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: before ? `before:${before}` : `lane:${day ?? 'pending'}`,
    data: { day, before },
    disabled: !active,
  });
  return (
    <div ref={setNodeRef} aria-hidden="true" className={cn('px-1 py-1', !active && 'h-2 py-0')}>
      {active && (
        <div
          className={cn(
            'rounded-lg border-2 border-dashed',
            before ? 'h-2' : 'grid min-h-11 place-items-center text-xs',
            isOver
              ? 'border-primary bg-accent text-primary-ink'
              : 'border-border text-muted-foreground',
          )}
        >
          {!before && 'Déposer à la fin'}
        </div>
      )}
    </div>
  );
}

function Step({
  item,
  index,
  items,
  guild,
  plan,
  canEdit,
  busy,
  mutate,
  conflict,
}: {
  item: TripPlanItem;
  index: number;
  items: TripPlanItem[];
  conflict: boolean;
} & Omit<Props, 'categories'>) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !canEdit || busy,
  });
  const title = item.entry?.title ?? 'Fiche indisponible';
  const time = stepTime(item);
  const location = stepLocation(item);
  const move = (offset: number) =>
    mutate({
      operation: 'move_item',
      data: {
        id: item.id,
        day: item.trip_day_id,
        before: items[index + (offset < 0 ? -1 : 2)]?.id ?? null,
      },
    });
  return (
    <li
      ref={setNodeRef}
      className={cn(
        'relative rounded-2xl border border-border bg-card px-2.5 py-2.5 shadow-sm sm:p-3',
        isDragging && 'pointer-events-none z-30 border-primary shadow-lg',
      )}
      style={
        transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined
      }
    >
      <div className="flex items-start gap-2.5 sm:gap-3">
        {canEdit && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            disabled={busy}
            className="grid size-9 shrink-0 touch-none cursor-grab place-items-center self-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
            aria-label={`Glisser ${title}`}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        )}
        <EntryImage
          src={item.entry?.cover_image_url}
          className="size-12 shrink-0 rounded-xl sm:size-14"
          sizes="56px"
        />
        <div className="min-w-0 flex-1">
          {item.entry ? (
            <Link
              href={entryHref(guild, item.entry)}
              className="block break-words text-sm font-bold hover:underline"
            >
              {title}
            </Link>
          ) : (
            <p className="break-words text-sm font-semibold text-muted-foreground">{title}</p>
          )}
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {[item.entry?.category?.name, location].filter(Boolean).join(' · ')}
          </p>
          {(time || item.estimated_duration_minutes) && (
            <p className="mt-1 text-xs font-medium tabular-nums text-primary-ink">
              {[
                time,
                item.estimated_duration_minutes ? `${item.estimated_duration_minutes} min` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {item.notes && (
            <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
              {item.notes}
            </p>
          )}
          {conflict && (
            <Badge className="mt-1 bg-amber-100 text-amber-950">Horaire chevauché</Badge>
          )}
        </div>
        <TripStepDialog guild={guild} plan={plan} item={item} mutate={mutate} canEdit={canEdit}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Options de ${title}`}
            className="size-8"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </TripStepDialog>
      </div>
      {canEdit && items.length > 1 && (
        <div className="mt-1 flex justify-end gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={busy || index === 0}
            aria-label={`Monter ${title}`}
            onClick={() => void move(-1)}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={busy || index === items.length - 1}
            aria-label={`Descendre ${title}`}
            onClick={() => void move(1)}
          >
            <ArrowDown className="size-3.5" />
          </Button>
        </div>
      )}
    </li>
  );
}

function Lane({
  day,
  items,
  dragging,
  props,
}: {
  day?: TripPlannerDay;
  items: TripPlanItem[];
  dragging: boolean;
  props: Props;
}) {
  const { guild, plan, categories, canEdit, busy, mutate } = props;
  const [search, setSearch] = useState('');
  const dayId = day?.id ?? null;
  const index = plan.days.findIndex((item) => item.id === dayId);
  const title = day?.title || (day ? `Jour ${index + 1}` : 'À organiser');
  const conflict = day ? overlappingTripItems(items) : new Set<string>();
  const query = search.trim().toLocaleLowerCase('fr');
  const visible =
    day || !query
      ? items
      : items.filter((item) =>
          `${item.entry?.title ?? 'Fiche indisponible'} ${stepLocation(item)} ${item.notes}`
            .toLocaleLowerCase('fr')
            .includes(query),
        );
  const outside = isOutsideTrip(day?.date ?? null, plan.start_date, plan.end_date);
  return (
    <Card
      id={day ? undefined : 'a-organiser'}
      className="min-w-0 scroll-mt-20 space-y-3 bg-muted/35 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {day?.title && <p className="text-xs font-medium text-primary-ink">Jour {index + 1}</p>}
          <h2 className="break-words font-display text-lg font-extrabold">{title}</h2>
          {day?.date && (
            <p className="text-xs text-muted-foreground">
              {tripDateLabel(day.date, { dateStyle: 'medium' })}
            </p>
          )}
          {outside && (
            <Badge className="mt-1 bg-amber-100 text-amber-950">Hors de la période du voyage</Badge>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            {day && (
              <TripDayEditor plan={plan} day={day} mutate={mutate}>
                <Button
                  disabled={busy}
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Modifier ${title}`}
                >
                  <Pencil className="size-4" />
                </Button>
              </TripDayEditor>
            )}
            <AddPlaceDialog
              guildId={guild}
              trip={plan}
              categories={categories}
              initialDay={dayId}
            />
          </div>
        )}
      </div>
      {outside && (
        <p className="text-xs text-muted-foreground">
          Changez la date de la journée ou déplacez ses étapes.
        </p>
      )}
      {!day && items.length > 1 && (
        <Input
          type="search"
          aria-label="Rechercher dans À organiser"
          placeholder="Rechercher une étape"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}
      {visible.length ? (
        <ol className="min-w-0">
          {visible.map((item) => (
            <li key={item.id}>
              <DropMark day={dayId} before={item.id} active={dragging} />
              <ul>
                <Step
                  item={item}
                  index={items.indexOf(item)}
                  items={items}
                  conflict={conflict.has(item.id)}
                  {...props}
                />
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          {query
            ? 'Aucune étape ne correspond à la recherche.'
            : day
              ? 'Aucune étape prévue pour cette journée.'
              : 'Les lieux sans journée apparaissent ici.'}
        </p>
      )}
      <DropMark day={dayId} before={null} active={dragging} />
      {day &&
        canEdit &&
        !plan.start_date &&
        !plan.end_date &&
        !day.date &&
        plan.days.every((item) => !item.date) &&
        plan.days.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={index === 0 || busy}
              onClick={() =>
                void mutate({ operation: 'move_day', data: { id: day.id, direction: 'up' } })
              }
            >
              Monter la journée
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={index === plan.days.length - 1 || busy}
              onClick={() =>
                void mutate({ operation: 'move_day', data: { id: day.id, direction: 'down' } })
              }
            >
              Descendre la journée
            </Button>
          </div>
        )}
    </Card>
  );
}

export function TripItinerary(props: Props) {
  const { plan, canEdit, busy, mutate } = props;
  const [dragging, setDragging] = useState(false);
  const dndId = useId();
  const dragVersion = useRef(plan.version);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const lanes = new Map<string | null, TripPlanItem[]>();
  for (const item of plan.items) {
    const lane = lanes.get(item.trip_day_id) ?? [];
    lane.push(item);
    lanes.set(item.trip_day_id, lane);
  }
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collision}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Utilisez les boutons Monter et Descendre ou le menu Déplacer vers pour organiser les étapes au clavier.',
        },
        announcements: {
          onDragStart: () => 'Étape saisie.',
          onDragOver: ({ over }) =>
            over ? 'Une destination est disponible.' : 'Aucune destination.',
          onDragEnd: ({ over }) => (over ? 'Étape déposée.' : 'Déplacement annulé.'),
          onDragCancel: () => 'Déplacement annulé.',
        },
      }}
      onDragStart={() => {
        dragVersion.current = plan.version;
        setDragging(true);
      }}
      onDragCancel={() => setDragging(false)}
      onDragEnd={({ active, over }) => {
        setDragging(false);
        const position = over?.data.current as LanePosition | undefined;
        if (position && position.before !== active.id)
          void mutate(
            { operation: 'move_item', data: { id: String(active.id), ...position } },
            dragVersion.current,
          );
      }}
    >
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(20rem,1fr)]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-extrabold">Journées</h2>
              <a href="#a-organiser" className="text-sm text-primary-ink hover:underline xl:hidden">
                Aller à « À organiser »
              </a>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {plan.start_date && plan.end_date && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void mutate({ operation: 'generate_days', data: {} })}
                  >
                    Compléter le calendrier
                  </Button>
                )}
                <TripDayEditor plan={plan} mutate={mutate}>
                  <Button type="button" size="sm" variant="secondary" disabled={busy}>
                    <Plus className="size-4" /> Ajouter une journée
                  </Button>
                </TripDayEditor>
              </div>
            )}
          </div>
          {plan.days.length ? (
            plan.days.map((day) => (
              <Lane
                key={day.id}
                day={day}
                dragging={dragging}
                items={lanes.get(day.id) ?? []}
                props={props}
              />
            ))
          ) : (
            <Card className="grid min-h-32 place-items-center gap-2 text-center text-sm text-muted-foreground">
              <MapPin className="size-5 text-primary-ink" aria-hidden="true" /> Aucune journée dans
              ce voyage.
            </Card>
          )}
        </div>
        <Lane dragging={dragging} items={lanes.get(null) ?? []} props={props} />
      </div>
    </DndContext>
  );
}
