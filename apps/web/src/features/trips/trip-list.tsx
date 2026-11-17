import Link from 'next/link';
import { ArrowUpRight, CalendarDays, MapPin, Route } from 'lucide-react';
import { Badge, EmptyState } from '@nagi/ui';
import { relatedCount, type Trip, type TripCard } from '@nagi/database';
import { tripDateLabel } from '@nagi/shared';
import { EntryImage } from '@/features/media/image';
import { CreateTripLink } from './create-trip-dialog';

export function tripDates(trip: Pick<Trip, 'start_date' | 'end_date'>) {
  const format = (date: string) => tripDateLabel(date, { dateStyle: 'medium' });
  return trip.start_date && trip.end_date
    ? trip.start_date === trip.end_date
      ? format(trip.start_date)
      : `${format(trip.start_date)} – ${format(trip.end_date)}`
    : trip.start_date
      ? `À partir du ${format(trip.start_date)}`
      : trip.end_date
        ? `Jusqu’au ${format(trip.end_date)}`
        : 'Dates à définir';
}
export const tripStatus: Record<Trip['status'], string> = {
  draft: 'Brouillon',
  planned: 'Planifié',
  ongoing: 'En cours',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

export function TripList({
  trips,
  guildId,
  canCreate,
  filtered = false,
}: {
  trips: TripCard[];
  guildId: string;
  canCreate: boolean;
  filtered?: boolean;
}) {
  if (!trips.length)
    return (
      <EmptyState
        title={filtered ? 'Aucun voyage trouvé' : 'Votre prochaine aventure commence ici.'}
        description={
          filtered
            ? 'Modifiez la recherche ou changez de filtre.'
            : 'Choisissez votre destination et commencez à organiser votre premier voyage ensemble.'
        }
      >
        {canCreate && !filtered && <CreateTripLink guildId={guildId} />}
      </EmptyState>
    );
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((trip) => {
        const days = relatedCount(trip.days),
          places = relatedCount(trip.items);
        const destination = trip.destination?.is_published ? trip.destination : null;
        return (
          <li key={trip.id} className="min-w-0">
            <Link
              href={`/app/${guildId}/trips/${trip.id}`}
              className="group block h-full overflow-hidden rounded-3xl border border-border bg-card shadow-card transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
            >
              <div className="relative">
                <EntryImage
                  src={trip.cover_image_url ?? destination?.cover_image_url}
                  className="aspect-[16/9] [&>img]:transition-transform [&>img]:duration-500 group-hover:[&>img]:scale-105 motion-reduce:[&>img]:transform-none motion-reduce:[&>img]:transition-none"
                />
                <Badge className="absolute left-4 top-4 bg-card text-foreground shadow-sm">
                  {tripStatus[trip.status]}
                </Badge>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="break-words font-display text-xl font-extrabold">{trip.title}</h3>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-primary-ink"
                  />
                </div>
                {destination && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin aria-hidden="true" className="size-4 shrink-0" />
                    {destination.name}
                  </p>
                )}
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                  {tripDates(trip)}
                </p>
                <p className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <Route aria-hidden="true" className="size-4 shrink-0 text-primary-ink" />
                  {days} {days === 1 ? 'journée' : 'journées'} · {places}{' '}
                  {places === 1 ? 'étape' : 'étapes'}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
