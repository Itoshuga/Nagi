import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { uuidSchema } from '@nagi/shared';
import { requireGuild, spaceServices } from '@/features/spaces/server';
import { TripSettingsForm, TripDeleteForm, TripOrganizers } from '@/features/trips/settings-form';
import { tripTimezones } from '@/features/trips/timezones';
import { removeTrip, saveTripSettings } from '@/features/trips/actions';
import { publicCatalogDatabase } from '@/lib/supabase/server';

export const metadata = { title: 'Paramètres du voyage' };
export default async function EditTripSettings({
  params,
}: {
  params: Promise<{ guildId: string; tripId: string }>;
}) {
  const { guildId, tripId } = await params;
  if (!uuidSchema.safeParse(tripId).success) notFound();
  await requireGuild(guildId);
  const { db, trips } = await spaceServices();
  const [trip, permission] = await Promise.all([
    trips.get(guildId, tripId),
    db.rpc('is_trip_organizer', { p_trip_id: tripId }),
  ]);
  if (!trip || !permission.data) notFound();
  const [organizers, destination] = await Promise.all([
    trips.organizerCards(tripId),
    trip.destination_country_id
      ? publicCatalogDatabase()
          .from('countries')
          .select('id,name,iso_code')
          .eq('id', trip.destination_country_id)
          .maybeSingle()
      : null,
  ]);
  if (destination?.error) throw destination.error;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/app/${guildId}/trips/${tripId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Retour à l’itinéraire
      </Link>
      <header>
        <h1 className="space-title">Paramètres du voyage</h1>
        <p className="mt-2 text-sm text-muted-foreground">{trip.title}</p>
      </header>
      <TripSettingsForm
        guild={guildId}
        timezones={tripTimezones}
        trip={trip}
        destination={
          destination?.data ??
          (trip.destination_country_id
            ? { id: trip.destination_country_id, name: 'Destination indisponible' }
            : undefined)
        }
        run={saveTripSettings.bind(null, guildId, tripId)}
      />
      <TripOrganizers guild={guildId} trip={trip} organizers={organizers} />
      <TripDeleteForm version={trip.version} run={removeTrip.bind(null, guildId, tripId)} />
    </div>
  );
}
