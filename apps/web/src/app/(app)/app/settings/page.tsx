import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  Cable,
  Compass,
  LogOut,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Button } from '@nagi/ui';
import { profileHref } from '@nagi/shared';
import { requireViewer } from '@/features/auth/session';
import { signIn, signOut } from '@/features/auth/actions';
import { discoverSpaces } from '@/features/spaces/server';
import { DefaultSpaceForm, DeleteAccountButton, SessionControls } from '@/features/settings/forms';
import { SettingsSection } from '@/features/settings/section';
import { serviceDatabase } from '@/lib/supabase/server';
import '@/features/settings/settings.css';

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
  return (
    <div className="settings-page">
      <header className="settings-heading">
        <div>
          <h1>Paramètres du compte</h1>
          <p>Votre identité, vos connexions et les préférences de votre espace personnel.</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={profileHref(viewer.username)}>
            <UserRound className="size-4" aria-hidden="true" />
            Mon profil
          </Link>
        </Button>
      </header>
      <div className="settings-grid">
        <div className="settings-stack">
          <SettingsSection
            title="Votre compte"
            description="Votre identité est synchronisée avec Discord."
            icon={UserRound}
          >
            <div className="settings-identity">
              {viewer.avatar_url && (
                <Image src={viewer.avatar_url} alt="" width={56} height={56} unoptimized />
              )}
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
          </SettingsSection>
          <SettingsSection
            title="Connexion et sécurité"
            description="Gardez le contrôle des appareils connectés à Nagi."
            icon={ShieldCheck}
          >
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Cable className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden="true" />
                <p className="settings-note">
                  La connexion à votre compte passe par Discord. Reconnectez-le pour actualiser
                  votre identité et vos accès aux serveurs.
                </p>
              </div>
              <form action={signIn}>
                <input type="hidden" name="next" value="/app/settings" />
                <Button type="submit" variant="secondary" size="sm">
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                  Reconnecter Discord
                </Button>
              </form>
            </div>
            <div className="settings-divider">
              <p className="settings-note mb-4">
                Fermez les sessions ouvertes sur vos autres appareils. Votre session actuelle reste
                active.
              </p>
              <SessionControls />
            </div>
            <div className="settings-divider">
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm">
                  <LogOut className="size-4" aria-hidden="true" />
                  Déconnecter cet appareil
                </Button>
              </form>
            </div>
          </SettingsSection>
          <SettingsSection
            title="Supprimer le compte"
            description="La suppression de votre compte Nagi est définitive."
            icon={Trash2}
            danger
          >
            <p className="settings-note mb-5">
              Votre profil et vos préférences seront effacés. Les voyages et les contributions
              partagés seront conservés pour votre groupe.
            </p>
            <DeleteAccountButton available={canDelete} userId={viewer.id} />
            {!canDelete && (
              <p className="settings-note mt-3" role="status">
                La suppression du compte est momentanément indisponible.
              </p>
            )}
          </SettingsSection>
        </div>
        <aside className="settings-stack">
          <SettingsSection
            title="Votre point de départ"
            description="Retrouvez votre espace préféré dès la connexion."
            icon={Compass}
          >
            {spaces?.guilds.length ? (
              <DefaultSpaceForm
                spaces={spaces.guilds}
                selected={spaces.preferences?.default_guild_id ?? null}
              />
            ) : (
              <p className="settings-note">
                {spaces
                  ? 'Choisissez un serveur Discord où Nagi est présent pour définir votre espace par défaut.'
                  : 'Vos espaces sont momentanément indisponibles. Vous pouvez reconnecter Discord puis réessayer.'}
              </p>
            )}
            <Link
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-ink hover:underline"
              href="/select-server"
            >
              Tous mes espaces
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </SettingsSection>
          <SettingsSection
            title="Un profil à votre image"
            description="Bannière, biographie, couleur et destination de rêve."
            icon={Sparkles}
          >
            <p className="settings-note mb-5">
              Votre profil rassemble ce que vous souhaitez partager avec les membres de vos espaces
              Discord.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link href={profileHref(viewer.username)}>
                Personnaliser mon profil
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </SettingsSection>
        </aside>
      </div>
    </div>
  );
}
