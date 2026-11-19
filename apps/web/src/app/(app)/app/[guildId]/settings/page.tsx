import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Compass, ShieldCheck, UsersRound } from 'lucide-react';
import { Alert, Button } from '@nagi/ui';
import { requireGuild } from '@/features/spaces/server';
import { GuildAvatar } from '@/features/spaces/guild-avatar';
import { SettingsForm } from '@/features/spaces/settings-form';
import { DefaultSpaceForm } from '@/features/settings/forms';
import { SettingsSection } from '@/features/settings/section';
import '@/features/settings/settings.css';

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
  return (
    <div className="settings-page">
      <Link
        href={`/app/${guildId}`}
        className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Retour à l’espace
      </Link>
      <header className="settings-heading">
        <div>
          <h1>Paramètres de l’espace</h1>
          <p>Les règles de votre groupe et votre façon de le retrouver.</p>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <GuildAvatar guild={guild} />
          <span className="max-w-64 truncate text-sm font-semibold">{guild.name}</span>
        </div>
      </header>
      {query.saved && (
        <Alert className="mb-6" role="status">
          {query.saved === 'default'
            ? 'Votre espace par défaut a été enregistré.'
            : 'Les permissions de l’espace ont été enregistrées.'}
        </Alert>
      )}
      <div className="settings-grid">
        <div className="settings-stack">
          <SettingsSection
            title="Création des voyages"
            description={
              isAdmin
                ? 'Ces règles s’appliquent à tous les membres de cet espace.'
                : 'Les administrateurs Discord de cet espace gèrent ces règles.'
            }
            icon={ShieldCheck}
          >
            {isAdmin ? (
              <SettingsForm
                key={String(guild.members_can_create_trips)}
                guildId={guildId}
                membersCanCreate={guild.members_can_create_trips}
              />
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  {guild.members_can_create_trips
                    ? 'Tous les membres peuvent créer des voyages'
                    : 'Création réservée aux administrateurs Discord'}
                </p>
                <p className="settings-note">
                  Vous pouvez consulter les voyages de votre groupe et participer selon les
                  permissions définies pour chaque voyage.
                </p>
              </div>
            )}
          </SettingsSection>
          <SettingsSection
            title="Les membres de cet espace"
            description="Les accès suivent les membres de votre serveur Discord."
            icon={UsersRound}
          >
            <dl className="settings-details">
              <div>
                <dt>Votre rôle dans l’espace</dt>
                <dd>{isAdmin ? 'Administrateur Discord' : 'Membre'}</dd>
              </div>
              <div>
                <dt>Organisation d’un voyage</dt>
                <dd>Selon ses organisateurs</dd>
              </div>
              <div>
                <dt>Catalogue mondial</dt>
                <dd>Équipe Nagi</dd>
              </div>
            </dl>
            <p className="settings-note mt-4">
              Les permissions d’un voyage se règlent depuis son itinéraire. Le catalogue est partagé
              entre les espaces.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-5">
              <Link href={`/app/${guildId}/trips`}>
                Voir les voyages
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </SettingsSection>
        </div>
        <aside className="settings-stack">
          <SettingsSection
            title="Ouvrir cet espace par défaut"
            description="Ce choix est personnel et s’applique à votre compte."
            icon={Compass}
          >
            <DefaultSpaceForm
              spaces={[guild]}
              selected={preferences?.default_guild_id === guildId ? guildId : null}
            />
            <Link
              href="/app/settings"
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-ink hover:underline"
            >
              Paramètres du compte
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </SettingsSection>
        </aside>
      </div>
    </div>
  );
}
