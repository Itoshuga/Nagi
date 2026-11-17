import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { uuidSchema, tripAuthorSchema } from '@nagi/shared';
import { ArrowLeft, CalendarDays, MapPin, UsersRound } from 'lucide-react';
import { Badge } from '@nagi/ui';
import { requireGuild, spaceServices } from '@/features/spaces/server';
import { AddPlaceDialog } from '@/features/trips/add-place-dialog';
import { tripDates, tripStatus } from '@/features/trips/trip-list';
export const metadata = { title: 'Voyage' };
export default async function TripPage({
  params,
}: {
  params: Promise<{ guildId: string; tripId: string }>;
}) {
  const { guildId, tripId } = await params;
  const { guild } = await requireGuild(guildId);
  if (!uuidSchema.safeParse(tripId).success) notFound();
  const { trips } = await spaceServices();
  const trip = await trips.get(guildId, tripId);
  if (!trip) notFound();
  const [rawAuthor, items] = await Promise.all([trips.author(tripId), trips.items(tripId)]);
  const author = tripAuthorSchema.parse(rawAuthor);
  return (
    <>
      <Link
        href={`/app/${guildId}/trips`}
        className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Tous les voyages
      </Link>
      <div className="space-panel p-7 sm:p-10">
        <Badge>{tripStatus[trip.status]}</Badge>
        <h1 className="space-title mt-5 max-w-4xl break-words">{trip.title}</h1>
        {trip.description && (
          <p className="mt-5 max-w-2xl whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
            {trip.description}
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 border-t border-border pt-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4" />
            {tripDates(trip)}
          </span>
          <span className="flex items-center gap-2">
            <UsersRound className="size-4" />
            {guild.name}
          </span>
          <span className="flex items-center gap-2">
            {author?.avatar_url && (
              <Image
                src={author.avatar_url}
                alt=""
                width={24}
                height={24}
                className="rounded-full"
                unoptimized
              />
            )}
            Créé par {author?.display_name ?? 'un ancien membre'}
          </span>
        </div>
      </div>
      <section className="mt-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-extrabold tracking-tight">Les lieux de votre voyage</h2>
          <AddPlaceDialog guildId={guildId} />
        </div>
        {items.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <article className="space-panel p-6" key={item.id}>
                <h3 className="font-extrabold">{item.entries?.title ?? 'Lieu indisponible'}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {item.notes || item.entries?.description}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-60 flex-col items-center justify-center rounded-3xl border border-dashed border-border p-8 text-center">
            <MapPin className="mb-5 size-7 text-primary-ink" strokeWidth={1.5} />
            <h3 className="text-lg font-extrabold">Tout un itinéraire à imaginer.</h3>
            <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">
              Les lieux sélectionnés dans le catalogue Nagi apparaîtront ici. La composition de
              votre itinéraire arrive prochainement.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
