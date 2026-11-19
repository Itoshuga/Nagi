'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CalendarDays, ChevronLeft, ChevronRight, GripHorizontal, Plus } from 'lucide-react';
import { Button, cn } from '@nagi/ui';
import type { TripPlanItem, TripPlannerDay } from '@nagi/database';
import { tripDateLabel } from '@nagi/shared';
import {
  itemDuration,
  layoutCalendarEvents,
  minuteTime,
  timeMinutes,
  type WorkspaceViewProps,
} from './planner-model';
import { QuickStepEditor } from './step-editor';
import { TripItinerary } from './itinerary';

const hourHeight = 56,
  minuteHeight = hourHeight / 60;
function Slot({
  day,
  minute,
  onAdd,
  editable,
  active,
  onFocus,
  onNavigate,
  date,
}: {
  day: string;
  minute: number;
  onAdd: WorkspaceViewProps['onAdd'];
  editable: boolean;
  active: boolean;
  onFocus: () => void;
  onNavigate: (key: string) => void;
  date: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${day}:${minute}`,
    data: { day, minute },
    disabled: !editable,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={cn('trip-calendar-slot', isOver && 'is-over')}
      style={{ top: minute * minuteHeight, height: hourHeight / 2 }}
      disabled={!editable}
      tabIndex={active ? 0 : -1}
      data-slot-day={day}
      data-slot-minute={minute}
      onFocus={onFocus}
      title={date}
      aria-describedby={`calendar-day-${day}`}
      aria-label={`Ajouter un lieu à ${minuteTime(minute)}`}
      onClick={() => onAdd(day, minuteTime(minute))}
      onKeyDown={(e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          onNavigate(e.key);
        }
      }}
    />
  );
}
function Event({
  item,
  props,
  lane,
  lanes,
}: {
  item: TripPlanItem;
  props: WorkspaceViewProps;
  lane: number;
  lanes: number;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: item.id,
    disabled: !props.canEdit || props.busy,
  });
  const [resize, setResize] = useState<number>(),
    resizing = useRef<{ y: number; duration: number; trip: number; item: number } | null>(null);
  const start = timeMinutes(item.start_time!),
    duration = resize ?? itemDuration(item);
  async function saveDuration(
    value: number,
    tripVersion = props.plan.version,
    itemVersion = item.version,
  ) {
    await props.mutate(
      {
        operation: 'schedule_item',
        data: {
          id: item.id,
          item_version: itemVersion,
          day: item.trip_day_id,
          start_time: item.start_time!.slice(0, 5),
          end_time: start + value < 1440 ? minuteTime(start + value) : null,
          duration: value,
        },
      },
      tripVersion,
    );
    setResize(undefined);
  }
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'trip-calendar-event',
        isDragging && 'is-dragging',
        lanes > 1 && 'has-conflict',
      )}
      style={{
        top: start * minuteHeight,
        height: Math.max(30, Math.min(1440 - start, duration ?? 0) * minuteHeight),
        left: `calc(${(lane / lanes) * 100}% + 3px)`,
        width: `calc(${100 / lanes}% - 6px)`,
        borderLeftColor: item.entry?.category?.color ?? 'var(--primary)',
      }}
    >
      {props.canEdit && (
        <button
          type="button"
          className="trip-calendar-event-drag"
          {...attributes}
          {...listeners}
          aria-label={`Déplacer ${item.entry?.title ?? 'l’étape'} dans le calendrier`}
        >
          <GripHorizontal className="size-3" />
        </button>
      )}
      <button
        type="button"
        className="trip-calendar-event-copy"
        onClick={() => props.onDetails(item)}
      >
        <strong>{item.entry?.title ?? 'Fiche indisponible'}</strong>
        <span>
          {item.start_time?.slice(0, 5)}
          {duration ? ` · ${duration} min` : ' · Durée libre'}
        </span>
        {duration && duration >= 60 && <small>{item.entry?.category?.name}</small>}
      </button>
      {props.canEdit && (
        <button
          type="button"
          className="trip-event-resize"
          aria-label={`Redimensionner la durée de ${item.entry?.title ?? 'l’étape'}`}
          onPointerDown={(e) => {
            if (props.busy) return;
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            resizing.current = {
              y: e.clientY,
              duration: itemDuration(item) ?? 30,
              trip: props.plan.version,
              item: item.version,
            };
          }}
          onPointerMove={(e) => {
            if (!resizing.current) return;
            const next = Math.min(
              1440 - start,
              Math.max(
                15,
                Math.round(
                  (resizing.current.duration + (e.clientY - resizing.current.y) / minuteHeight) /
                    15,
                ) * 15,
              ),
            );
            setResize(next);
          }}
          onPointerUp={() => {
            if (!resizing.current) return;
            const base = resizing.current;
            resizing.current = null;
            void saveDuration(resize ?? base.duration, base.trip, base.item);
          }}
          onPointerCancel={() => {
            resizing.current = null;
            setResize(undefined);
          }}
          onKeyDown={(e) => {
            if (props.busy) return;
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            void saveDuration(
              Math.min(
                1440 - start,
                Math.max(15, (itemDuration(item) ?? 30) + (e.key === 'ArrowDown' ? 15 : -15)),
              ),
            );
          }}
        />
      )}
    </div>
  );
}
export function TripCalendar(props: WorkspaceViewProps) {
  const { plan, selectedDay, onDay, canEdit, busy } = props;
  const dated = plan.days.filter((d) => d.date),
    chosen = dated.find((d) => d.id === selectedDay) ?? dated[0];
  const [mode, setMode] = useState<'day' | 'week' | 'overview'>(
    dated.length > 10 ? 'overview' : dated.length === 1 ? 'day' : 'week',
  );
  const [dragged, setDragged] = useState<TripPlanItem>(),
    dragVersion = useRef(plan.version),
    scroll = useRef<HTMLDivElement>(null),
    id = useId();
  const [activeSlot, setActiveSlot] = useState<{ day?: string; minute: number }>({ minute: 540 });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const index = dated.findIndex((d) => d.id === chosen?.id),
    start = Math.floor(Math.max(0, index) / 7) * 7;
  const days = mode === 'day' ? (chosen ? [chosen] : []) : dated.slice(start, start + 7);
  const keyboardDay = days.some((d) => d.id === activeSlot.day) ? activeSlot.day : chosen?.id;
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 7 * hourHeight;
  }, [mode, selectedDay]);
  useEffect(() => {
    const media = matchMedia('(max-width: 639px)');
    const adapt = () => {
      if (media.matches) setMode((current) => (current === 'week' ? 'day' : current));
    };
    adapt();
    media.addEventListener('change', adapt);
    return () => media.removeEventListener('change', adapt);
  }, []);
  if (
    selectedDay === 'pending' ||
    (selectedDay !== 'all' && !dated.some((d) => d.id === selectedDay))
  )
    return <TripItinerary {...props} />;
  if (!chosen)
    return (
      <div className="trip-workspace-empty">
        <CalendarDays className="size-7" />
        <h2>Vos journées, à votre rythme.</h2>
        <p>Ajoutez des dates au voyage pour organiser les horaires dans le calendrier.</p>
        <Button variant="secondary" onClick={props.onItinerary}>
          Voir l’itinéraire sans dates
        </Button>
      </div>
    );
  function dayItems(day: TripPlannerDay) {
    return plan.items.filter((i) => i.trip_day_id === day.id);
  }
  return (
    <div className="trip-calendar">
      <header className="trip-calendar-toolbar">
        <div>
          <h2>
            {chosen.date
              ? tripDateLabel(chosen.date, { month: 'long', year: 'numeric' })
              : 'Calendrier'}
          </h2>
          <small>Horaires locaux · {plan.timezone}</small>
        </div>
        <div className="trip-calendar-modes" aria-label="Période du calendrier">
          {(['day', 'week', 'overview'] as const).map((m) => (
            <button type="button" key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'day' ? 'Jour' : m === 'week' ? 'Semaine' : 'Séjour'}
            </button>
          ))}
        </div>
        <div className="flex">
          <button
            type="button"
            className="trip-icon-button"
            aria-label="Période précédente"
            disabled={index <= 0}
            onClick={() => onDay(dated[Math.max(0, index - (mode === 'day' ? 1 : 7))]!.id)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            className="trip-icon-button"
            aria-label="Période suivante"
            disabled={index >= dated.length - 1}
            onClick={() =>
              onDay(dated[Math.min(dated.length - 1, index + (mode === 'day' ? 1 : 7))]!.id)
            }
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </header>
      {mode === 'overview' ? (
        <div className="trip-calendar-overview">
          {dated.map((d, i) => (
            <button
              type="button"
              key={d.id}
              className={cn('trip-calendar-day-card', d.id === selectedDay && 'is-active')}
              onClick={() => {
                onDay(d.id);
                setMode('day');
              }}
            >
              <small>Jour {i + 1}</small>
              <strong>
                {tripDateLabel(d.date!, { weekday: 'short', day: 'numeric', month: 'short' })}
              </strong>
              <span>{dayItems(d).length} étapes</span>
              {dayItems(d)
                .slice(0, 3)
                .map((item) => (
                  <em key={item.id}>
                    {item.start_time?.slice(0, 5) ?? '—'}{' '}
                    {item.entry?.title ?? 'Fiche indisponible'}
                  </em>
                ))}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="trip-calendar-desktop">
            <DndContext
              id={`${id}-schedule`}
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={({ active }) => {
                dragVersion.current = plan.version;
                setDragged(plan.items.find((i) => i.id === active.id));
              }}
              onDragCancel={() => setDragged(undefined)}
              onDragEnd={({ active, over }) => {
                const item = plan.items.find((i) => i.id === active.id),
                  target = over?.data.current as { day: string; minute: number } | undefined;
                setDragged(undefined);
                if (!item || !target) return;
                const duration = itemDuration(item);
                void props.mutate(
                  {
                    operation: 'schedule_item',
                    data: {
                      id: item.id,
                      item_version: item.version,
                      day: target.day,
                      start_time: minuteTime(target.minute),
                      end_time:
                        duration && target.minute + duration < 1440
                          ? minuteTime(target.minute + duration)
                          : null,
                      duration,
                    },
                  },
                  dragVersion.current,
                );
              }}
            >
              <div
                className="trip-calendar-grid-header"
                style={{ gridTemplateColumns: `46px repeat(${days.length},minmax(0,1fr))` }}
              >
                <span />
                {days.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    id={`calendar-day-${d.id}`}
                    aria-pressed={selectedDay === d.id}
                    onClick={() => onDay(d.id)}
                  >
                    {tripDateLabel(d.date!, { weekday: 'short', day: 'numeric' })}
                    <small>{d.title}</small>
                  </button>
                ))}
              </div>
              <div
                className="trip-calendar-unscheduled"
                style={{ gridTemplateColumns: `46px repeat(${days.length},minmax(0,1fr))` }}
              >
                <span>
                  Sans
                  <br />
                  horaire
                </span>
                {days.map((d) => (
                  <div key={d.id}>
                    {dayItems(d)
                      .filter((i) => !i.start_time)
                      .map((item) => (
                        <button type="button" key={item.id} onClick={() => props.onDetails(item)}>
                          {item.entry?.title ?? 'Fiche indisponible'}
                        </button>
                      ))}
                  </div>
                ))}
              </div>
              <div ref={scroll} className="trip-calendar-scroll">
                <div
                  className="trip-calendar-hours"
                  style={{
                    gridTemplateColumns: `46px repeat(${days.length},minmax(0,1fr))`,
                    height: 24 * hourHeight,
                  }}
                >
                  <div className="trip-calendar-axis">
                    {Array.from({ length: 24 }, (_, h) => (
                      <span key={h} style={{ top: h * hourHeight }}>
                        {String(h).padStart(2, '0')}:00
                      </span>
                    ))}
                  </div>
                  {days.map((d) => (
                    <div key={d.id} className="trip-calendar-column">
                      {canEdit &&
                        Array.from({ length: 48 }, (_, i) => (
                          <Slot
                            key={i}
                            day={d.id}
                            minute={i * 30}
                            onAdd={props.onAdd}
                            editable={canEdit && !busy}
                            active={keyboardDay === d.id && activeSlot.minute === i * 30}
                            date={tripDateLabel(d.date!)}
                            onFocus={() => setActiveSlot({ day: d.id, minute: i * 30 })}
                            onNavigate={(key) => {
                              const column = days.findIndex((day) => day.id === d.id);
                              const targetDay =
                                key === 'ArrowLeft'
                                  ? days[Math.max(0, column - 1)]!.id
                                  : key === 'ArrowRight'
                                    ? days[Math.min(days.length - 1, column + 1)]!.id
                                    : d.id;
                              const minute =
                                key === 'Home'
                                  ? 0
                                  : key === 'End'
                                    ? 1410
                                    : Math.max(
                                        0,
                                        Math.min(
                                          1410,
                                          i * 30 +
                                            (key === 'ArrowUp'
                                              ? -30
                                              : key === 'ArrowDown'
                                                ? 30
                                                : 0),
                                        ),
                                      );
                              setActiveSlot({ day: targetDay, minute });
                              requestAnimationFrame(() =>
                                document
                                  .querySelector<HTMLButtonElement>(
                                    `button[data-slot-day="${targetDay}"][data-slot-minute="${minute}"]`,
                                  )
                                  ?.focus(),
                              );
                            }}
                          />
                        ))}
                      {layoutCalendarEvents(dayItems(d)).map(({ item, lane, lanes }) => (
                        <Event key={item.id} item={item} props={props} lane={lane} lanes={lanes} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <DragOverlay>
                {dragged && (
                  <div className="trip-calendar-drag-preview">
                    {dragged.entry?.title}
                    <small>{dragged.start_time?.slice(0, 5)}</small>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </div>
          <div className="trip-calendar-mobile">
            <h3>
              {tripDateLabel(chosen.date!, { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            {dayItems(chosen)
              .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99'))
              .map((item) => (
                <div key={item.id} className="trip-agenda-row">
                  {canEdit ? (
                    <QuickStepEditor item={item} plan={plan} busy={busy} mutate={props.mutate} />
                  ) : (
                    <span>{item.start_time?.slice(0, 5) ?? 'Libre'}</span>
                  )}
                  <button type="button" onClick={() => props.onDetails(item)}>
                    <strong>{item.entry?.title ?? 'Fiche indisponible'}</strong>
                    <small>
                      {item.entry?.category?.name}
                      {itemDuration(item) ? ` · ${itemDuration(item)} min` : ''}
                    </small>
                  </button>
                </div>
              ))}
            {canEdit && (
              <button
                type="button"
                className="trip-add-step"
                onClick={() => props.onAdd(chosen.id)}
              >
                <Plus className="size-4" /> Ajouter une étape
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
