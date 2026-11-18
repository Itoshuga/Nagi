import Link from 'next/link';
import { Card, Button } from '@nagi/ui';
import { profileHref } from '@nagi/shared';
import { requireViewer } from '@/features/auth/session';
export const metadata = { title: 'Paramètres du compte', robots: { index: false, follow: false } };
export default async function AccountSettings() {
  const viewer = await requireViewer();
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
  return (
    <div className="mx-auto max-w-2xl py-4">
      <p className="mb-4 text-xs uppercase tracking-widest text-primary-ink">Compte personnel</p>
      <h1 className="text-3xl font-extrabold tracking-tight">Paramètres du compte</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Votre identité est synchronisée avec Discord. Vos personnalisations Nagi se modifient
        directement sur votre profil.
      </p>
      <Card className="my-8">
        <dl className="divide-y divide-border text-sm">
          {[
            ['Compte Discord', `@${viewer.username}`],
            ['Identifiant Discord', viewer.discord_id],
            ['Inscription sur Nagi', date.format(new Date(viewer.created_at))],
            ['Dernière connexion', date.format(new Date(viewer.last_login_at))],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-3 py-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Button asChild variant="secondary">
        <Link href={profileHref(viewer.username)}>Voir mon profil</Link>
      </Button>
    </div>
  );
}
