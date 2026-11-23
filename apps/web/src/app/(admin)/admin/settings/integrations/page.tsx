import { Badge, Button, Card } from '@nagi/ui';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';
import { mapboxConfig } from '@/features/integrations/mapbox/config';
import { toggleMapbox } from './actions';

export default async function IntegrationsPage() {
  await requireAdmin();
  const config = mapboxConfig(),
    db = await sessionDatabase();
  const result = await db.rpc('mapbox_admin', {});
  const state = result.data as {
    enabled: boolean;
    last_error: string | null;
    last_error_at: string | null;
    today: Record<string, number>;
    details_month: number;
  } | null;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">Paramètres globaux</p>
        <h1 className="mt-2 text-2xl font-semibold">Intégrations</h1>
      </div>
      <Card className="space-y-5">
        <div className="flex justify-between gap-4">
          <h2 className="text-lg font-semibold">Mapbox</h2>
          <Badge>
            {config.configured && config.enabled && state?.enabled ? 'Disponible' : 'Indisponible'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Search Box pour la recherche et la localisation. Places Details pour les informations
          complémentaires disponibles. Aucune donnée Mapbox n’est importée dans le catalogue.
        </p>
        <dl className="grid gap-3 text-sm">
          <div>
            Configuration des clés :{' '}
            {config.configured
              ? 'tokens serveur et navigateur configurés'
              : 'configuration incomplète'}
          </div>
          <div>Activation par l’environnement : {config.enabled ? 'oui' : 'non'}</div>
          <div>
            Limites : {config.userMinute}/minute par membre · {config.userDaily}/jour par membre ·{' '}
            {config.globalDaily}/jour au total
          </div>
        </dl>
        {state ? (
          <>
            {Object.values(state.today).reduce((sum, value) => sum + value, 0) >=
              config.globalDaily * 0.8 && (
              <p role="status" className="text-sm text-destructive">
                La consommation enregistrée approche la limite quotidienne Nagi. Vérifiez aussi les
                quotas et la facturation dans Mapbox.
              </p>
            )}
            <form action={toggleMapbox}>
              <input type="hidden" name="enabled" value={String(!state.enabled)} />
              <Button type="submit" variant="secondary">
                {state.enabled ? 'Désactiver la recherche Mapbox' : 'Activer la recherche Mapbox'}
              </Button>
            </form>
            <div>
              <h3 className="text-sm font-semibold">Activité enregistrée aujourd’hui · UTC</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Compteurs Nagi des appels serveur. Ces chiffres ne constituent pas la facture
                Mapbox.
              </p>
              <dl className="mt-3 grid gap-2 text-sm">
                {(
                  [
                    ['suggest', 'Suggestions'],
                    ['forward', 'Recherches validées'],
                    ['retrieve', 'Lieux résolus'],
                    ['details', 'Informations complémentaires'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <dt>{label}</dt>
                    <dd>{state.today[key] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="text-sm text-muted-foreground">
              Places Details ce mois : {state.details_month} / {config.detailsMonthly}. Les
              informations enrichies restent facultatives.
            </p>
            {state.last_error && (
              <p className="text-xs text-muted-foreground">
                Dernière erreur : {state.last_error}
                {state.last_error_at ? ` · ${state.last_error_at}` : ''}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            La migration des intégrations doit être appliquée pour activer les compteurs et le
            contrôle de disponibilité.
          </p>
        )}
      </Card>
    </div>
  );
}
