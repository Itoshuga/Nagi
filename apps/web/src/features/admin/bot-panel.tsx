import { Alert, Badge, Card, EmptyState } from '@nagi/ui';
import { getBotRuntime } from '@nagi/database';
import { botPresence, commandScope } from '@nagi/shared';
import { sessionDatabase } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { SyncButton } from './sync-button';
import { RefreshStatus } from './refresh-status';
const formatDate = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Paris',
      }).format(new Date(value))
    : 'Jamais';
export async function BotPanel({ commandsOnly = false }: { commandsOnly?: boolean }) {
  const db = await sessionDatabase();
  const env = serverEnv();
  const scope = commandScope(env);
  const runtime = await getBotRuntime(db, env.DISCORD_APPLICATION_ID, scope);
  const { data: requests, error } = await db
    .from('bot_sync_requests')
    .select('id,status,created_at,attempts')
    .eq('application_id', env.DISCORD_APPLICATION_ID)
    .eq('scope', scope)
    .order('created_at', { ascending: false })
    .limit(8);
  if (error) throw new Error('Impossible de charger les demandes Discord.');
  const presence = botPresence(runtime?.heartbeat_at ?? null, runtime?.connected ?? false);
  const presenceLabel = {
    online: 'En ligne',
    offline: 'Hors ligne',
    unavailable: 'Potentiellement indisponible',
  }[presence];
  const commands = Array.isArray(runtime?.commands)
    ? runtime.commands.filter(
        (value): value is { [key: string]: import('@nagi/database').Json | undefined } =>
          value !== null && typeof value === 'object' && !Array.isArray(value),
      )
    : [];
  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <RefreshStatus />
        <SyncButton />
      </div>
      {!commandsOnly && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-medium">Connexion Discord</h2>
            <Badge className={presence === 'online' ? 'bg-accent text-primary-ink' : ''}>
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${presence === 'online' ? 'bg-primary' : 'bg-muted-foreground'}`}
              />
              {presenceLabel}
            </Badge>
          </div>
          <dl className="mt-7 grid gap-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Dernier heartbeat</dt>
              <dd className="mt-2">{formatDate(runtime?.heartbeat_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Dernière synchronisation réussie</dt>
              <dd className="mt-2">{formatDate(runtime?.last_sync_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Commandes actives</dt>
              <dd className="mt-2">
                {runtime?.last_sync_at ? runtime.command_count : 'Pas encore synchronisées'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Déploiement</dt>
              <dd className="mt-2">{scope === 'global' ? 'Global' : 'Serveur de développement'}</dd>
            </div>
          </dl>
          {runtime?.sync_error && <Alert className="mt-7">{runtime.sync_error}</Alert>}
        </Card>
      )}
      {commandsOnly &&
        (commands.length ? (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-normal">Commande</th>
                  <th className="px-6 py-4 font-normal">Catégorie</th>
                  <th className="px-6 py-4 font-normal">Accès</th>
                  <th className="px-6 py-4 font-normal">État</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((command, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    <td className="px-6 py-4">
                      <span className="font-medium">/{String(command.name)}</span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {String(command.description)}
                      </p>
                    </td>
                    <td className="px-6 py-4">{String(command.category)}</td>
                    <td className="px-6 py-4">
                      {command.ownerOnly
                        ? 'Propriétaire'
                        : command.adminOnly
                          ? 'Administration Nagi'
                          : 'Public'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge>{command.isMaintenance ? 'Maintenance' : 'Active'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState
            title="Aucun registre publié pour le moment."
            description="Les commandes apparaîtront ici après la première synchronisation réussie du bot."
          />
        ))}
      <Card>
        <h2 className="text-sm font-medium">Dernières demandes de synchronisation</h2>
        {requests.length ? (
          <ul className="mt-5 divide-y divide-border">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
              >
                <span className="text-muted-foreground">{formatDate(request.created_at)}</span>
                <Badge>
                  {(
                    {
                      pending: 'En attente',
                      processing: 'En cours',
                      succeeded: 'Terminée',
                      failed: 'Échec',
                    } as Record<string, string>
                  )[request.status] ?? request.status}{' '}
                  · {request.attempts} tentative(s)
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Aucune demande enregistrée.</p>
        )}
      </Card>
    </div>
  );
}
