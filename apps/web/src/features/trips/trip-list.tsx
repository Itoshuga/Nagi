import Link from 'next/link';
import { ArrowUpRight, CalendarDays, MapPinned, Plus } from 'lucide-react';
import { Badge } from '@nagi/ui';
import type { Trip } from '@nagi/database';
import { CreateTripDialog } from './create-trip-dialog';
export function tripDates(trip: Pick<Trip, 'start_date' | 'end_date'>) {
  const format = (value: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T12:00:00Z`));
  return trip.start_date && trip.end_date
    ? `${format(trip.start_date)} — ${format(trip.end_date)}`
    : trip.start_date
      ? `À partir du ${format(trip.start_date)}`
      : trip.end_date
        ? `Jusqu’au ${format(trip.end_date)}`
        : 'Dates à imaginer ensemble';
}
export const tripStatus = {
  planned: 'En préparation',
  ongoing: 'En cours',
  completed: 'Terminé',
  cancelled: 'Annulé',
};
export function TripList({
  trips,
  guildId,
  canCreate,
}: {
  trips: Trip[];
  guildId: string;
  canCreate: boolean;
}) {
  if (!trips.length)
    return (
      <div className="space-panel flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
        <span className="mb-6 flex size-16 items-center justify-center rounded-[1.4rem] bg-accent text-primary-ink">
          <MapPinned className="size-7" strokeWidth={1.5} />
        </span>
        <h3 className="text-xl font-extrabold tracking-tight">
          Votre prochaine aventure commence ici.
        </h3>
        <p className="mb-7 mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
          Aucun voyage n’a encore été organisé sur ce serveur.
        </p>
        {canCreate ? (
          <CreateTripDialog guildId={guildId} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Un administrateur de cet espace peut créer le premier voyage.
          </p>
        )}
      </div>
    );
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((trip) => (
        <Link
          key={trip.id}
          href={`/app/${guildId}/trips/${trip.id}`}
          className="space-panel trip-tile group flex min-h-60 flex-col p-6"
        >
          <div className="mb-8 flex items-center justify-between">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary-ink">
              <MapPinned className="size-5" />
            </span>
            <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary-ink" />
          </div>
          <Badge className="mb-3 w-fit text-[10px]">{tripStatus[trip.status]}</Badge>
          <h3 className="break-words text-xl font-extrabold tracking-tight">{trip.title}</h3>
          {trip.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {trip.description}
            </p>
          )}
          <p className="mt-auto flex items-center gap-2 pt-7 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" />
            {tripDates(trip)}
          </p>
        </Link>
      ))}
      {canCreate && (
        <div className="flex min-h-60 flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-border p-6">
          <Plus className="size-6 text-primary-ink" strokeWidth={1.5} />
          <CreateTripDialog guildId={guildId} />
        </div>
      )}
    </div>
  );
}
