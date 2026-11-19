import { notFound } from 'next/navigation';
import { uuidSchema } from '@nagi/shared';
import { requireGuild, spaceServices } from '@/features/spaces/server';
import { TripSettingsForm } from '@/features/trips/settings-form';
import { tripTimezones } from '@/features/trips/timezones';
import { removeTrip, saveTripSettings } from '@/features/trips/actions';
import { publicCatalogDatabase } from '@/lib/supabase/server';
import { maxCoverSize } from '@/features/geography/storage';

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
          .select('id,name,iso_code,cover_image_url')
          .eq('id', trip.destination_country_id)
          .maybeSingle()
      : null,
  ]);
  if (destination?.error) throw destination.error;
  return (
    <TripSettingsForm
      guild={guildId}
      timezones={tripTimezones}
      trip={trip}
      organizers={organizers}
      maxCoverBytes={maxCoverSize()}
      destinationCover={destination?.data?.cover_image_url}
      destination={
        destination?.data ??
        (trip.destination_country_id
          ? { id: trip.destination_country_id, name: 'Destination indisponible' }
          : undefined)
      }
      run={saveTripSettings.bind(null, guildId, tripId)}
      remove={removeTrip.bind(null, guildId, tripId)}
    />
  );
}
