import { Badge, Button, Card } from '@nagi/ui';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';
import { googlePlacesConfig } from '@/features/integrations/google-places/config';
import { toggleGooglePlaces } from './actions';

export default async function IntegrationsPage() {
  await requireAdmin();
  const config = googlePlacesConfig(),
    db = await sessionDatabase();
  const result = await db.rpc('google_places_admin', {});
  const state = result.data as {
    enabled: boolean;
    last_error: string | null;
    last_error_at: string | null;
    today: Record<string, number>;
  } | null;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">Paramètres globaux</p>
        <h1 className="mt-2 text-2xl font-semibold">Intégrations</h1>
      </div>
      <Card className="space-y-5">
        <div className="flex justify-between gap-4">
          <h2 className="text-lg font-semibold">Google Maps</h2>
          <Badge>
            {config.configured && config.enabled && state?.enabled ? 'Disponible' : 'Indisponible'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Places UI Kit pour l’affichage des lieux. Places API (New) pour vérifier les identifiants
          et localiser les visites. Aucune donnée Google n’est importée dans le catalogue.
        </p>
        <dl className="grid gap-3 text-sm">
          <div>
            Configuration des clés :{' '}
            {config.configured
              ? 'deux clés distinctes configurées'
              : 'configuration incomplète ou clés identiques'}
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
                quotas et la facturation dans Google Cloud.
              </p>
            )}
            <form action={toggleGooglePlaces}>
              <input type="hidden" name="enabled" value={String(!state.enabled)} />
              <Button type="submit" variant="secondary">
                {state.enabled ? 'Désactiver la recherche Google' : 'Activer la recherche Google'}
              </Button>
            </form>
            <div>
              <h3 className="text-sm font-semibold">Activité enregistrée aujourd’hui · UTC</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Compteurs Nagi des autorisations de composants et des appels serveur. Ces chiffres
                ne constituent pas la facture Google Cloud.
              </p>
              <dl className="mt-3 grid gap-2 text-sm">
                {(
                  [
                    ['ui_search', 'Composants de recherche autorisés'],
                    ['ui_details', 'Composants de détail autorisés'],
                    ['verify', 'Vérifications serveur'],
                    ['coordinates', 'Résolutions de coordonnées'],
                    ['autocomplete', 'Requêtes Autocomplete (IDs uniquement)'],
                    ['text_search', 'Recherches complètes (IDs uniquement)'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <dt>{label}</dt>
                    <dd>{state.today[key] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            </div>
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
