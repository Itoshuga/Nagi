import { requireGuild, spaceServices } from '@/features/spaces/server';
import { CreateTripDialog } from '@/features/trips/create-trip-dialog';
import { TripList } from '@/features/trips/trip-list';
export const metadata = { title: 'Voyages' };
export default async function Trips({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild, isAdmin } = await requireGuild(guildId);
  const trips = await (await spaceServices()).trips.list(guildId);
  const canCreate = isAdmin || guild.members_can_create_trips;
  return (
    <>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="space-eyebrow mb-4">{guild.name}</p>
          <h1 className="space-title">
            Les voyages du groupe<span className="text-primary">.</span>
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            De la première envie aux souvenirs partagés.
          </p>
        </div>
        {trips.length > 0 && canCreate && <CreateTripDialog guildId={guildId} />}
      </div>
      <TripList trips={trips} guildId={guildId} canCreate={canCreate} />
    </>
  );
}
