# Carte — trajets journaliers, phase 4.12

La présentation et la sélection du panneau Carte ont été affinées en [phase 4.13](MAP_SIDEBAR.md), avec une sélection indépendante des étapes et des arrêts.

La sélection de journée reste celle du planificateur commun. **Tout le voyage** et **À organiser** affichent uniquement les lieux, sans appel Directions ni total de déplacement. Une journée précise affiche automatiquement le trajet de toutes ses étapes et de tous ses arrêts géolocalisés, dans leur ordre, avec le profil **à vélo** imposé. Aucune inclusion manuelle ni sélection de transport. Le calcul ne modifie pas l’itinéraire.

## Moteur et interface

L’audit a identifié **Leaflet 1.9.4 avec des tuiles Mapbox**, et non une instance Mapbox GL JS. Le moteur existant est conservé : les géométries Directions sont rendues par des couches GeoJSON Leaflet, avec contour blanc et tracé bleu `#73A6DF`. Aucune bibliothèque n’est ajoutée. Les couches changent sans recréer la carte.

La barre conserve la liste, l’exploration des alentours et l’ajout depuis le catalogue. Elle affiche une indication fixe « À vélo » et une action Recentrer. Aucun sélecteur de transport ni bouton d’inclusion/exclusion n’est présent. La synthèse sépare les déplacements des visites ; « Trajet partiel » désigne uniquement les portions calculées. Les précisions sont repliables pour conserver une liste compacte sur mobile. Logo et attributions restent visibles.

Un clic sur un lieu centre la carte et ouvre ses détails. Un arrêt ouvre désormais ses propres détails. Les occurrences superposées restent accessibles par une liste dans leur popup. En vue journalière, leur pin conserve le premier numéro de visite et porte un petit badge indiquant les occurrences supplémentaires. Le survol et le focus de la liste mettent en évidence le marqueur et les portions de route associées.

Le cadrage automatique intervient à l’ouverture, au changement de journée et à la première réception du trajet si l’utilisateur n’a pas déplacé la carte. Les interactions au pointeur, au clavier et à la molette sont respectées. Recentrer tient compte du panneau superposé sur mobile. Les mises à jour de notes, couleurs, photos, sélection et zoom ne provoquent pas de nouveau cadrage.

## Séquence des visites

- L’ordre vient de `visibleTripItems` et `tripMapVisits`, exactement comme dans l’itinéraire : conventions horaires existantes, puis chaque étape suivie de ses arrêts ordonnés. Aucune optimisation géographique.
- Les coordonnées Nagi et personnalisées viennent du plan autorisé côté serveur. Les positions Mapbox viennent des références résolues, signées pour l’utilisateur et le voyage ; le service Directions n’effectue aucune recherche de lieu supplémentaire.
- Les positions absentes, non finies ou hors limites ne participent pas au routage. Leurs occurrences restent consultables dans « Sans coordonnées ».
- Les points de passage successifs distants de **25 m ou moins** partagent un accès routier. Toutes les occurrences sont conservées. Revenir au même lieu après une autre destination reste un vrai déplacement.
- Tous les lieux possédant des coordonnées valides participent automatiquement au parcours, y compris les villes et quartiers présents dans la journée. Aucune catégorie ou type Mapbox ne provoque d’exclusion. Les anciens rôles de repère et leurs commandes ont été retirés.

## Calcul et géométrie

Le profil journalier est fixé à `mapbox/cycling` par une constante partagée entre client et serveur. Le navigateur n’envoie aucun choix de profil ni aucune liste d’inclusion/exclusion ; ces paramètres supplémentaires sont refusés par l’endpoint. Il n’existe aucun basculement automatique vers la marche ou la voiture. L’adaptateur Directions interne conserve ses capacités de transport pour une évolution future, sans les exposer dans cette expérience.

Le serveur appelle Directions avec `longitude,latitude`, `geometries=geojson`, `overview=full`, `steps=false`, `annotations=distance,duration`, `alternatives=false` et un rayon de rattachement de 75 m. Les métriques affichées viennent des legs de la réponse. Les annotations permettent de découper la géométrie par liaison. Si elles sont absentes ou ne correspondent pas au nombre de sommets, la géométrie authentique du lot est conservée et le survol porte sur ce lot, avec les métriques individuelles disponibles.

Chaque lot contient au plus **25 coordonnées**, avec chevauchement d’un point entre lots. Aucun lieu n’est retiré pour respecter cette limite. Une réponse `NoRoute` ou `NoSegment` entraîne une subdivision du lot pour sauver les liaisons accessibles, dans le budget de calcul. Une erreur ne produit jamais de ligne droite de remplacement.

Les liaisons à vol d’oiseau dépassant 250 km sont signalées comme incompatibles avec le calcul vélo prévu ici. Les lots sont également bornés en distance pour rester sous les limites Directions. Les positions restent sur la carte ; les liaisons suivantes calculables peuvent être affichées. Une journée avec des lieux sans position ou des liaisons manquantes est présentée comme partielle.

Référence : [documentation officielle Directions](https://docs.mapbox.com/api/navigation/directions/).

## Coûts, durée de vie et sécurité

La clé de calcul contient la journée, le profil, l’ordre des identités d’occurrences, leurs coordonnées. Le profil reste toujours vélo. Elle exclut notes, noms, couleurs, photos, durées de visite et état de la caméra. Un délai de 350 ms évite les appels transitoires ; les réponses obsolètes sont annulées ou ignorées.

Les conditions Mapbox Navigation interdisent le cache et le stockage des résultats (article 2.10.1). Il n’existe donc **aucun cache de trajets terminés**, ni en base, ni dans le stockage du navigateur, ni sur disque. Seul le résultat actuellement affiché reste dans l’état du composant. Changer de journée ou quitter la carte le libère ; revenir sur une journée peut nécessiter un nouvel appel. La déduplication serveur concerne exclusivement les calculs simultanés d’un même utilisateur, voyage et clé, dans le même processus, puis disparaît à leur achèvement. Les budgets SQL restent partagés entre processus.

Source vérifiée le 27 novembre 2026 : [Mapbox Product Terms, 20 octobre 2026](https://cdn.prod.website-files.com/609ed46055e27a02ffc0749b/6ad79764a359d21b46049ea4_Mapbox%20Product%20Terms%20%28October%2020%2C%202026%29.pdf).

Plafonds par défaut :

| Protection                                            | Valeur                                                   |
| ----------------------------------------------------- | -------------------------------------------------------- |
| Aucun ou un seul accès routier distinct               | Aucun appel Directions                                   |
| Un calcul journalier, subdivisions comprises          | 8 appels maximum                                         |
| Utilisateur / jour                                    | 120 appels                                               |
| Service / jour                                        | 1 000 appels Directions                                  |
| Utilisateur / minute                                  | 12 appels                                                |
| Service / seconde, partagé avec les recherches Mapbox | 8 appels                                                 |
| Service / minute glissante                            | 240 appels Directions                                    |
| Calculs simultanés par utilisateur et processus       | 2                                                        |
| Abonnés à un calcul simultané                         | 8                                                        |
| Appel fournisseur                                     | Délai maximal 7 s, réponse JSON limitée à 2 Mo           |
| Calcul complet                                        | Arrêt des nouveaux lots après 18 s ; limite absolue 25 s |

Les trois plafonds configurables Directions sont documentés dans `.env.example`. Le `.env` personnel n’a pas été modifié. Les compteurs Directions utilisent le registre Mapbox privé existant ; ils entrent aussi dans les budgets agrégés des recherches existantes. Aucune géométrie, distance ou durée n’y est enregistrée. Un HTTP 429 bloque temporairement les nouveaux appels dans le processus en respectant `Retry-After`, sans boucle de retry. Seul un décalage entre plan optimiste et plan enregistré autorise deux vérifications HTTP supplémentaires ; ces refus de clé ne font aucun appel fournisseur.

`POST /app/[guildId]/trips/[tripId]/directions` exige une origine identique, un corps JSON borné, une session, l’appartenance Discord et la lecture autorisée du voyage. Les références sont limitées aux occurrences de la journée. Le serveur impose le vélo et refuse les paramètres de profil ou d’exclusion envoyés par le client. Les coordonnées arbitraires du navigateur sont refusées. Les preuves Mapbox sont liées à l’utilisateur, au voyage, à l’identifiant et à la recherche ; les preuves périmées demandent une actualisation explicite des lieux. Un plan devenu obsolète est refusé avant Directions. Réponses `private, no-store`, erreurs publiques génériques et token serveur jamais renvoyé au navigateur.

La réservation atomique des quotas est une fonction SQL `security definer` à `search_path` vide, exécutable uniquement par `service_role`. Les autorisations de lecture du plan continuent à utiliser le client de session et les règles RLS existantes.

## Vérifications et livraison

- **713 tests / 54 fichiers** : ordre, arrêts, accès partagés, zones, positions absentes, signature stable, adaptateur multi-profils interne, vélo imposé par l’endpoint, inclusion automatique des zones géographiques, 69 points en trois lots, erreurs partielles, budget de huit appels, arrêt sur quota, annulation, déduplication et absence de cache terminé, preuves et contrôles HTTP.
- PostgreSQL local : toutes les migrations, RLS et permissions, quotas Directions utilisateur/service, limite commune par seconde, minute glissante, refus des paramètres invalides et désactivation administrative.
- TypeScript validé pour le web, le bot, tous les packages et les tests. ESLint, formatage des fichiers concernés, cohérence des types SQL et `git diff --check` validés.
- Build Next de production réussi dans `.next/map412-qa`, sans remplacer le build de développement.
- Recette Chromium sur le vrai build Next, la vraie base SQL locale et le flux SSE, avec identités et transport Directions synthétiques : 11 groupes de scénarios, zéro erreur JavaScript. Notes/couleurs sans recalcul, déplacement entre journées, réponses obsolètes, caméra manuelle, arrêts tous inclus, vélo fixe sans sélecteur, quotas/NoRoute, permissions et formats 1440/768/390/320 px.
- Recette navigateur historique Mapbox/catalogue : **26 pages**, parcours de recherche, catalogue, calendrier et médias validés, zéro erreur JavaScript.
- Vérification initiale de l’API réelle : **trois appels au total**, un par profil sur un trajet public à Tokyo. Les trois réponses HTTP 200 contenaient une géométrie et des métriques valides, avec annotations par liaison. Aucun résultat Directions réel n’a été enregistré ou exporté. La simplification vers le vélo fixe a été vérifiée avec le transport synthétique, sans nouvel appel facturable.
- Migrations appliquées par le CLI Supabase : `20261127120000_mapbox_directions_quota.sql` et la migration déjà présente `20261124183303_calendar_palette_rls_initplan.sql`. Historique distant vérifié : aucune migration en attente. La seconde conserve les mêmes propriétaires et permissions pour les couleurs du calendrier.

Pour reproduire la recette sans appel facturable, démarrer une base fraîche :

```sh
NAGI_QA_ROUTES=1 NAGI_QA_DIST_DIR=.next/map412-qa NAGI_QA_PORT=3157 NAGI_QA_OUTPUT=/tmp/nagi-map412-qa node scripts/qa/trips/server.mjs
python3 scripts/qa/trips/map-routes.py --url http://localhost:3157 --output /tmp/nagi-map412-qa
```

Le script produit `map-report.json` et les captures desktop/tablette/mobile. Les résultats de cette livraison sont également disponibles localement dans `artifacts/map412/` (répertoire ignoré par Git). Les fonds de carte et les réponses Directions de cette recette sont synthétiques ; ces captures servent au contrôle de la mise en page, pas à valider une route réelle. Aucun compte ni voyage de production n’est modifié par la recette.

## Fichiers

| Fichiers créés                                                            | Responsabilité                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web/src/features/trips/map-route-model.ts`                          | Toutes les visites routables, signature, profil vélo fixe, accès communs et longitudes. |
| `apps/web/src/features/trips/map-route-compute.ts`                        | Lots, validation de réponse, métriques, subdivisions et résultats partiels.             |
| `apps/web/src/features/trips/map-route-client.ts`                         | Chargement de la vue active, annulation et gardes contre les réponses obsolètes.        |
| `apps/web/src/features/integrations/mapbox/directions.ts`                 | Transport serveur, réservations de quota et déduplication en cours.                     |
| `apps/web/src/app/(app)/app/[guildId]/trips/[tripId]/directions/route.ts` | Endpoint authentifié et plan de référence côté serveur.                                 |
| `supabase/migrations/20261127120000_mapbox_directions_quota.sql`          | Réservation atomique des compteurs, sans données de trajet.                             |
| `tests/map-directions*.test.ts`                                           | Modèle, calcul, transport et endpoint.                                                  |
| `scripts/qa/trips/map-routes.py`                                          | Recette du vrai build avec PostgreSQL et navigateur.                                    |
| `docs/MAP_DAILY_ROUTES.md`                                                | Fonctionnement, limites, fichiers et validation.                                        |

| Fichiers modifiés                                                     | Changement                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/web/src/features/trips/map.tsx`                                 | Couches GeoJSON, commandes, synthèse, sélection des arrêts, survol et cadrage. |
| `apps/web/src/features/trips/workspace.css`                           | Tracés, badges, commandes, synthèse compacte et mobile.                        |
| `apps/web/src/features/integrations/mapbox/{config,proof,server}.ts`  | Plafonds Directions et signature des positions déjà résolues.                  |
| `packages/database/src/database.types.ts`                             | Type RPC généré depuis les migrations.                                         |
| `.env.example`                                                        | Trois plafonds optionnels Directions.                                          |
| `tests/database.test.ts`                                              | Quotas et permissions SQL Directions.                                          |
| `scripts/qa/trips/{server,fixture}.mjs`, `scripts/qa/trips/README.md` | Mode de recette Directions isolé, contrôlable et sans appel externe.           |

## Limites conservées

Mapbox ne fournit pas ici de métro, train, bus ni calcul multimodal. Aucune station, correspondance ou durée ferroviaire n’est inventée. Les API de calcul et le modèle d’affichage sont séparés pour pouvoir ajouter un fournisseur de transport collectif ultérieurement. Les routes dépendent de la couverture, des restrictions et du rattachement au réseau Mapbox ; elles ne constituent pas une garantie de passage ou d’accessibilité.

Une journée très longue ou comportant de nombreuses liaisons impossibles peut atteindre le budget de huit appels : les lieux restent tous présents, les portions obtenues sont conservées et le résultat reste explicitement partiel. Les détails pas à pas, l’optimisation de l’ordre, le calcul hors ligne, les trajets multi-profils et le choix du transport ne sont pas implémentés.
