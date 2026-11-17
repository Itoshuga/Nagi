import { Star, ShieldCheck } from 'lucide-react';
import { Alert, Button } from '@nagi/ui';
import { requireGuild } from '@/features/spaces/server';
import { setDefaultGuild } from '@/features/spaces/actions';
import { SettingsForm } from '@/features/spaces/settings-form';
export const metadata = { title: 'Paramètres de l’espace' };
export default async function Settings({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { guildId } = await params;
  const { guild, isAdmin, preferences } = await requireGuild(guildId);
  const query = await searchParams;
  const favorite = preferences?.default_guild_id === guildId;
  return (
    <div className="max-w-3xl">
      <p className="space-eyebrow mb-4">{guild.name}</p>
      <h1 className="space-title">
        À votre façon<span className="text-primary">.</span>
      </h1>
      <p className="mb-9 mt-4 text-sm text-muted-foreground">
        Vos préférences et les règles de cet espace.
      </p>
      {query.saved && (
        <Alert className="mb-6">
          {query.saved === 'default'
            ? 'Votre serveur par défaut a été enregistré.'
            : 'Les paramètres ont été enregistrés.'}
        </Alert>
      )}
      <section className="space-panel p-7">
        <Star className="size-5 text-primary-ink" />
        <h2 className="mb-3 mt-4 text-lg font-extrabold">Votre point de départ</h2>
        <p className="mb-6 text-sm leading-7 text-muted-foreground">
          {favorite
            ? 'Cet espace s’ouvrira automatiquement lors de votre prochaine connexion.'
            : 'Ouvrez directement cet espace après votre connexion. Vous pourrez toujours changer de serveur.'}
        </p>
        <form action={setDefaultGuild}>
          <input type="hidden" name="guildId" value={guildId} />
          <Button variant="secondary" disabled={favorite}>
            {favorite ? 'Votre serveur par défaut' : 'Définir comme serveur par défaut'}
          </Button>
        </form>
      </section>
      <section className="space-panel mt-6 p-7">
        <ShieldCheck className="size-5 text-primary-ink" />
        <h2 className="mb-5 mt-4 text-lg font-extrabold">Permissions de l’espace</h2>
        {isAdmin ? (
          <SettingsForm
            key={String(guild.members_can_create_trips)}
            guildId={guildId}
            membersCanCreate={guild.members_can_create_trips}
          />
        ) : (
          <p className="text-sm leading-7 text-muted-foreground">
            Les administrateurs de votre serveur Discord gèrent ces paramètres.{' '}
            {guild.members_can_create_trips
              ? 'Les membres peuvent actuellement créer des voyages.'
              : 'La création de voyages est réservée aux administrateurs.'}
          </p>
        )}
        <p className="mt-6 border-t border-border pt-5 text-xs leading-6 text-muted-foreground">
          Les permissions Discord s’appliquent uniquement à cet espace. Le catalogue mondial est
          administré séparément par l’équipe Nagi.
        </p>
      </section>
    </div>
  );
}
