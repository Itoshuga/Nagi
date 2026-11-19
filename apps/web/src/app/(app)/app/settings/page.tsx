import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  Cable,
  Compass,
  LogOut,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Button } from '@nagi/ui';
import { profileHref } from '@nagi/shared';
import { requireViewer } from '@/features/auth/session';
import { signIn, signOut } from '@/features/auth/actions';
import { discoverSpaces } from '@/features/spaces/server';
import { DefaultSpaceForm, DeleteAccountButton, SessionControls } from '@/features/settings/forms';
import { SettingsSection } from '@/features/settings/section';
import { SettingsWorkspace } from '@/features/settings/workspace';
import { serviceDatabase } from '@/lib/supabase/server';

export const metadata = { title: 'Paramètres du compte', robots: { index: false, follow: false } };

export default async function AccountSettings() {
  const viewer = await requireViewer();
  const [context, deletion] = await Promise.allSettled([
    discoverSpaces(),
    serviceDatabase().rpc('account_deletion_ready'),
  ]);
  const spaces = context.status === 'fulfilled' ? context.value : null;
  const canDelete =
    deletion.status === 'fulfilled' && !deletion.value.error && deletion.value.data === true;
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
  const profile = profileHref(viewer.username);
  const avatar = viewer.avatar_url ? (
    <Image src={viewer.avatar_url} alt="" width={56} height={60} unoptimized />
  ) : (
    <span className="settings-avatar">
      <UserRound className="size-5" aria-hidden="true" />
    </span>
  );
  return (
    <SettingsWorkspace
      title="Paramètres du compte"
      description="Votre identité, vos connexions et les préférences qui vous ressemblent."
      back={{ href: profile, label: 'Retour au profil' }}
      badge="Compte personnel"
      identity={
        <>
          <span className="settings-avatar">
            {viewer.avatar_url ? (
              <Image src={viewer.avatar_url} alt="" width={44} height={48} unoptimized />
            ) : (
              <UserRound className="size-5" aria-hidden="true" />
            )}
          </span>
          <div>
            <strong>{viewer.display_name}</strong>
            <span>@{viewer.username}</span>
          </div>
        </>
      }
      sidebarAction={
        <>
          <DeleteAccountButton available={canDelete} userId={viewer.id} />
          {!canDelete && (
            <p className="settings-sidebar-help" role="status">
              La suppression du compte est momentanément indisponible.
            </p>
          )}
        </>
      }
      tabs={[
        {
          id: 'account-profile',
          label: 'Profil',
          description: 'Identité & personnalisation',
          icon: 'profile',
          content: (
            <SettingsSection
              title="Votre compte, à votre image"
              description="Votre identité Discord et les détails que vous partagez sur Nagi."
            >
              <div className="settings-identity">
                {avatar}
                <div>
                  <strong>{viewer.display_name}</strong>
                  <p>@{viewer.username}</p>
                </div>
              </div>
              <dl className="settings-details">
                <div>
                  <dt>Identifiant Discord</dt>
                  <dd>{viewer.discord_id}</dd>
                </div>
                <div>
                  <dt>Membre depuis le</dt>
                  <dd>{date.format(new Date(viewer.created_at))}</dd>
                </div>
                <div>
                  <dt>Dernière connexion</dt>
                  <dd>{date.format(new Date(viewer.last_login_at))}</dd>
                </div>
              </dl>
              <p className="settings-note">
                <Cable className="size-4" aria-hidden="true" />
                <span>
                  Votre nom et votre avatar sont synchronisés avec Discord. Vous pouvez actualiser
                  votre identité depuis l’onglet Connexion.
                </span>
              </p>
              <div className="settings-divider">
                <h3 className="text-[13px] font-bold">Un profil à votre image</h3>
                <p className="settings-help">
                  Bannière, biographie, couleur et destination de rêve. Retrouvez ces options sur
                  votre profil, avec les informations que vous souhaitez partager.
                </p>
                <Button asChild variant="secondary" size="sm" className="mt-4">
                  <Link href={profile}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    Personnaliser mon profil
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </SettingsSection>
          ),
        },
        {
          id: 'account-security',
          label: 'Connexion',
          description: 'Discord & appareils',
          icon: 'security',
          content: (
            <SettingsSection
              title="Gardez le contrôle"
              description="Votre connexion Discord et les appareils qui accèdent à votre compte."
            >
              <div>
                <h3 className="text-[13px] font-bold">Votre compte Discord</h3>
                <p className="settings-help">
                  Reconnectez Discord pour actualiser votre identité et vos accès aux serveurs.
                </p>
                <form action={signIn} className="mt-4">
                  <input type="hidden" name="next" value="/app/settings#account-security" />
                  <Button type="submit" variant="secondary" size="sm">
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                    Reconnecter Discord
                  </Button>
                </form>
              </div>
              <div className="settings-divider">
                <h3 className="text-[13px] font-bold">Vos autres appareils</h3>
                <p className="settings-help mb-4">
                  Fermez les sessions ouvertes ailleurs. Votre session actuelle reste active.
                </p>
                <SessionControls />
              </div>
              <div className="settings-divider">
                <h3 className="text-[13px] font-bold">Cet appareil</h3>
                <p className="settings-help mb-4">
                  Vous pourrez vous reconnecter à tout moment avec Discord.
                </p>
                <form action={signOut}>
                  <Button type="submit" variant="ghost" size="sm">
                    <LogOut className="size-4" aria-hidden="true" />
                    Déconnecter cet appareil
                  </Button>
                </form>
              </div>
              <p className="settings-note">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <span>
                  La connexion à Nagi passe par Discord. Le mot de passe et la double
                  authentification se gèrent depuis votre compte Discord.
                </span>
              </p>
            </SettingsSection>
          ),
        },
        {
          id: 'account-preferences',
          label: 'Préférences',
          description: 'Votre espace par défaut',
          icon: 'preferences',
          content: spaces?.guilds.length ? (
            <DefaultSpaceForm
              spaces={spaces.guilds}
              selected={spaces.preferences?.default_guild_id ?? null}
            >
              <p className="settings-note">
                <Compass className="size-4" aria-hidden="true" />
                <span>
                  Choisissez le serveur Discord que vous souhaitez retrouver en premier à
                  l’ouverture de Nagi.
                </span>
              </p>
              <div className="settings-section-actions">
                <Button asChild variant="secondary" size="sm">
                  <Link href="/select-server">
                    Tous mes espaces
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </DefaultSpaceForm>
          ) : (
            <SettingsSection
              title="Votre point de départ"
              description="Retrouvez votre espace préféré dès la connexion."
            >
              <p className="settings-copy">
                {spaces
                  ? 'Choisissez un serveur Discord où Nagi est présent pour définir votre espace par défaut.'
                  : 'Vos espaces sont momentanément indisponibles. Vous pouvez reconnecter Discord puis réessayer.'}
              </p>
              <div className="settings-section-actions">
                <Button asChild variant="secondary" size="sm">
                  <Link href="/select-server">
                    Tous mes espaces
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </SettingsSection>
          ),
        },
      ]}
    />
  );
}
