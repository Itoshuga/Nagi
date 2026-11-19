import Link from 'next/link';
import { ArrowUpRight, Users } from 'lucide-react';
import { Alert, Button } from '@nagi/ui';
import { requireGuild } from '@/features/spaces/server';
import { GuildAvatar } from '@/features/spaces/guild-avatar';
import { SettingsForm } from '@/features/spaces/settings-form';
import { DefaultSpaceShortcut } from '@/features/settings/forms';
import { SettingsSection } from '@/features/settings/section';
import { SettingsWorkspace } from '@/features/settings/workspace';

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
    <SettingsWorkspace
      title="Paramètres de l’espace"
      description="Les règles de votre groupe et les repères pour préparer vos voyages ensemble."
      back={{ href: `/app/${guildId}`, label: 'Retour à l’espace' }}
      badge={isAdmin ? 'Administrateur Discord' : 'Membre'}
      identity={
        <>
          <span className="settings-avatar">
            <GuildAvatar guild={guild} />
          </span>
          <div>
            <strong>{guild.name}</strong>
            <span>Espace Discord</span>
          </div>
        </>
      }
      notice={
        query.saved && (
          <Alert className="settings-notice" role="status">
            {query.saved === 'default'
              ? 'Votre espace par défaut a été enregistré.'
              : 'Les permissions de l’espace ont été enregistrées.'}
          </Alert>
        )
      }
      tabs={[
        {
          id: 'space-general',
          label: 'Général',
          description: 'Votre espace Discord',
          icon: 'general',
          content: (
            <SettingsSection
              title="Votre groupe, vos voyages"
              description="Un espace partagé avec les membres de votre serveur Discord."
            >
              <div className="settings-identity">
                <span className="settings-avatar">
                  <GuildAvatar guild={guild} />
                </span>
                <div>
                  <strong>{guild.name}</strong>
                  <p>Votre espace de voyage sur Nagi</p>
                </div>
              </div>
              <dl className="settings-details">
                <div>
                  <dt>Votre rôle dans l’espace</dt>
                  <dd>{isAdmin ? 'Administrateur Discord' : 'Membre'}</dd>
                </div>
                <div>
                  <dt>Accès à l’espace</dt>
                  <dd>Membres du serveur Discord</dd>
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
              <p className="settings-note">
                <Users className="size-4" aria-hidden="true" />
                <span>
                  Les accès suivent les membres de votre serveur Discord. Les voyages restent
                  partagés avec votre groupe.
                </span>
              </p>
              <div className="settings-divider">
                <h3 className="text-[13px] font-bold">Préparer ensemble</h3>
                <p className="settings-help">
                  Les permissions de chaque voyage se règlent depuis ses paramètres. Le catalogue
                  mondial est commun à tous les espaces.
                </p>
                <Button asChild variant="secondary" size="sm" className="mt-4">
                  <Link href={`/app/${guildId}/trips`}>
                    Voir les voyages
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </SettingsSection>
          ),
        },
        {
          id: 'space-permissions',
          label: 'Permissions',
          description: 'Création des voyages',
          icon: 'security',
          content: (
            <SettingsForm
              key={String(guild.members_can_create_trips)}
              guildId={guildId}
              membersCanCreate={guild.members_can_create_trips}
              canManage={isAdmin}
            />
          ),
        },
        {
          id: 'space-preferences',
          label: 'Préférences',
          description: 'Votre point de départ',
          icon: 'preferences',
          content: (
            <DefaultSpaceShortcut
              key={preferences?.default_guild_id ?? 'none'}
              space={guild}
              selected={preferences?.default_guild_id ?? null}
            >
              <div className="settings-divider">
                <p className="settings-copy">
                  Pour choisir un autre espace par défaut, retrouvez les préférences de votre
                  compte.
                </p>
                <Button asChild variant="secondary" size="sm" className="mt-4">
                  <Link href="/app/settings#account-preferences">
                    Paramètres du compte
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </DefaultSpaceShortcut>
          ),
        },
      ]}
    />
  );
}
