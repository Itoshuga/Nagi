'use client';
import { calendarColorStyle } from './calendar-color-style';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DragOverlay,
  useDndContext,
  type DragMoveEvent,
  useDroppable,
  useDndMonitor,
} from '@dnd-kit/core';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, cn } from '@nagi/ui';
import type { TripPlanItem, TripPlannerDay } from '@nagi/database';
import { calendarEventColor, formatTripDuration, tripDayLabel, tripDateLabel } from '@nagi/shared';
import {
  itemDuration,
  createCalendarLayoutCache,
  minuteTime,
  type WorkspaceViewProps,
} from './planner-model';
import { CalendarCompactEvent } from './calendar-card';
import { TripItinerary } from './itinerary';
import { CalendarEvent, CalendarPlaceTitle } from './calendar-event';
import './calendar-interactions.css';
import { followPointer } from './drag-overlay';
import { useDragPointer } from './drag-pointer';
import { useCalendarClock } from './use-calendar-clock';
import { useCalendarScroll } from './use-calendar-scroll';
import {
  calendarHourHeight,
  calendarMinuteHeight,
  calendarItemDestination,
  calendarMoveChange,
  calendarScheduleLabel,
  calendarSnapMinutes,
  type CalendarDestination,
} from './calendar-model';

import {
  catalogCalendarSchedule,
  isCatalogDrag,
  isCalendarDrop,
  type CatalogDragData,
  dragPointer,
  calendarDropRect,
} from './catalog-drag';

const hourHeight = calendarHourHeight,
  minuteHeight = calendarMinuteHeight;
const emptyCalendarItems: TripPlanItem[] = [];
const calendarOverlayModifiers = [followPointer];
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
  const dated = useMemo(() => plan.days.filter((d) => d.date), [plan.days]),
    chosen = dated.find((d) => d.id === selectedDay) ?? dated[0];
  const [mode, setMode] = useState<'day' | 'week' | 'overview'>(
    dated.length > 10 ? 'overview' : dated.length === 1 ? 'day' : 'week',
  );
  const [dragged, setDragged] = useState<TripPlanItem>(),
    dragSource = useRef<
      { item: TripPlanItem; trip: number; grab: number; zone: string } | undefined
    >(undefined),
    scroll = useRef<HTMLDivElement>(null);
  const [activeSlot, setActiveSlot] = useState<{ day?: string; minute: number }>({ minute: 540 });
  const [destination, setDestination] = useState<CalendarDestination>();
  const [catalog, setCatalog] = useState<CatalogDragData>();
  const pointerRef = useDragPointer(!!catalog || !!dragged);
  useCalendarScroll(scroll, pointerRef, !!catalog || !!dragged, `${mode}:${selectedDay}`);
  const [scheduleLayout] = useState(() => createCalendarLayoutCache());
  const { measureDroppableContainers } = useDndContext();
  const periodTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const periodHover = useRef<string | undefined>(undefined);
  useEffect(() => () => clearTimeout(periodTimer.current), []);
  const index = dated.findIndex((d) => d.id === chosen?.id),
    start = Math.floor(Math.max(0, index) / 7) * 7;
  const days = useMemo(
    () => (mode === 'day' ? (chosen ? [chosen] : []) : dated.slice(start, start + 7)),
    [mode, chosen, dated, start],
  );
  const clock = useCalendarClock(plan.timezone);
  const itemsByDay = useMemo(() => {
    const grouped = new Map<string | null, TripPlanItem[]>();
    for (const item of plan.items) {
      const list = grouped.get(item.trip_day_id);
      if (list) list.push(item);
      else grouped.set(item.trip_day_id, [item]);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.sort_order - b.sort_order);
    return grouped;
  }, [plan.items]);
  const hasUnscheduled = useMemo(
    () => days.some((day) => itemsByDay.get(day.id)?.some((item) => !item.start_time)),
    [days, itemsByDay],
  );
  const keyboardDay = days.some((d) => d.id === activeSlot.day) ? activeSlot.day : chosen?.id;
  useEffect(() => {
    if ((!dragged && !catalog) || !scroll.current) return;
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measureDroppableContainers([]));
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(scroll.current);
    if (scroll.current.firstElementChild) observer.observe(scroll.current.firstElementChild);
    scroll.current.addEventListener('scroll', refresh, { passive: true });
    const element = scroll.current;
    refresh();
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', refresh);
      cancelAnimationFrame(frame);
    };
  }, [dragged, catalog, measureDroppableContainers, mode, selectedDay]);
  function hoverPeriod(point?: { x: number; y: number }) {
    const button = point
      ? document
          .elementFromPoint(point.x, point.y)
          ?.closest<HTMLButtonElement>('[data-calendar-period],[data-calendar-mode]')
      : undefined;
    const direction =
      button && !button.disabled && button.dataset.calendarMode !== mode
        ? (button.dataset.calendarPeriod ?? `mode:${button.dataset.calendarMode}`)
        : undefined;
    if (direction === periodHover.current) return;
    clearTimeout(periodTimer.current);
    periodHover.current = direction;
    if (!direction) return;
    periodTimer.current = setTimeout(() => {
      if (direction.startsWith('mode:')) {
        const nextMode = direction.slice(5);
        if (nextMode === 'day' || nextMode === 'week' || nextMode === 'overview') {
          if (nextMode === 'day' && dragged?.trip_day_id) onDay(dragged.trip_day_id);
          setMode(nextMode);
        }
        return;
      }
      const target =
        direction === 'next'
          ? dated[Math.min(dated.length - 1, mode === 'day' ? index + 1 : start + 7)]
          : dated[Math.max(0, mode === 'day' ? index - 1 : start - 7)];
      if (target) onDay(target.id);
    }, 750);
  }
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
  ): CalendarDestination | undefined {
    const target = event.over?.data.current;
    if (!isCalendarDrop(target) || !plan.days.some((day) => day.id === target.day)) return;
    const point = pointerRef.current ?? dragPointer(event);
    const rect = calendarDropRect(target, event.over!.rect);
    if (
      point &&
      (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom)
    )
      return;
    const data = event.active.data.current?.type ? event.active.data.current : catalog;
    if (isCatalogDrag(data)) {
      const timed = catalogCalendarSchedule(data, event, point);
      if (timed) return { ...timed, zone: 'timed', before: null };
      if (!target.zone || target.zone === 'timed') return;
      return {
        day: target.day,
        start: null,
        end: null,
        duration: data.entry.suggested_duration_minutes ?? null,
        zone: target.zone,
        before: target.before ?? null,
      };
    }
    const source = dragSource.current;
    if (!source) return;
    let minute: number | undefined;
    let preserve = false;
    if (!target.zone || target.zone === 'timed') {
      if (point) {
        minute = (point.y - rect.top - source.grab) / minuteHeight;
        // Horizontal moves retain even non-rounded existing clocks if the
        // vertical movement remains within half a snap, including scroll.
        if (source.zone === 'timed' && source.item.start_time) {
          const initial =
            Number(source.item.start_time.slice(0, 2)) * 60 +
            Number(source.item.start_time.slice(3, 5));
          if (Math.abs(minute - initial) < calendarSnapMinutes / 2) {
            minute = initial;
            preserve = true;
          }
        }
      } else {
        const translated = event.active.rect.current.translated;
        minute = translated ? (translated.top - rect.top) / minuteHeight : undefined;
      }
    }
    if (target.before === source.item.id) return;
    const next = calendarItemDestination(source.item, target, minute, preserve);
    if (
      next?.zone === 'unscheduled' &&
      source.item.start_time &&
      next.day === source.item.trip_day_id
    ) {
      next.before =
        itemsByDay
          .get(next.day)
          ?.find((item) => !item.start_time && item.sort_order > source.item.sort_order)?.id ??
        null;
    }
    return next;
  }
  function resetDrag() {
    setDragged(undefined);
    setCatalog(undefined);
    setDestination(undefined);
    dragSource.current = undefined;
    clearTimeout(periodTimer.current);
    periodHover.current = undefined;
  }
  useDndMonitor({
    onDragStart: ({ active, activatorEvent }) => {
      pointerRef.current = dragPointer({ activatorEvent, delta: { x: 0, y: 0 } });
      if (isCatalogDrag(active.data.current)) {
        setCatalog(active.data.current);
        return;
      }
      if (active.data.current?.type !== 'calendar-item') return;
      const item = plan.items.find((entry) => entry.id === active.data.current?.id);
      if (!item) return;
      const rect =
        document
          .querySelector<HTMLElement>(`[data-calendar-item-id="${item.id}"]`)
          ?.getBoundingClientRect() ?? active.rect.current.initial;
      dragSource.current = {
        item,
        trip: plan.version,
        zone: String(active.data.current?.zone ?? 'timed'),
        grab: 0,
      };
      const point = dragPointer({ activatorEvent, delta: { x: 0, y: 0 } });
      if (dragSource.current.zone === 'timed' && point && rect)
        dragSource.current.grab = point.y - rect.top;
      setDragged(item);
    },
    onDragMove: (event) => {
      hoverPeriod(pointerRef.current ?? dragPointer(event));
      const next = targetSchedule(event);
      setDestination((old) =>
        old?.day === next?.day &&
        old?.start === next?.start &&
        old?.zone === next?.zone &&
        old?.before === next?.before
          ? old
          : next,
      );
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
      if (!canEdit || !source || !next) return;
      const change = calendarMoveChange(source.item, next);
      if (change) void props.mutate(change, source.trip, { item: source.item, calendar: true });
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
    return itemsByDay.get(day.id) ?? emptyCalendarItems;
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
          <small>
            <span className="trip-calendar-local-label">Horaires locaux · </span>
            {plan.timezone}
          </small>
        </div>
        <div className="trip-calendar-modes" role="group" aria-label="Période du calendrier">
          {(['day', 'week', 'overview'] as const).map((m) => (
            <button
              type="button"
              key={m}
              data-calendar-mode={m}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              title={dragged || catalog ? 'Maintenir ici pour changer de vue' : undefined}
            >
              {m === 'day' ? 'Jour' : m === 'week' ? 'Semaine' : 'Séjour'}
            </button>
          ))}
        </div>
        <div
          className="trip-calendar-period-navigation"
          role="group"
          aria-label="Navigation du calendrier"
        >
          <button
            type="button"
            className="trip-icon-button"
            aria-label="Période précédente"
            data-calendar-period="previous"
            title={
              dragged || catalog ? 'Maintenir ici pour changer de période' : 'Période précédente'
            }
            disabled={mode === 'overview' || (mode === 'week' ? start <= 0 : index <= 0)}
            onClick={() => onDay(dated[Math.max(0, mode === 'day' ? index - 1 : start - 7)]!.id)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            className="trip-icon-button"
            aria-label="Période suivante"
            data-calendar-period="next"
            title={
              dragged || catalog ? 'Maintenir ici pour changer de période' : 'Période suivante'
            }
            disabled={
              mode === 'overview' ||
              (mode === 'week' ? start + 7 >= dated.length : index >= dated.length - 1)
            }
            onClick={() =>
              onDay(dated[Math.min(dated.length - 1, mode === 'day' ? index + 1 : start + 7)]!.id)
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
              editable={canEdit && !busy}
              zone="overview"
              active={destination?.day === d.id && destination.zone === 'overview'}
              className={cn('trip-calendar-day-card', d.id === selectedDay && 'is-active')}
            >
              <button
                type="button"
                className="trip-calendar-day-open"
                onClick={() => {
                  onDay(d.id);
                  setMode('day');
                }}
              >
                <small>Jour {i + 1}</small>
                <strong className={cn(d.date === clock?.date && 'is-today')}>
                  {tripDateLabel(d.date!, { weekday: 'short', day: 'numeric', month: 'short' })}
                </strong>
                <span>{dayItems(d).length} étapes</span>
              </button>
              {dayItems(d).map((item) => (
                <CalendarCompactEvent key={item.id} item={item} props={props} zone="overview" />
              ))}
              {destination?.day === d.id && destination.zone === 'overview' && (
                <span className="trip-calendar-zone-hint">
                  Déplacer vers cette journée · horaire conservé
                </span>
              )}
            </CalendarDayTarget>
          ))}
        </div>
      ) : (
        <>
          <div
            className="trip-calendar-desktop"
            style={
              {
                // Leave at least 160px for the official label after event insets.
                '--trip-calendar-min-width': `${52 + days.length * 112}px`,
                '--trip-calendar-columns': `52px repeat(${days.length},minmax(0,1fr))`,
              } as CSSProperties
            }
          >
            <div
              ref={scroll}
              className="trip-calendar-scroll"
              tabIndex={0}
              aria-label="Grille horaire du voyage"
            >
              <div className="trip-calendar-grid">
                <div className="trip-calendar-head">
                  <div className="trip-calendar-grid-header">
                    <span className="trip-calendar-corner" aria-hidden="true" />
                    {days.map((d) => (
                      <button
                        type="button"
                        key={d.id}
                        id={`calendar-day-${d.id}`}
                        aria-pressed={selectedDay === d.id}
                        aria-current={d.date === clock?.date ? 'date' : undefined}
                        aria-label={tripDateLabel(d.date!, {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                        className={cn(
                          d.date === clock?.date && 'is-today',
                          destination?.day === d.id && 'is-drop-target',
                        )}
                        onClick={() => onDay(d.id)}
                      >
                        <span className="trip-calendar-weekday">
                          {tripDateLabel(d.date!, { weekday: 'short' })}
                        </span>
                        <span className="trip-calendar-date-number">
                          {tripDateLabel(d.date!, { day: 'numeric' })}
                        </span>
                        {d.title && <small>{d.title}</small>}
                      </button>
                    ))}
                  </div>
                  <div className={cn('trip-calendar-unscheduled', !hasUnscheduled && 'is-empty')}>
                    <span className="trip-calendar-corner">
                      <span>Sans horaire</span>
                    </span>
                    {days.map((d) => (
                      <CalendarDayTarget
                        key={d.id}
                        day={d.id}
                        editable={canEdit && !busy}
                        zone="unscheduled"
                        active={destination?.day === d.id && destination.zone === 'unscheduled'}
                      >
                        {dayItems(d)
                          .filter((item) => !item.start_time)
                          .map((item) => (
                            <CalendarCompactEvent
                              key={item.id}
                              item={item}
                              props={props}
                              zone="unscheduled"
                              insertion={
                                destination?.zone === 'unscheduled' &&
                                destination.day === d.id &&
                                destination.before === item.id
                              }
                            />
                          ))}
                        {destination?.day === d.id && destination.zone === 'unscheduled' && (
                          <span className="sr-only" role="status">
                            {dragged?.start_time ? 'Retirer l’horaire' : 'Sans horaire'} ·{' '}
                            {tripDayLabel(d.date!)}
                          </span>
                        )}
                        {!dayItems(d).some((item) => !item.start_time) && (
                          <span className="trip-calendar-unscheduled-empty" aria-hidden="true">
                            {dragged || catalog ? 'Déposer sans horaire' : '—'}
                          </span>
                        )}
                      </CalendarDayTarget>
                    ))}
                  </div>
                </div>
                <div
                  className="trip-calendar-hours"
                  style={{
                    height: 24 * hourHeight,
                  }}
                >
                  <div className="trip-calendar-axis">
                    {Array.from(
                      { length: 24 },
                      (_, h) =>
                        h > 0 && (
                          <span key={h} style={{ top: h * hourHeight }}>
                            {String(h).padStart(2, '0')}:00
                          </span>
                        ),
                    )}
                  </div>
                  {days.map((d) => (
                    <CalendarColumn key={d.id} day={d.id} editable={canEdit}>
                      {clock && d.date === clock.date && (
                        <div
                          className="trip-calendar-now"
                          style={{ top: clock.minutes * minuteHeight }}
                          role="img"
                          aria-label={`Heure actuelle : ${clock.label} · ${plan.timezone}`}
                        >
                          <span />
                        </div>
                      )}
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
                      {previewItem &&
                        destination?.day === d.id &&
                        destination.start != null &&
                        destination.zone === 'timed' && (
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
                              width: 'calc(100% - 6px)',
                            }}
                          >
                            {(catalog || dragged) && (
                              <>
                                <strong>
                                  {catalog ? (
                                    catalog.entry.title
                                  ) : (
                                    <CalendarPlaceTitle item={dragged!} load={false} />
                                  )}
                                </strong>
                                <span className="trip-calendar-drag-time">
                                  {calendarScheduleLabel(destination)}
                                  {destination.duration == null
                                    ? ' · Durée libre'
                                    : ` · ${formatTripDuration(destination.duration)}`}
                                  <small>{tripDayLabel(d.date!)}</small>
                                </span>
                              </>
                            )}
                          </div>
                        )}
                    </CalendarColumn>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {dragged && (
        <DragOverlay
          modifiers={calendarOverlayModifiers}
          dropAnimation={null}
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="trip-calendar-drag-card"
            style={calendarColorStyle(
              calendarEventColor(dragged.calendar_color, dragged.entry?.category?.color),
            )}
          >
            <CalendarPlaceTitle item={dragged} load={false} />
            <span className="trip-calendar-drag-time" role="status">
              {destination
                ? calendarScheduleLabel(destination)
                : (dragged.start_time?.slice(0, 5) ?? 'Sans horaire')}
              {itemDuration(dragged) == null
                ? ' · Durée libre'
                : ` · ${formatTripDuration(itemDuration(dragged))}`}
              {destination && (
                <span className="sr-only">
                  {' '}
                  · {tripDayLabel(plan.days.find((day) => day.id === destination.day)?.date ?? '')}
                </span>
              )}
            </span>
            {destination && (
              <small>
                {tripDayLabel(plan.days.find((day) => day.id === destination.day)?.date ?? '')}
              </small>
            )}
          </div>
        </DragOverlay>
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
    data: { type: 'calendar', zone: 'timed', day },
    disabled: !editable,
  });
  return (
    <div
      ref={setNodeRef}
      className="trip-calendar-column"
      data-calendar-day={day}
      data-calendar-zone="timed"
    >
      {children}
    </div>
  );
}
function CalendarDayTarget({
  day,
  editable,
  className,
  children,
  zone,
  active,
}: {
  day: string;
  editable: boolean;
  className?: string;
  children: React.ReactNode;
  zone: 'unscheduled' | 'overview';
  active?: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: `calendar-day:${day}:${zone}`,
    data: { type: 'calendar', zone, day, before: null },
    disabled: !editable,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(className, active && 'is-calendar-day-over')}
      data-calendar-zone={zone}
      data-calendar-day={day}
    >
      {children}
    </div>
  );
}
