import { notFound, redirect } from 'next/navigation';
import { Badge, Card, EmptyState } from '@nagi/ui';
import { destinationKindSchema } from '@nagi/shared';
import { requireAdmin } from '@/features/auth/session';
import { sectionInfo } from '@/features/admin/navigation';
import { BotPanel } from '@/features/admin/bot-panel';
import { AdminCategories } from '@/features/categories/pages';
import { AdminEntries } from '@/features/entries/admin';
import { RelationTypeAdmin } from '@/features/relations/admin';
import { listRelationTypeStats } from '@nagi/database';
import { AdminDestinationList } from '@/features/geography/admin-list';
import type { SearchParams } from '@/features/geography/model';
import { sessionDatabase } from '@/lib/supabase/server';
export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return { title: sectionInfo[section]?.title ?? 'Administration' };
}
export default async function AdminSection({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const viewer = await requireAdmin();
  const { section } = await params;
  if (section === 'relation-types') redirect('/admin/relations');
  const destination = destinationKindSchema.safeParse(section);
  if (destination.success)
    return <AdminDestinationList kind={destination.data} params={await searchParams} />;
  const info = sectionInfo[section];
  if (!info) notFound();
  let content: React.ReactNode;
  if (section === 'bot' || section === 'commands')
    content = <BotPanel commandsOnly={section === 'commands'} />;
  else if (section === 'settings')
    content = (
      <Card className="mt-8 max-w-2xl">
        <h2 className="text-base font-medium">Votre environnement</h2>
        <dl className="mt-6 space-y-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Connexion</dt>
            <dd>Discord OAuth</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Votre rôle</dt>
            <dd>
              <Badge>{viewer.role}</Badge>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Langue</dt>
            <dd>Français</dd>
          </div>
        </dl>
        <p className="mt-7 border-t border-border pt-5 text-xs leading-6 text-muted-foreground">
          Les paramètres de connexion et les propriétaires sont configurés sur le serveur. Ils ne
          sont pas modifiables depuis le navigateur.
        </p>
      </Card>
    );
  else if (section === 'users') {
    const db = await sessionDatabase();
    const { data, error } = await db
      .from('profiles')
      .select('id,display_name,username,role,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error('Impossible de charger les utilisateurs.');
    content = (
      <div className="mt-8">
        {data.length ? (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-normal">Compte Discord</th>
                  <th className="px-6 py-4 font-normal">Rôle</th>
                  <th className="px-6 py-4 font-normal">Inscription</th>
                </tr>
              </thead>
              <tbody>
                {data.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-5">
                      {user.display_name}
                      <p className="mt-1 text-xs text-muted-foreground">{user.username}</p>
                    </td>
                    <td className="px-6 py-5">
                      <Badge>{user.role}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-6 py-5 text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(
                        new Date(user.created_at),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState
            title="Aucun compte pour le moment."
            description="Les comptes sont créés lors de la première connexion avec Discord."
          />
        )}
      </div>
    );
  } else if (section === 'categories') content = <AdminCategories />;
  else if (section === 'entries') content = <AdminEntries params={await searchParams} />;
  else if (section === 'relations')
    content = <RelationTypeAdmin types={await listRelationTypeStats(await sessionDatabase())} />;
  return (
    <>
      <p className="mb-3 text-[10px] uppercase tracking-[.2em] text-primary-ink">Administration</p>
      <h1 className="display-title font-display">{info.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{info.description}</p>
      {content}
    </>
  );
}
