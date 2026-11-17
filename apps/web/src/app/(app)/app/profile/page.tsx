import { Badge, Card } from '@nagi/ui';
import Image from 'next/image';
import { requireViewer } from '@/features/auth/session';
export const metadata = { title: 'Mon profil' };
export default async function Profile() {
  const viewer = await requireViewer();
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-xs uppercase tracking-widest text-primary-ink">Compte personnel</p>
      <h1 className="space-title">Mon profil</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Votre identité est reliée à votre compte Discord.
      </p>
      <Card className="mt-9">
        {viewer.banner_url && (
          <Image
            src={viewer.banner_url}
            alt="Bannière Discord"
            width={700}
            height={240}
            className="mb-6 h-36 w-full rounded-2xl object-cover"
            unoptimized
          />
        )}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {viewer.avatar_url && (
              <Image
                src={viewer.avatar_url}
                alt=""
                width={56}
                height={56}
                className="rounded-full"
                unoptimized
              />
            )}
            <h2 className="text-xl font-extrabold">{viewer.display_name}</h2>
          </div>
          <Badge>{viewer.role}</Badge>
        </div>
        <dl className="mt-6 divide-y divide-border text-sm">
          {[
            ['Compte Discord', viewer.username],
            ['Identifiant Discord', viewer.discord_id],
            ['Inscription', date.format(new Date(viewer.created_at))],
            ['Dernière connexion', date.format(new Date(viewer.last_login_at))],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-2 py-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
