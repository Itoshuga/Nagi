'use client';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Clock3, Inbox, Plus, Route } from 'lucide-react';
import { cn } from '@nagi/ui';
import { tripStepCount } from '@nagi/shared';
import type { TripPlan } from '@nagi/database';
import { TripDayEditor } from './plan-dialogs';
import type { DaySelection, PlanMutation } from './planner-model';
import {
  navigationDayCounts,
  navigationDayDate,
  navigationScrollDelta,
} from './day-navigation-model';

function DayNav({
  id,
  active,
  label,
  date,
  title,
  count,
  onClick,
  editable,
  kind = 'day',
}: {
  id: string;
  active: boolean;
  label: string;
  date?: ReturnType<typeof navigationDayDate>;
  title?: string;
  count: number;
  onClick: () => void;
  editable: boolean;
  kind?: 'all' | 'day' | 'pending';
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `nav:${id}`,
    data: { day: id === 'pending' ? null : id, before: null },
    disabled: !editable || id === 'all',
  });
  const accessible = [label, date?.full, title, tripStepCount(count)].filter(Boolean).join(', ');
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-day-nav-id={id}
      data-day-kind={kind}
      aria-current={active ? 'true' : undefined}
      aria-label={accessible}
      title={isOver ? `Déposer dans ${label}` : accessible}
      className={cn(
        'trip-day-nav-item',
        title && 'has-title',
        active && 'is-active',
        isOver && 'is-over',
      )}
      onClick={onClick}
    >
      {kind === 'all' ? (
        <Route className="trip-day-nav-icon" aria-hidden="true" />
      ) : kind === 'pending' ? (
        <Inbox className="trip-day-nav-icon" aria-hidden="true" />
      ) : null}
      <span className="trip-day-copy">
        <span className="trip-day-line">
          <strong>{label}</strong>
          {date && (
            <time dateTime={date.value} title={date.full}>
              {date.short}
            </time>
          )}
        </span>
        {title && <span className="trip-day-custom-title">{title}</span>}
      </span>
      <span className="trip-day-count" aria-hidden="true">
        {count}
      </span>
    </button>
  );
}
export function TripDaysNavigation({
  plan,
  selectedDay,
  visible,
  editing,
  busy,
  dragging,
  mutate,
  onDay,
}: {
  plan: TripPlan;
  selectedDay: DaySelection;
  visible: boolean;
  editing: boolean;
  busy: boolean;
  dragging: boolean;
  mutate: PlanMutation;
  onDay: (day: DaySelection) => void;
}) {
  const nav = useRef<HTMLElement>(null),
    content = useRef<HTMLDivElement>(null),
    days = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => navigationDayCounts(plan.items), [plan.items]);
  function reveal(button: HTMLElement) {
    const port = matchMedia('(max-width: 1023.98px)').matches ? content.current : days.current;
    if (!port || !port.contains(button) || !port.clientHeight || !port.clientWidth) return;
    const delta = navigationScrollDelta(
      port.getBoundingClientRect(),
      button.getBoundingClientRect(),
    );
    if (port.scrollHeight > port.clientHeight) port.scrollTop += delta.top;
    if (port.scrollWidth > port.clientWidth) port.scrollLeft += delta.left;
  }
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>('.trip-day-nav-item.is-active');
    if (active) reveal(active);
  }, [selectedDay, visible]);
  function navigate(event: KeyboardEvent<HTMLElement>) {
    if (
      dragging ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const target = event.target as HTMLElement;
    if (!target.matches('.trip-day-nav-item')) return;
    const horizontal = matchMedia('(max-width: 1023.98px)').matches;
    const forward = horizontal ? 'ArrowRight' : 'ArrowDown',
      backward = horizontal ? 'ArrowLeft' : 'ArrowUp';
    if (![forward, backward, 'Home', 'End'].includes(event.key)) return;
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('.trip-day-nav-item'),
    ];
    const index = buttons.indexOf(target as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? buttons[0]
        : event.key === 'End'
          ? buttons.at(-1)
          : buttons[
              Math.max(0, Math.min(buttons.length - 1, index + (event.key === forward ? 1 : -1)))
            ];
    if (next) {
      event.preventDefault();
      next.focus({ preventScroll: true });
      reveal(next);
    }
  }
  const timezoneLabel = `Horaires affichés dans le fuseau du voyage : ${plan.timezone}`;
  return (
    <nav
      ref={nav}
      className="trip-day-navigation"
      aria-label="Journées du voyage"
      onKeyDown={navigate}
    >
      <div className="trip-days-top">
        <span>Votre séjour</span>
        {editing && (
          <TripDayEditor plan={plan} mutate={mutate}>
            <button
              type="button"
              className="trip-icon-button trip-day-add-button"
              aria-label="Ajouter une journée"
              title="Ajouter une journée"
              disabled={busy}
            >
              <Plus aria-hidden="true" className="size-3.5" />
            </button>
          </TripDayEditor>
        )}
      </div>
      <div ref={content} className="trip-days-scroll">
        <DayNav
          kind="all"
          id="all"
          active={selectedDay === 'all'}
          label="Tout le voyage"
          count={counts.get('all') ?? 0}
          editable={editing}
          onClick={() => onDay('all')}
        />
        <div ref={days} className="trip-day-links">
          {plan.days.map((day, index) => (
            <DayNav
              key={day.id}
              id={day.id}
              active={selectedDay === day.id}
              label={`Jour ${index + 1}`}
              date={navigationDayDate(day.date)}
              title={day.title?.trim() || undefined}
              count={counts.get(day.id) ?? 0}
              editable={editing}
              onClick={() => onDay(day.id)}
            />
          ))}
        </div>
        <div className="trip-days-footer">
          <DayNav
            kind="pending"
            id="pending"
            active={selectedDay === 'pending'}
            label="À organiser"
            count={counts.get('pending') ?? 0}
            editable={editing}
            onClick={() => onDay('pending')}
          />
          <p className="trip-timezone" title={timezoneLabel} aria-label={timezoneLabel}>
            <Clock3 aria-hidden="true" />
            <span>{plan.timezone}</span>
          </p>
        </div>
      </div>
    </nav>
  );
}
