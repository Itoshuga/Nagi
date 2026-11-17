'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Pencil } from 'lucide-react';
import { Alert, Button, Card, EmptyState, cn } from '@nagi/ui';
import type { TripPlan } from '@nagi/database';
import { overlappingTripItems, tripDateLabel } from '@nagi/shared';
import { entryHref } from '@/features/entries/links';
import { AddPlaceDialog, dayLabel } from './add-place-dialog';
import { TripStepDialog } from './plan-dialogs';
import { calendarDateAt, dayRange, stepTime, type PlanMutation } from './planner-model';

const pageSize = 21;
function dayMarker(date: string) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function TripCalendar({
  guild,
  plan,
  canEdit,
  canManage,
  busy,
  mutate,
  categories,
}: {
  guild: string;
  plan: TripPlan;
  canEdit: boolean;
  canManage: boolean;
  busy: boolean;
  mutate: PlanMutation;
  categories: { id: string; name: string }[];
}) {
  const dated = plan.days.filter((day) => day.date);
  const start = plan.start_date ?? dated[0]?.date ?? plan.end_date;
  const end = plan.end_date ?? dated.at(-1)?.date ?? start;
  const total = start && end && start <= end ? dayRange(start, end) : 0;
  const [state, setState] = useState<{ page: number; date?: string }>({ page: 0 });
  const page = Math.max(0, Math.min(state.page, Math.ceil(total / pageSize) - 1));
  const first = page * pageSize;
  const dates =
    start && total > 0
      ? Array.from({ length: Math.min(pageSize, total - first) }, (_, index) =>
          calendarDateAt(start, first + index),
        )
      : [];
  const byDate = new Map(dated.map((day) => [day.date, day]));
  const selected = dates.find((date) => date === state.date) ?? dates[0];
  if (!selected)
    return (
      <EmptyState
        title="Le calendrier attend vos dates"
        description="Ajoutez les dates du séjour pour visualiser les visites dans le calendrier. L’itinéraire est disponible sans dates."
      >
        {canManage && (
          <Button asChild className="mt-4">
            <Link href={`/app/${guild}/trips/${plan.id}/settings`}>Ajouter les dates</Link>
          </Button>
        )}
      </EmptyState>
    );
  const day = byDate.get(selected);
  const items = day
    ? plan.items
        .filter((item) => item.trip_day_id === day.id)
        .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99'))
    : [];
  const conflicts = overlappingTripItems(items);
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-extrabold">Calendrier du séjour</h2>
            <p className="text-xs text-muted-foreground">
              {tripDateLabel(dates[0]!, { dateStyle: 'medium' })} –{' '}
              {tripDateLabel(dates.at(-1)!, { dateStyle: 'medium' })}
            </p>
            <p className="text-xs text-muted-foreground">Horaires locaux · {plan.timezone}</p>
          </div>
          {total > pageSize && (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Dates précédentes"
                disabled={page === 0}
                onClick={() => setState({ page: page - 1 })}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Dates suivantes"
                disabled={first + pageSize >= total}
                onClick={() => setState({ page: page + 1 })}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </header>
        <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {dates.map((date) => {
            const planned = byDate.get(date);
            const count = planned
              ? plan.items.filter((item) => item.trip_day_id === planned.id).length
              : 0;
            return (
              <li key={date}>
                <button
                  type="button"
                  aria-pressed={selected === date}
                  onClick={() => setState({ page, date })}
                  aria-label={`${tripDateLabel(date)} · ${count} étape(s)`}
                  className={cn(
                    'grid min-h-16 w-full justify-items-center gap-0.5 rounded-lg border border-border p-1.5 text-center hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
                    selected === date && 'border-primary bg-accent text-primary-ink',
                  )}
                >
                  <span className="text-xs text-muted-foreground">{dayMarker(date)}</span>
                  <time dateTime={date} className="text-base font-extrabold tabular-nums">
                    {Number(date.slice(-2))}
                  </time>
                  <span className="text-[11px] text-muted-foreground">
                    {count ? `${count} étape(s)` : '–'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CalendarDays className="size-5 text-primary-ink" aria-hidden="true" />
            {day ? dayLabel(day, plan.days) : tripDateLabel(selected)}
          </h2>
          {canEdit &&
            (day ? (
              <AddPlaceDialog
                guildId={guild}
                trip={plan}
                initialDay={day.id}
                categories={categories}
              />
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void mutate({ operation: 'add_day', data: { date: selected, title: '' } })
                }
              >
                Créer cette journée
              </Button>
            ))}
        </div>
        {conflicts.size > 0 && <Alert>Des horaires se chevauchent dans cette journée.</Alert>}
        {items.length ? (
          <ol className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: item.entry?.category?.color ?? 'var(--color-primary)',
                    }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    {item.entry ? (
                      <Link
                        href={entryHref(guild, item.entry)}
                        className="break-words text-sm font-bold hover:underline"
                      >
                        {item.entry.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-semibold text-muted-foreground">
                        Fiche indisponible
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {item.entry?.category?.name}
                      {conflicts.has(item.id) && ' · En conflit'}
                    </p>
                  </div>
                </div>
                <p className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <Clock3 className="size-3.5" aria-hidden="true" />
                  {stepTime(item) || 'Heure libre'}
                </p>
                {canEdit && (
                  <TripStepDialog guild={guild} plan={plan} item={item} mutate={mutate} canEdit>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Modifier l’horaire de ${item.entry?.title ?? 'l’étape'}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TripStepDialog>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">Aucune étape planifiée ce jour-là.</p>
        )}
      </Card>
    </div>
  );
}
