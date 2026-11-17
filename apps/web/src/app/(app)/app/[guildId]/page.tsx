import Link from 'next/link';
import { ArrowUpRight, BookOpen, History, Sparkles } from 'lucide-react';
import { Alert, Button } from '@nagi/ui';
import { requireGuild, spaceServices } from '@/features/spaces/server';
import { TripList } from '@/features/trips/trip-list';
import { CreateTripLink } from '@/features/trips/create-trip-dialog';
export const metadata = { title: 'Votre espace' };
export default async function GuildHome({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { guildId } = await params;
  const { guild, isAdmin, viewer } = await requireGuild(guildId);
  const { rows: trips } = await (await spaceServices()).trips.cards(guildId, { limit: 5 });
  const canCreate = isAdmin || guild.members_can_create_trips;
  const query = await searchParams;
  return (
    <>
      {query.notice === 'forbidden' && (
        <Alert className="mb-8">Cette action est réservée aux administrateurs de cet espace.</Alert>
      )}
      <div className="relative overflow-hidden rounded-[2rem] border border-[#d9e7f8] bg-[#ecf3fd] px-7 py-10 sm:px-10 sm:py-12">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 size-80 rounded-full border-[40px] border-white/45"
        />
        <div className="relative">
          <p className="space-eyebrow mb-5">L’espace de votre groupe</p>
          <h1 className="space-title max-w-3xl break-words">
            Bienvenue sur
            <br />
            {guild.name}
            <span className="text-primary">.</span>
          </h1>
          <p className="mt-5 text-sm leading-7 text-muted-foreground">
            Bonjour {viewer.display_name}. Organisez vos prochaines aventures ensemble.
          </p>
        </div>
      </div>
      <section className="mt-12" aria-labelledby="trips-heading">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="space-eyebrow mb-2">Les idées deviennent des projets</p>
            <h2 id="trips-heading" className="text-2xl font-extrabold tracking-tight">
              Vos voyages
            </h2>
          </div>
          <div className="flex gap-2">
            {trips.length > 0 && canCreate && <CreateTripLink guildId={guildId} />}
            <Button asChild variant="ghost" size="sm">
              <Link href={`/app/${guildId}/trips`}>
                Tout voir
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
        <TripList trips={trips} guildId={guildId} canCreate={canCreate} />
      </section>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="space-panel p-7 sm:p-8">
          <div className="flex items-center gap-3 text-primary-ink">
            <BookOpen className="size-5" />
            <span className="space-eyebrow">Le catalogue Nagi</span>
          </div>
          <h2 className="mt-6 text-2xl font-extrabold tracking-tight">Une idée pour la suite ?</h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">
            Pays, villes et bonnes adresses : découvrez les lieux référencés par l’équipe Nagi et
            laissez venir l’inspiration.
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href={`/app/${guildId}/discover`}>
              Découvrir
              <Sparkles className="size-4" />
            </Link>
          </Button>
        </section>
        <section className="space-panel p-7 sm:p-8">
          <History className="size-5 text-muted-foreground" />
          <h2 className="mt-6 text-lg font-extrabold">L’aventure s’écrit à plusieurs.</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            L’activité de votre groupe trouvera bientôt sa place ici. Pour commencer, créez votre
            premier voyage ensemble.
          </p>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Activité collaborative · à venir
          </p>
        </section>
      </div>
    </>
  );
}
