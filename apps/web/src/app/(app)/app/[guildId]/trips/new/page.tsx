import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { uuidSchema } from '@nagi/shared';
import { requireGuild } from '@/features/spaces/server';
import { TripSettingsForm } from '@/features/trips/settings-form';
import { tripTimezones } from '@/features/trips/timezones';
import { createPlannedTrip } from '@/features/trips/actions';
import { publicCatalogDatabase } from '@/lib/supabase/server';

export const metadata = { title: 'Créer un voyage' };
export default async function NewTrip({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ ajouter?: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId, 'create');
  const { ajouter } = await searchParams;
  const entry = uuidSchema.safeParse(ajouter);
  const place = entry.success
    ? await publicCatalogDatabase()
        .from('entries')
        .select('id,country:countries!entries_country_id_fkey(id,name,iso_code)')
        .eq('id', entry.data)
        .maybeSingle()
    : null;
  if (place?.error) throw place.error;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/app/${guildId}/trips`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Tous les voyages
      </Link>
      <h1 className="space-title">Créer un voyage</h1>
      <TripSettingsForm
        guild={guildId}
        timezones={tripTimezones}
        destination={place?.data?.country ?? undefined}
        run={createPlannedTrip.bind(null, guildId, place?.data?.id ?? null)}
      />
    </div>
  );
}
