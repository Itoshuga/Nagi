'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, MapPin, Route, Settings, UsersRound } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Alert, Badge, Button, LoadingState, cn, toast } from '@nagi/ui';
import type { TripPlan } from '@nagi/database';
import type { TripResult } from '@nagi/shared';
import { EntryImage } from '@/features/media/image';
import { UserIdentity } from '@/features/profiles/identity';
import { editTrip } from './actions';
import { AddPlaceDialog, type PlaceCard } from './add-place-dialog';
import { TripItinerary } from './itinerary';
import { useTripLive } from './live';
import { optimisticTripItems, type PlanMutation } from './planner-model';
import { tripDates, tripStatus } from './trip-list';

const TripMap = dynamic(() => import('./map'), { ssr: false, loading: () => <LoadingState /> });
const TripCalendar = dynamic(() => import('./calendar').then((module) => module.TripCalendar), {
  loading: () => <LoadingState />,
});
const tabs = [
  { id: 'itinerary', label: 'Itinéraire', icon: Route },
  { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
  { id: 'map', label: 'Carte', icon: MapPin },
] as const;

export function TripWorkbench({
  guild,
  plan,
  categories,
  canEdit,
  canManage,
  initialEntry,
}: {
  guild: string;
  plan: TripPlan;
  categories: { id: string; name: string }[];
  canEdit: boolean;
  canManage: boolean;
  initialEntry?: PlaceCard;
}) {
  const router = useRouter();
  const prefix = useId();
  const reduced = useReducedMotion();
  const [view, setView] = useState<(typeof tabs)[number]['id']>('itinerary');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<{ base: number; items: TripPlan['items'] }>();
  const inFlight = useRef(false);
  const displayed = optimistic?.base === plan.version ? { ...plan, items: optimistic.items } : plan;
  const destination = plan.destination?.is_published ? plan.destination : null;
  const cover = plan.cover_image_url ?? destination?.cover_image_url;
  const path = `/app/${guild}/trips`;
  useTripLive(guild, plan.id, plan.version);

  const mutate: PlanMutation = async (change, version = plan.version) => {
    if (inFlight.current) return { ok: false, error: 'Une modification est en cours.' };
    inFlight.current = true;
    setBusy(true);
    setError('');
    setOptimistic({ base: plan.version, items: optimisticTripItems(displayed.items, change) });
    try {
      const result = await editTrip(guild, plan.id, version, change);
      if (result.ok) {
        if (change.operation === 'move_item') toast.success('Étape déplacée.');
      } else {
        setOptimistic(undefined);
        setError(result.error);
        if (result.reason === 'conflict') router.refresh();
      }
      return result;
    } catch {
      setOptimistic(undefined);
      const result: TripResult = { ok: false, error: 'La modification a échoué. Réessayez.' };
      setError(result.error);
      return result;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <Link
        href={path}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Tous les voyages
      </Link>
      <header className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        {cover && (
          <EntryImage
            src={cover}
            className="aspect-[4/1] min-h-28 max-h-56"
            eager
            sizes="(max-width: 768px) 100vw, 1152px"
          />
        )}
        <div className="space-y-4 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge className="mb-3">{tripStatus[plan.status]}</Badge>
              <h1 className="space-title break-words">{plan.title}</h1>
            </div>
            {canManage && (
              <Button asChild size="sm" variant="secondary">
                <Link href={`${path}/${plan.id}/settings`}>
                  <Settings className="size-4" /> Paramètres
                </Link>
              </Button>
            )}
          </div>
          {plan.people.find((person) => person.id === plan.created_by) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Créé par</span>
              <UserIdentity
                compact
                user={plan.people.find((person) => person.id === plan.created_by)!}
              />
            </div>
          )}
          {plan.description && (
            <p className="max-w-3xl whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {plan.description}
            </p>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {destination && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-4" />
                {destination.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays aria-hidden="true" className="size-4" />
              {tripDates(plan)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UsersRound aria-hidden="true" className="size-4" />
              {plan.collaboration_mode === 'organizers_only'
                ? 'Modifiable par les organisateurs'
                : 'Modifiable par les membres'}
            </span>
          </div>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div role="tablist" aria-label="Vues du voyage" className="flex flex-wrap gap-1">
          {tabs.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              id={`${prefix}-${id}`}
              role="tab"
              type="button"
              tabIndex={view === id ? 0 : -1}
              aria-selected={view === id}
              aria-controls={`${prefix}-panel`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
                view === id && 'bg-accent text-primary-ink',
              )}
              onClick={() => setView(id)}
              onKeyDown={(event) => {
                const target =
                  event.key === 'ArrowRight'
                    ? tabs[(index + 1) % tabs.length]
                    : event.key === 'ArrowLeft'
                      ? tabs[(index + tabs.length - 1) % tabs.length]
                      : event.key === 'Home'
                        ? tabs[0]
                        : event.key === 'End'
                          ? tabs.at(-1)
                          : undefined;
                if (!target) return;
                event.preventDefault();
                setView(target.id);
                document.getElementById(`${prefix}-${target.id}`)?.focus();
              }}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {canEdit && (
          <AddPlaceDialog
            key={initialEntry?.id ?? 'catalog'}
            guildId={guild}
            trip={plan}
            entry={initialEntry}
            initialOpen={Boolean(initialEntry)}
            onDismiss={
              initialEntry
                ? () => router.replace(`${path}/${plan.id}`, { scroll: false })
                : undefined
            }
            categories={categories}
          />
        )}
      </div>
      {error && <Alert role="alert">{error}</Alert>}
      <motion.div
        key={view}
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.16 }}
        role="tabpanel"
        id={`${prefix}-panel`}
        aria-labelledby={`${prefix}-${view}`}
        className="min-w-0"
        aria-busy={busy}
      >
        {view === 'itinerary' && (
          <TripItinerary
            guild={guild}
            plan={displayed}
            canEdit={canEdit}
            busy={busy}
            mutate={mutate}
            categories={categories}
          />
        )}
        {view === 'calendar' && (
          <TripCalendar
            guild={guild}
            plan={displayed}
            canEdit={canEdit}
            canManage={canManage}
            busy={busy}
            mutate={mutate}
            categories={categories}
          />
        )}
        {view === 'map' && <TripMap guild={guild} plan={displayed} />}
      </motion.div>
    </div>
  );
}
