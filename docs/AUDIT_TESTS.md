# Audit qualitatif de la suite de tests Nagi

Audit du 24 novembre 2026, sur l’état de travail présent au début de cette demande : **667 tests Vitest dans 50 fichiers**. Les modifications de l’audit technique précédent sont conservées. Cet audit ne modifie aucun code de production.

## Bilan

Les nombres ci-dessous comptent les cas exécutés par Vitest, après développement des `it.each`, et non les déclarations `it`.

| Décision                                        | Cas initiaux | Cas finaux | Justification                                                                                                                                     |
| ----------------------------------------------- | -----------: | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conservés avec les mêmes comportements vérifiés |          642 |        642 | Scénarios distincts, frontières de confiance ou régressions encore pertinentes ; inclut les fichiers dont seul le préambule `server-only` change. |
| Simplifiés ou fiabilisés                        |           16 |         16 | Assertions plus précises, fixtures valides, suppression de mocks sans effet et contrôle déterministe du temps.                                    |
| Regroupés                                       |            9 |          2 | Sept variantes de titre deviennent un cas représentatif ; le contrôle de source du cas Foursquare rejoint le test de sélection du fournisseur.    |
| Supprimés sans reprise du scénario              |            0 |          0 | Aucun scénario autonome important n’a démontré une absence de valeur suffisante pour disparaître.                                                 |
| **Total**                                       |      **667** |    **660** | **7 exécutions redondantes retirées, 50 fichiers de tests conservés.**                                                                            |

Les **138 tests SQL**, les **21 tests de la file de mutations**, les tests d’authentification, de permissions, d’isolation, de révocation, d’intégrité et de synchronisation restent présents. Aucun test n’est ignoré, désactivé ou marqué `todo`.

## Changements et preuves

### Regroupements

- **Aperçus d’images : 7 cas vers 1.** Les titres Kamakura, Tokyo, Kyoto, Shibuya, Sensō-ji, Shibuya Parco et Pokémon Center SHIBUYA passaient tous par la même conversion `candidatePreview` : le titre y est recopié, sans recherche ni branche selon le nom. Le cas conservé contient des caractères accentués et vérifie toujours le titre, les droits inconnus, l’URL, l’absence de licence et de date de vérification, ainsi que l’absence d’écriture. Les autorisations de développement et d’administration restent testées séparément.
- **Choix du fournisseur : 2 cas vers 1.** Le test intitulé Foursquare vérifiait un statut constant d’un adaptateur non installé, sans consommateur dans le parcours de production. Cette assertion est retirée. Son contrôle utile, `source: 'nagi'` refusée par le fournisseur Mapbox, rejoint le test existant de filtrage des références et de limitation des appels Places. Ce contrôle n’est pas supprimé.

### Les 16 cas simplifiés ou fiabilisés

| Fichier                           | Cas concernés | Correction et valeur préservée                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-session.test.ts`            |             1 | L’historique réseau est vidé après la création de session. L’assertion exige maintenant la vérification `/auth/v1/user` sur la requête suivante ; un appel antérieur ne suffit plus à faire passer le test.                                                                                                                                                         |
| `commands.test.ts`                |             1 | L’import qui lève une erreur utilise un répertoire distinct du module invalide. Le test atteint réellement cet import et vérifie l’erreur d’import de Nagi.                                                                                                                                                                                                         |
| `icons.test.ts`                   |             1 | Le seuil arbitraire de 1 800 icônes est remplacé par `icons:generate --check` via le script réel. Cela vérifie la conformité du registre généré à la dépendance installée. Une validation de schéma répétée dans l’échantillon est retirée ; la validation de tous les noms demeure.                                                                                |
| `image-provider-pipeline.test.ts` |             7 | Retrait du mock `provider-photos`, que le module testé n’importe pas, et de ses six assertions négatives toujours vraies, dont une exécutée pour deux modes. Les vrais résultats, la conservation des choix et les appels aux dépendances effectives restent vérifiés. Les cas couverture téléversée et résolution désactivée exigent aussi l’absence d’indexation. |
| `ping.test.ts`                    |             2 | La latence de l’accusé de réception est contrôlée par une horloge monotone simulée, avec une valeur attendue exacte. Le timeout utilise un vrai signal d’annulation piloté par le test, tout en vérifiant le budget de 2 500 ms et le diagnostic publié. Une assertion de titre incluse dans une égalité plus forte est retirée.                                    |
| `relation-actions.test.ts`        |             1 | Les formulaires négatifs ont un horodatage valide par défaut ; direction manquante et lien vers soi-même ne peuvent plus être masqués par une métadonnée manquante. Le titre distingue un horodatage mal formé d’un vrai conflit de version, couvert en SQL.                                                                                                        |
| `settings-actions.test.ts`        |             1 | Chaque confirmation de suppression est retirée séparément d’un formulaire valide. L’ancienne boucle omettait toujours `understood` et ne démontrait pas la nécessité indépendante de `confirmation`.                                                                                                                                                                |
| `shared.test.ts`                  |             1 | L’identifiant de ville invalide est testé dans une entrée complète, avec témoin positif. L’ancien objet ne contenait aucun des autres champs obligatoires et était rejeté indépendamment de cet identifiant.                                                                                                                                                        |
| `trip-workspace.test.ts`          |             1 | La latitude hors limites est testée sur un viewport autrement valide ; les coordonnées manquantes ne masquent plus le résultat attendu.                                                                                                                                                                                                                             |

### Fixtures, helpers et configuration

- **24 déclarations de mocks `server-only` dans 13 fichiers deviennent 2 déclarations dans `tests/setup.ts`**, chargé par `vitest.config.ts`. Il s’agit du même marqueur de séparation Next.js, neutralisé pour les tests Node des modules serveur. Les contrôles applicatifs d’authentification et d’autorisation restent exercés. Aucun mock métier global n’est ajouté.
- Les fixtures métier restent locales : galerie, session d’image, file de mutations, route et transaction SQL n’ont pas le même contrat. Leur ressemblance ne justifie pas une usine de données ou un faux Supabase générique.
- Les petites fonctions `request`, `fixture` et constructeurs de requêtes restent proches de leurs tests. Aucun DSL, classe de base ou nouvelle couche d’abstraction métier n’est introduit.
- Les hooks transactionnels PostgreSQL, savepoints d’échec attendu et rôles simulés sont conservés. Ils permettent de vérifier les refus sans laisser une transaction en erreur contaminer les assertions suivantes.

## Revue des 50 fichiers

« Conservé » porte sur les scénarios et les assertions métier ; certains préambules partagent désormais `tests/setup.ts`.

| Fichier dans `tests/`              | Avant → après | Décision et valeur examinée                                                                                                                                          |
| ---------------------------------- | ------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activity-stops.test.ts`           |       13 → 13 | Conservé : identité des arrêts, déplacements, immutabilité, budget et horaires dérivés ; distinct de leur persistance SQL.                                           |
| `auth-session.test.ts`             |         8 → 8 | Précisé : cookies HttpOnly, isolation entre applications, secrets OAuth, PKCE, vérification et fermeture de session.                                                 |
| `calendar-colors.test.ts`          |       20 → 20 | Conservé : CSS dangereux, conversion du sélecteur, couleur par occurrence, déplacement et redimensionnement locaux.                                                  |
| `calendar-presentation.test.ts`    |         4 → 4 | Conservé : lisibilité selon la place disponible, date locale, minuit et changements d’heure ; contrat de présentation Nagi autour d’Intl.                            |
| `catalog-experience.test.ts`       |         8 → 8 | Conservé : placement catalogue et Mapbox, répétitions indépendantes, arrêts, durée explicite et limites de minuit.                                                   |
| `catalog.test.ts`                  |         5 → 5 | Conservé : adresses stables, brouillons, champs typés, boutons ordonnés et refus des liens dangereux.                                                                |
| `commands.test.ts`                 |       13 → 13 | Fiabilisé : découverte réelle, import invalide, déploiement non destructif, réconciliation idempotente et accès centralisé.                                          |
| `database.test.ts`                 |     138 → 138 | Conservé intégralement : migrations réelles, RLS et fonctions privilégiées, catalogue, stockage, graphe, quotas, leases, comptes, audiences et journal collaboratif. |
| `diagnostics.test.ts`              |         4 → 4 | Conservé : causes utiles, secrets masqués, cycles et taille bornée.                                                                                                  |
| `discord.test.ts`                  |       19 → 19 | Conservé : adaptation API, chiffrement lié à l’utilisateur, rotation et révocation, appartenances fraîches et données partagées durables.                            |
| `external-places-route.test.ts`    |         8 → 8 | Conservé : corps borné, session et voyage, preuves signées, référence étrangère, origine et absence de proxy générique.                                              |
| `geography.test.ts`                |         4 → 4 | Conservé : normalisation, coordonnées et parents valides, réencodage d’upload et refus des fichiers déguisés.                                                        |
| `icons.test.ts`                    |         4 → 4 | Précisé : registre généré conforme, recherche française, chemins sûrs et SVG réellement décodables.                                                                  |
| `image-cache.test.ts`              |         4 → 4 | Conservé : ancien cache négatif, nouveau résultat négatif, association positive et lease actif sont quatre états distincts.                                          |
| `image-discovery-economy.test.ts`  |       10 → 10 | Conservé : découverte unique, états enregistrés, slot occupé et annulation avant ou après un appel facturable.                                                       |
| `image-gallery-limit.test.ts`      |         5 → 5 | Conservé : plafond de dix, anciens offsets, filtre local et maintien des couvertures et fallbacks sélectionnés.                                                      |
| `image-matching.test.ts`           |       19 → 19 | Conservé : alias, ordre des mots, branches homonymes et confirmation géographique ; les variantes déclenchent des règles distinctes.                                 |
| `image-preview.test.ts`            |        13 → 7 | Sept projections équivalentes regroupées ; restrictions d’environnement, droits administrateur, choix privé et disponibilité conservés.                              |
| `image-provider-photos.test.ts`    |       20 → 19 | Statut d’adaptateur inutilisé retiré, contrôle de source regroupé ; droits, origines, identité du lieu, quotas et déduplication conservés.                           |
| `image-provider-pipeline.test.ts`  |       11 → 11 | Simplifié : mock sans consommateur retiré ; priorité Serper, fallback licencié, cache, choix manuel et couverture téléversée préservés.                              |
| `image-resolver.test.ts`           |       38 → 38 | Conservé : licences vérifiées, métadonnées nettoyées, rapprochement prudent, preuves et transport borné.                                                             |
| `image-route.test.ts`              |         7 → 7 | Conservé : validation et autorisation avant lecture ou fournisseur, origine, taille, sélection persistante et réponses privées.                                      |
| `image-session.test.ts`            |       13 → 13 | Conservé : visibilité, cache, annulations, choix temporaire, rollback et conflit de révision indépendant du planning.                                                |
| `mapbox-photo-quota.test.ts`       |         3 → 3 | Conservé : réservation partagée, coalescence, cooldown 429 et blocage avant appel payant ; complément des quotas SQL.                                                |
| `mapbox-places.test.ts`            |       23 → 23 | Conservé : adaptation suggest/retrieve/forward, preuves liées au contexte, expiration, quotas et absence de fuite.                                                   |
| `mapbox-search-client.test.ts`     |       13 → 13 | Conservé : debounce, raffinement, réponse tardive, annulation ignorée, reprise explicite et session de sélection.                                                    |
| `mapbox-session.test.ts`           |         4 → 4 | Conservé : durée de vie de la présentation, coalescence, détails incomplets et absence de retries payants automatiques.                                              |
| `ping.test.ts`                     |       12 → 12 | Fiabilisé : sondes bornées, latences, pannes sans fuite, réponses publiques et permissions des commandes protégées.                                                  |
| `planner.test.ts`                  |         5 → 5 | Conservé : édition et mouvement immuables, dates, chevauchement, points géographiques et ligne de changement de date.                                                |
| `private-images.test.ts`           |         3 → 3 | Conservé : variantes bornées, taille réellement produite, mutualisation, erreurs non cachées et URLs privées.                                                        |
| `private-media-routes.test.ts`     |         2 → 2 | Conservé : réautorisation après réchauffement du cache ; indispensable pour empêcher une fuite de pixels après révocation.                                           |
| `profiles.test.ts`                 |       56 → 56 | Conservé : liens obfusqués, HTML et mentions, Unicode, ownership des bannières, audience fraîche et conflit de version.                                              |
| `relation-actions.test.ts`         |         5 → 5 | Précisé : formulaires réellement ciblés, autorisation globale, orientation, version et invalidation des extrémités.                                                  |
| `relation-search-route.test.ts`    |       15 → 15 | Conservé : accès administrateur, paramètres bornés, recherche contextuelle, annulation et erreurs expurgées.                                                         |
| `relation-search.test.ts`          |         4 → 4 | Conservé : SQL PostgREST émis par Nagi, exclusions, pages bornées, ordre stable et propagation du signal.                                                            |
| `relations.test.ts`                |         5 → 5 | Conservé : lecture des deux orientations, symétrie, regroupement et omission des destinations cachées.                                                               |
| `request-body.test.ts`             |         6 → 6 | Conservé : octets UTF-8, limites exactes, Content-Length trompeur, arrêt du flux et invalidité JSON/UTF-8.                                                           |
| `serper-images.test.ts`            |       13 → 13 | Conservé : requête privée unique, bornes, cooldown, identité stable des URLs, SSRF et secrets.                                                                       |
| `settings-actions.test.ts`         |         8 → 8 | Précisé : deux confirmations indépendantes ; identité fraîche, révocation préalable, cookies et préférences conservés.                                               |
| `shared.test.ts`                   |       23 → 23 | Précisé : identifiant réellement isolé ; rôles fiables, refus fermé, redirections sûres et validation avant écriture.                                                |
| `space-navigation-actions.test.ts` |         7 → 7 | Conservé : préférence liée à l’utilisateur authentifié et à une appartenance fraîche, invalidation limitée et erreurs.                                               |
| `trip-dnd.test.ts`                 |       11 → 11 | Conservé : intention Nagi au centre ou au bord d’une carte, clavier, origine catalogue et destination hors itinéraire.                                               |
| `trip-format.test.ts`              |         9 → 9 | Conservé : minutes seules, heure exacte ou composée, valeurs absentes et libellés distincts des activités et arrêts.                                                 |
| `trip-mutation-queue.test.ts`      |       21 → 21 | Conservé intégralement : optimisme, coalescence, ordre, identité de retry, rollback ciblé, journal manquant, hors-ligne et révocation.                               |
| `trip-mutations-route.test.ts`     |         5 → 5 | Conservé : transmission validée sous la bonne portée, origine, limites de corps et appartenance refusée.                                                             |
| `trip-places-route.test.ts`        |         8 → 8 | Conservé : portée guilde/voyage, catalogue borné, activité du voyage uniquement, annulation et confidentialité des erreurs.                                          |
| `trip-stops-rollout.test.ts`       |         3 → 3 | Conservé : fallback encore présent en production ; une erreur de permission ne doit jamais déclencher ce fallback.                                                   |
| `trip-sync-client.test.ts`         |         4 → 4 | Conservé : erreurs HTTP mal formées correctement classées, délai borné et annulation de session.                                                                     |
| `trip-sync-route.test.ts`          |         4 → 4 | Conservé : échec avant ressources, échec de souscription, annulation consommateur et abort navigateur sont des chemins distincts.                                    |
| `trip-workspace.test.ts`           |         7 → 7 | Précisé : viewport valide autour du champ refusé ; ordre visible, calendrier, placement et recherche bornée conservés.                                               |

## Choix de conservation

- **Validation client, route et SQL ne sont pas des doublons interchangeables.** Elles protègent des points d’entrée différents ; une écriture directe ou privilégiée contourne la validation du formulaire. Les tests SQL ne se limitent pas à vérifier PostgreSQL : ils exercent les contraintes, triggers, RPC et politiques propres à Nagi après application des migrations.
- **Les intégrations Supabase, Discord, Sharp, Intl et DnD gardent leurs tests de contrat Nagi.** Le résultat observé porte sur les cookies configurés par Nagi, l’absence de secrets, les dimensions servies, les dates locales et les intentions de placement. Il ne s’agit pas de tester ces bibliothèques isolément.
- **Les mocks de routes sont conservés quand ils représentent une frontière externe.** Ils rendent observable l’ordre « refuser puis ne pas écrire/ne pas facturer ». Les autorisations SQL réelles sont vérifiées séparément. Leur nombre seul ne démontre pas un excès.
- **Les anciens formats et fallbacks encore exécutables sont conservés.** Galeries historiques, migrations et déploiements échelonnés restent des états réels du code ; leur ancienneté ne prouve pas leur obsolescence.
- **La simulation serveur de la file de mutations n’est pas une preuve d’équivalence au serveur SQL.** Ses assertions attendent des valeurs explicites ; les tests transactionnels indépendants couvrent les permissions, les conflits, le rejeu et les reçus. Aucun simulateur générique supplémentaire n’est créé.

## Vérification — suite complète

- Référence avant modification : **667/667**, 50 fichiers, aucun échec ni test ignoré.
- Après modification : `pnpm test --reporter=json --outputFile=artifacts/test-audit/final-results.json` : **660/660**, 50 fichiers, aucun échec, aucun test en attente ni `todo`.
- Les 117 cas des 11 fichiers dont les assertions changent passent aussi lors de l’exécution ciblée préalable.
- Le scénario de timeout `/ping` passe d’environ **2 515 ms à 59 ms** sur ces deux exécutions. Cela ne constitue pas un benchmark global : la suite complète dure environ 28 secondes dans les deux cas, dominée par PostgreSQL.
- Rapports machine locaux : `artifacts/test-audit/baseline-results.json` et `artifacts/test-audit/final-results.json`. Le snapshot des 50 fichiers avant cette intervention est conservé dans `artifacts/test-audit/baseline-tests.json` ; ces artefacts sont ignorés par Git.

## Contrôles — lint, types et format

- `node node_modules/eslint/bin/eslint.js . --max-warnings 0` : réussi.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` : réussi.
- `node node_modules/prettier/bin/prettier.cjs --check .` : réussi avant ajout de ce rapport ; le rapport est ensuite formaté et vérifié séparément.
- `git diff --check` : réussi.
