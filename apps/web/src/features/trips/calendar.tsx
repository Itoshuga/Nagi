'use client';
import { calendarColorStyle } from './calendar-color-style';
import { useEffect, useRef, useState } from 'react';
import { DragOverlay, type DragMoveEvent, useDroppable, useDndMonitor } from '@dnd-kit/core';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button, cn } from '@nagi/ui';
import type { TripPlanItem, TripPlannerDay } from '@nagi/database';
import {
  calendarEventColor,
  formatTripDuration,
  formatTripTime,
  tripDayLabel,
  tripDateLabel,
} from '@nagi/shared';
import {
  itemDuration,
  createCalendarLayoutCache,
  minuteTime,
  type WorkspaceViewProps,
} from './planner-model';
import { QuickStepEditor } from './step-editor';
import { TripItinerary } from './itinerary';
import { CalendarEvent, CalendarEventCopy } from './calendar-event';
import { useCalendarColors } from './calendar-colors';
import { useDragPointer } from './drag-pointer';
import {
  calendarHourHeight,
  calendarMinuteHeight,
  calendarScheduleFields,
  calendarScheduleLabel,
  movedCalendarSchedule,
  unchangedCalendarSchedule,
  type CalendarSchedule,
} from './calendar-model';

import {
  catalogCalendarSchedule,
  isCatalogDrag,
  isCalendarDrop,
  type CatalogDragData,
} from './catalog-drag';

const hourHeight = calendarHourHeight,
  minuteHeight = calendarMinuteHeight;
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
  return (
    <button
      type="button"
      className="trip-calendar-slot"
      style={{ top: minute * minuteHeight, height: hourHeight / 2 }}
      disabled={!editable}
      tabIndex={active ? 0 : -1}
      data-slot-day={day}
      data-slot-minute={minute}
      onFocus={onFocus}
      title={date}
      aria-describedby={`calendar-day-${day}`}
      aria-label={`Ajouter une étape à ${minuteTime(minute)}`}
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
export function TripCalendar(props: WorkspaceViewProps) {
  const { plan, selectedDay, onDay, canEdit, busy } = props;
  const dated = plan.days.filter((d) => d.date),
    chosen = dated.find((d) => d.id === selectedDay) ?? dated[0];
  const [mode, setMode] = useState<'day' | 'week' | 'overview'>(
    dated.length > 10 ? 'overview' : dated.length === 1 ? 'day' : 'week',
  );
  const [dragged, setDragged] = useState<TripPlanItem>(),
    dragSource = useRef<
      { item: TripPlanItem; trip: number; width: number; height: number } | undefined
    >(undefined),
    scroll = useRef<HTMLDivElement>(null);
  const [activeSlot, setActiveSlot] = useState<{ day?: string; minute: number }>({ minute: 540 });
  const [dragBox, setDragBox] = useState<{ width: number; height: number }>();
  const [destination, setDestination] = useState<CalendarSchedule>();
  const [catalog, setCatalog] = useState<CatalogDragData>();
  const pointer = useDragPointer(!!catalog || !!dragged);
  const [scheduleLayout] = useState(() => createCalendarLayoutCache());
  const colors = useCalendarColors();
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
  function targetSchedule(
    event: Pick<DragMoveEvent, 'active' | 'over' | 'delta' | 'activatorEvent'>,
  ) {
    const data = event.active.data.current;
    if (isCatalogDrag(data)) return catalogCalendarSchedule(data, event, pointer.current);
    const source = dragSource.current;
    if (!source || !isCalendarDrop(event.over?.data.current)) return;
    return movedCalendarSchedule(
      source.item,
      event.over.data.current.day,
      event.delta.y / minuteHeight,
    );
  }
  function resetDrag() {
    setDragged(undefined);
    setCatalog(undefined);
    setDestination(undefined);
    dragSource.current = undefined;
  }
  useDndMonitor({
    onDragStart: ({ active }) => {
      if (isCatalogDrag(active.data.current)) {
        setCatalog(active.data.current);
        return;
      }
      if (active.data.current?.type !== 'calendar-item') return;
      const item = plan.items.find((entry) => entry.id === active.data.current?.id);
      if (!item) return;
      const rect = active.rect.current.initial;
      dragSource.current = {
        item,
        trip: plan.version,
        width: rect?.width ?? 120,
        height: rect?.height ?? 56,
      };
      setDragBox({ width: rect?.width ?? 120, height: rect?.height ?? 56 });
      setDragged(item);
    },
    onDragMove: (event) => {
      const next = targetSchedule(event);
      setDestination((old) => (old?.day === next?.day && old?.start === next?.start ? old : next));
    },
    onDragOver: (event) => {
      const next = targetSchedule(event);
      setDestination(next);
    },
    onDragCancel: resetDrag,
    onDragEnd: (event) => {
      const source = dragSource.current,
        next = targetSchedule(event);
      resetDrag();
      if (!canEdit || !source || !next || unchangedCalendarSchedule(source.item, next)) return;
      void props.mutate(
        {
          operation: 'schedule_item',
          data: {
            id: source.item.id,
            item_version: source.item.version,
            ...calendarScheduleFields(next),
          },
        },
        source.trip,
        { item: source.item },
      );
    },
  });
  const previewItem =
    dragged ?? (catalog ? { entry: catalog.entry, calendar_color: null, stops: [] } : undefined);
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
    <div className={cn('trip-calendar', (dragged || catalog) && 'is-dragging')}>
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
            <CalendarDayTarget
              key={d.id}
              day={d.id}
              editable={canEdit}
              button
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
                  <em
                    key={item.id}
                    data-calendar-colored={!!item.calendar_color}
                    style={calendarColorStyle(
                      calendarEventColor(item.calendar_color, item.entry?.category?.color),
                    )}
                  >
                    {formatTripTime(item.start_time) ?? '—'}{' '}
                    {item.entry?.title ?? 'Fiche indisponible'}
                  </em>
                ))}
            </CalendarDayTarget>
          ))}
        </div>
      ) : (
        <>
          <div className="trip-calendar-desktop">
            <>
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
                  <CalendarDayTarget key={d.id} day={d.id} editable={canEdit}>
                    {dayItems(d)
                      .filter((i) => !i.start_time)
                      .map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => props.onDetails(item)}
                          style={calendarColorStyle(
                            calendarEventColor(item.calendar_color, item.entry?.category?.color),
                          )}
                          onContextMenu={(event) => {
                            if (canEdit) {
                              event.preventDefault();
                              colors?.open(
                                item,
                                { x: event.clientX, y: event.clientY },
                                event.currentTarget,
                              );
                            }
                          }}
                          onKeyDown={(event) => {
                            if (
                              canEdit &&
                              (event.key === 'ContextMenu' ||
                                (event.shiftKey && event.key === 'F10'))
                            ) {
                              event.preventDefault();
                              colors?.open(item, undefined, event.currentTarget);
                            }
                          }}
                        >
                          {item.entry?.title ?? 'Fiche indisponible'}
                        </button>
                      ))}
                  </CalendarDayTarget>
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
                    <CalendarColumn key={d.id} day={d.id} editable={canEdit}>
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
                      {scheduleLayout(d.id, dayItems(d)).map(({ item, lane, lanes }) => (
                        <CalendarEvent
                          key={item.id}
                          item={item}
                          props={props}
                          lane={lane}
                          lanes={lanes}
                          scroll={scroll}
                        />
                      ))}
                      {previewItem && destination?.day === d.id && (
                        <div
                          className="trip-calendar-drop-preview"
                          aria-hidden="true"
                          style={{
                            ...calendarColorStyle(
                              calendarEventColor(
                                previewItem.calendar_color,
                                previewItem.entry?.category?.color,
                              ),
                            ),
                            top: destination.start * minuteHeight,
                            height: Math.max(
                              1,
                              Math.min(1440 - destination.start, destination.duration ?? 30) *
                                minuteHeight,
                            ),
                            width: catalog ? 'calc(100% - 6px)' : dragBox?.width,
                          }}
                        >
                          {catalog && (
                            <>
                              <strong>{catalog.entry.title}</strong>
                              <span className="trip-calendar-drag-time">
                                {calendarScheduleLabel(destination)} · {destination.duration} min{' '}
                                {catalog.entry.suggested_duration_minutes
                                  ? 'conseillées'
                                  : 'initiales'}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </CalendarColumn>
                  ))}
                </div>
              </div>
              <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
                {dragged &&
                  dragBox &&
                  (() => {
                    const current =
                      destination ?? movedCalendarSchedule(dragged, dragged.trip_day_id!, 0);
                    return (
                      <div
                        className={cn(
                          'trip-calendar-event',
                          'trip-calendar-drag-preview',
                          current.duration != null && current.duration <= 30 && 'is-compact',
                        )}
                        style={{
                          ...calendarColorStyle(
                            calendarEventColor(
                              dragged.calendar_color,
                              dragged.entry?.category?.color,
                            ),
                          ),
                          width: dragBox.width,
                          height: dragBox.height,
                        }}
                      >
                        <div className="trip-calendar-event-copy">
                          <CalendarEventCopy item={dragged} schedule={current} />
                        </div>
                        <span className="trip-calendar-drag-time" role="status">
                          {calendarScheduleLabel(current)}
                        </span>
                      </div>
                    );
                  })()}
              </DragOverlay>
            </>
          </div>
          <CalendarDayTarget day={chosen.id} editable={canEdit} className="trip-calendar-mobile">
            <h3>{tripDayLabel(chosen.date!)}</h3>
            {dayItems(chosen)
              .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99'))
              .map((item) => (
                <div
                  key={item.id}
                  className="trip-agenda-row"
                  data-calendar-colored={!!item.calendar_color}
                  style={calendarColorStyle(
                    calendarEventColor(item.calendar_color, item.entry?.category?.color),
                  )}
                >
                  {canEdit ? (
                    <QuickStepEditor item={item} plan={plan} busy={busy} mutate={props.mutate} />
                  ) : (
                    <span>{formatTripTime(item.start_time) ?? 'Libre'}</span>
                  )}
                  <button type="button" onClick={() => props.onDetails(item)}>
                    <strong>{item.entry?.title ?? 'Fiche indisponible'}</strong>
                    <small>
                      {item.entry?.category?.name}
                      {itemDuration(item) ? ` · ${formatTripDuration(itemDuration(item))}` : ''}
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
          </CalendarDayTarget>
        </>
      )}
    </div>
  );
}

function CalendarColumn({
  day,
  editable,
  children,
}: {
  day: string;
  editable: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: `calendar-column:${day}`,
    data: { type: 'calendar', day },
    disabled: !editable,
  });
  return (
    <div ref={setNodeRef} className="trip-calendar-column" data-calendar-day={day}>
      {children}
    </div>
  );
}
function CalendarDayTarget({
  day,
  editable,
  button,
  className,
  children,
  onClick,
}: {
  day: string;
  editable: boolean;
  button?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `calendar-day:${day}:${button ? 'overview' : (className ?? 'unscheduled')}`,
    data: { day, before: null },
    disabled: !editable,
  });
  const classes = cn(className, isOver && 'is-catalog-day-over');
  return button ? (
    <button type="button" ref={setNodeRef} className={classes} onClick={onClick}>
      {children}
    </button>
  ) : (
    <div ref={setNodeRef} className={classes}>
      {children}
    </div>
  );
}
