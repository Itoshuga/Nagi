# Planificateur — Audit et performances avant/après

Mesures du 20 novembre 2026. Les résultats ci-dessous proviennent de scénarios locaux reproductibles ; ils ne constituent pas des mesures de latence du déploiement de production.

## Conditions

- Mac Apple M4, 24 Go de mémoire, macOS arm64, Node v26.13.0, build de production Next 16.4.6 et Chromium Playwright à 1 440 × 1 000.
- Version de référence : `acf4e39ec430d47a65ef70712b3182762563d429`. Même base de démonstration reconstruite depuis les migrations de chaque version, mêmes fiches et mêmes gestes. Quatre journées, quatre activités principales et trois arrêts internes dans le voyage mesuré ; un second voyage contient une autre activité.
- 500 ms injectées avant l’exécution de la RPC d’écriture. Une action d’échauffement puis 20 observations retenues par interaction. Les mesures d’écriture isolent le coût d’une mutation en désactivant SSE/polling pendant ce scénario ; la synchronisation utilise un scénario séparé à deux comptes.
- `MutationObserver` mesure l’instant de modification du DOM et sa confirmation, depuis l’événement de validation. Le contrôle d’attente Playwright n’entre pas dans ces temps. Les appels et réponses sont comptés jusqu’à la confirmation, puis pendant une courte fenêtre de collecte de 30 ms, incluant les préchargements RSC déclenchés par l’invalidation.
- Les volumes sont les octets UTF-8 décodés des réponses `fetch`. Les en-têtes et la compression réseau ne sont pas inclus. Le nombre d’appels serveur inclut Auth, Discord et PostgREST.

## Causes identifiées avant modification

1. `TripWorkbench.execute` acceptait une seule requête à la fois, avec `inFlight` puis `busy` appliqué à l’ensemble des vues. Les mutations d’éléments étaient déjà en partie optimistes, mais l’utilisateur devait attendre leur confirmation avant l’action suivante. Les journées n’utilisaient pas cette projection commune.
2. `editTrip` appelait `requireGuild(..., true)` à chaque modification : session/profil, préférences, token Discord, appels utilisateur/bot et renouvellement des attestations étaient sollicités, même lorsque le snapshot vérifié était encore récent.
3. `changed()` invalidait l’espace, la liste et le layout du voyage. Une petite écriture déclenchait le rendu RSC du plan, ses cartes du catalogue, ses collaborateurs et ses relations, puis des préchargements devenus obsolètes.
4. `useTripLive` recevait une invalidation SSE puis exécutait `router.refresh()`. Un polling toutes les 15 s refaisait la même opération lorsqu’il détectait une révision différente.
5. Le client ne conservait qu’un snapshot optimiste et une version globale. Une erreur pouvait restaurer le snapshot entier ; la réconciliation ne pouvait pas superposer plusieurs intentions indépendantes.
6. Les chevauchements du calendrier étaient recalculés lors de changements de notes/couleurs. Les lectures initiales du catalogue et des profils étaient déjà groupées : aucun schéma N+1 par activité n’a été identifié dans ce parcours.

## Résultats des écritures

Médianes sur 20 observations ; amélioration calculée par `(avant − après) / avant`.

| Mesure                                   |     Avant |     Après | Réduction |
| ---------------------------------------- | --------: | --------: | --------: |
| Modification visuelle d’une couleur      |  17,85 ms |  17,05 ms |   −4,48 % |
| Modification visuelle d’un horaire       |   17,5 ms |  14,45 ms |  −17,43 % |
| Réorganisation visuelle d’un arrêt       |   13,2 ms |  12,05 ms |   −8,71 % |
| Confirmation d’un horaire                |    597 ms | 567,35 ms |   −4,97 % |
| Confirmation d’une couleur               | 597,55 ms | 568,45 ms |   −4,87 % |
| Confirmation d’une réorganisation        |  588,5 ms | 554,95 ms |    −5,7 % |
| Appels HTTP côté serveur / couleur       |        28 |         4 |  −85,71 % |
| Réponses fetch navigateur / couleur      |         9 |         1 |  −88,89 % |
| Octets reçus par le navigateur / couleur |   37743 o |   645,5 o |  −98,29 % |
| Octets reçus des services / couleur      |   25486 o |  1406,5 o |  −94,48 % |
| Relectures complètes du voyage / couleur |         1 |         0 |    −100 % |

Le document du navigateur reste ouvert dans les deux versions. Le compteur de relecture complète correspond à la requête du plan et au rendu RSC du voyage. Les gains les plus marqués portent sur ce travail supprimé et sur la possibilité d’enchaîner les actions pendant la persistance ; le réseau simulé impose déjà un minimum de 500 ms aux confirmations.

| Interaction     | Visuel avant, médiane / p95 | Visuel après, médiane / p95 | Confirmation avant, médiane / p95 | Confirmation après, médiane / p95 |
| --------------- | --------------------------: | --------------------------: | --------------------------------: | --------------------------------: |
| Couleur         |             17,85 / 20,8 ms |             17,05 / 19,2 ms |                 597,55 / 609,7 ms |                 568,45 / 579,7 ms |
| Horaire / durée |              17,5 / 21,6 ms |             14,45 / 15,4 ms |                      597 / 607 ms |                 567,35 / 570,6 ms |
| Réorganisation  |              13,2 / 14,1 ms |             12,05 / 14,4 ms |                  588,5 / 594,3 ms |                 554,95 / 558,8 ms |

Un scénario fonctionnel supplémentaire, avec 2 s de latence, a mesuré 9,4 ms pour l’ajout visuel d’une activité, 13,5 ms pour une création de journée et 13 ms pour un retrait. Il comporte un seul échantillon par action et vérifie aussi une création suivie d’une suppression avant confirmation ; ces valeurs n’ont pas de p95 ni de référence avant.

## Synchronisation collaborative

Deux comptes fictifs distincts consultent le même voyage. Le serveur HTTP/SSE, les RPC, les transactions et les RLS sont ceux de l’application. Le transport Phoenix est simulé localement ; aucun événement client ne remplace une lecture autorisée du journal SQL. Vingt changements sont mesurés après échauffement, avec les mêmes 500 ms injectées avant l’écriture.

| Mesure                              | Avant, médiane / p95 | Après, médiane / p95 |
| ----------------------------------- | -------------------: | -------------------: |
| Interaction A → rendu chez B        |       657,5 / 700 ms |         564 / 578 ms |
| Retour de commit SQL → rendu chez B |        97,5 / 144 ms |           18 / 24 ms |

La recette vérifie aussi : propriétés compatibles d’une même activité, conflit sur une même propriété, maintien d’une autre modification après rollback, coupure/rétablissement réseau avec notes en attente, sauvegarde pendant une navigation et séparation des voyages. Les tests SQL protègent les confirmations destructives contre un arrêt ou une activité ajouté entre-temps par un autre membre.

## Scénario volumineux

Le voyage contient **500 activités sur 14 jours**, dont **254 événements** dans la semaine affichée. Dix changements de couleur sont saisis en 2216,2 ms avec **2 s de latence par écriture**, puis un déplacement réel est annulé. Les confirmations terminent en arrière-plan et aucune erreur JavaScript n’est relevée.

Sur 675 intervalles `requestAnimationFrame`, la médiane vaut 11,9 ms, le p95 26,6 ms et le maximum 90,7 ms ; 5 intervalles dépassent 50 ms. Ces résultats ne démontrent pas 60 FPS constants. Les ouvertures de menus, confirmations et démarrage du drag sont inclus.

Le cache géométrique du calendrier dépend uniquement des horaires, durées et ordre des occurrences. Les changements de couleur/notes conservent les positions et réattachent les données récentes. Le contenu inchangé d’un événement évite les rendus répétés pendant le déplacement. Un test vérifie explicitement l’absence de recalcul de chevauchement pour les couleurs/notes. Aucun compteur exact de commits React DevTools n’a été relevé ; les timings de frames ne lui sont pas équivalents. Une virtualisation supplémentaire n’a pas été introduite.

## PostgreSQL et infrastructure

- Le positionnement fractionnaire existant est conservé. Un déplacement ordinaire écrit la ligne concernée ; un compactage ne sert que si un intervalle est épuisé. Les réorganisations et conversions d’arrêts restent transactionnelles.
- `EXPLAIN (ANALYZE, BUFFERS)` sur les 500 activités utilise l’index existant de journée/voyage, avec environ 0,2 ms pour la lecture et le tri testés dans PGlite. Le [plan brut](performance/trips-query-plan.json) permet de vérifier les valeurs. Il ne mesure ni Supabase distant ni l’ensemble de la RPC.
- Les nouveaux index sont les clés primaires du journal `(trip_id, version)` et des reçus `(trip_id, mutation_id)`. Les anciens index de journées, de lanes et de parents d’arrêts couvrent les opérations existantes.
- La région du projet Supabase lié a été vérifiée par la CLI : `eu-central-1` (Francfort). Next tourne localement pour cette recette. Le dépôt ne définit pas de région de déploiement Next ; aucune migration d’hébergement n’a été effectuée.
- Les cold starts cloud, la latence WAN Next ↔ Supabase, le réseau mobile réel et Supabase Query Performance en production n’ont pas été mesurés. Le démarrage sécurisé existant reste exécuté une fois par processus. Les réponses JSON exposent `Server-Timing` pour mesurer ensuite session, appartenance, persistance, enrichissement et total en environnement réel.

## Fiabilité et limites

Le serveur reste la référence. Les patches autorisés, les anciennes valeurs attendues, les versions SQL et les reçus d’idempotence sont vérifiés avant confirmation. Deux modifications de propriétés différentes peuvent se combiner ; deux changements incompatibles d’une même propriété depuis une base identique produisent un conflit explicite. Une requête rejouée garde son identifiant et son contenu exacts.

La file en mémoire est isolée par compte, serveur et voyage. Trois envois indépendants au maximum sont actifs par voyage ; les dépendances sont ordonnées. Un rollback retire seulement l’intention refusée. Les pannes temporaires conservent les intentions avec trois tentatives au maximum, puis une reprise manuelle. La navigation dans `/app` conserve les envois ; une fermeture/recharge complète avertit si des intentions restent en attente. Aucun contenu privé n’est écrit dans IndexedDB. Il n’y a pas de mode hors ligne durable après fermeture du navigateur.

La synchronisation lit uniquement les événements confirmés et déduplique leurs versions. Un manque ou plus de 1 000 révisions demande un snapshot autorisé, avec conservation des intentions compatibles. Les autorisations SQL sont réévaluées lors des lectures et écritures ; les connexions SSE se renouvellent au plus toutes les 35 s et contrôlent aussi le journal toutes les 10 s. Le snapshot Discord vérifié reste borné à 30 s, avec contrôle de présence du bot et expiration des attestations SQL existantes. Une révocation nettoie la file et le contenu local du voyage.

Les nouvelles occurrences enrichissent les cartes, relations et auteurs autorisés de façon groupée. Les modifications ordinaires d’horaires ou de couleurs ne relisent pas ces données.

Validation finale : 379 tests unitaires/SQL, build, lint, typecheck, conformité des types PostgreSQL et recettes navigateur. Les migrations de cette phase sont additives et ont été appliquées au projet lié.

Les [observations avant](performance/trips-before.csv), [observations après](performance/trips-after.csv), [résumés et échantillons de synchronisation](performance/trips-summary.json) et [scénarios reproductibles](../scripts/qa/trips/README.md) accompagnent ce rapport.
