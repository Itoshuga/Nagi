# Calendrier — phase 4.11

## Comportement

Les occurrences du calendrier partagent désormais le même mécanisme de prise en main, qu’elles soient horaires, sans horaire, Nagi, Mapbox ou personnalisées. Les dates et les titres de journées restent des contrôles de navigation.

| Destination                | Occurrence existante                                                        | Lieu du catalogue                                       |
| -------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| Grille horaire             | Modifie la journée et le début ; conserve la durée métier.                  | Crée une nouvelle occurrence au créneau choisi.         |
| Sans horaire               | Retire le début et la fin ; conserve la durée connue.                       | Crée une occurrence sans heure.                         |
| Autre colonne Sans horaire | Change la journée sans ajouter d’heure ; permet le réordonnancement manuel. | Insère une nouvelle occurrence à la position indiquée.  |
| Vue Séjour                 | Change la journée en conservant l’horaire et la durée.                      | Ajoute une occurrence sans horaire à la journée ciblée. |

Une activité de durée libre utilise une hauteur visuelle minimale, sans enregistrer une durée arbitraire. Une activité possédant une durée connue garde celle-ci lors d’un déplacement. Les limites de journée contraignent le début pour conserver cette durée sans dépasser minuit.

Le déplacement dans la grille utilise la colonne réellement affichée et le point de saisie de l’événement. Un déplacement horizontal avec une faible variation verticale conserve une heure précise existante, par exemple 09:07. Un déplacement horaire volontaire se cale sur quinze minutes. Le clavier utilise également un pas de quinze minutes dans la grille ; le redimensionnement conserve ses poignées et commandes propres.

Le type et la référence de l’occurrence sont conservés pendant le geste, même lorsque la carte d’origine sort de la vue. Un seul aperçu est enregistré auprès du moteur à la fois : une prévisualisation vide concurrente ne peut plus neutraliser la détection au clavier.

## Interface

- La zone « Sans horaire » reste dans l’en-tête fixe et accepte un dépôt même vide. Les colonnes restent alignées sur la grille.
- Les événements sans horaire ont leur nom, durée éventuelle, sélection, menu contextuel et poignée accessible. Les noms longs sont tronqués visuellement et restent accessibles dans le titre et les détails.
- Le déplacement utilise un aperçu compact avec le nom, la couleur, la durée et la destination. Dans la grille, un aperçu à l’échelle montre l’emplacement futur ; dans « Sans horaire », une ligne indique l’insertion.
- La vue Séjour expose toutes les occurrences, au lieu de limiter les résumés à trois lieux non manipulables. Les boutons d’ouverture de journée sont distincts des activités.
- Sur mobile, la grille est utilisable directement ; l’ancienne représentation agenda dupliquée a été retirée. Le maintien tactile et sa tolérance de mouvement restent ceux du capteur existant.
- Un maintien de 750 ms sur une flèche de période ou un autre mode de calendrier permet de poursuivre le geste dans cette destination, sans changement de période au simple passage.
- Les détails et leurs éditeurs restent l’alternative au glisser-déposer. Un simple clic, le clic droit, le déplacement et le redimensionnement conservent des interactions distinctes.

## Précision, sauvegarde et collaboration

Le moteur dnd-kit, la grille, le modèle Supabase et la file de mutations existants sont conservés. Il n’y a ni nouvelle dépendance ni migration SQL.

Les calculs de destination et de changement sont centralisés dans `calendar-model.ts`. Les déplacements d’ordre ou de journée utilisent `move_item` ; les changements de planification utilisent `schedule_item`, converti en patch ciblé par le transport existant. Aucune mutation n’est envoyée au survol.

Le calendrier utilise la géométrie actuelle des destinations, y compris après défilement ou changement de vue. Les informations de dépôt ne modifient plus la hauteur de l’en-tête pendant le geste. Le défilement automatique agit sur la grille lorsqu’elle est réellement survolée ; il reste désactivé pendant la prise d’un événement dans l’en-tête fixe.

L’affichage continue à utiliser l’instantané de drag introduit en phase 4.10, pendant que la file reçoit les changements distants. Les gardes de concurrence du calendrier protègent ensemble la journée, les deux horaires et la durée. Une modification simultanée de ces propriétés est signalée ; une note ou une couleur peut se synchroniser indépendamment. Les droits serveur et les politiques RLS sont inchangés.

Les occurrences conservent leur identifiant. Les liens parent-enfant, notes, couleurs, photos sélectionnées et durées incluses des arrêts ne sont pas réécrits par un déplacement. Les dates restent des journées locales du voyage ; aucune conversion de date sans horaire en timestamp UTC ou en événement « Toute la journée » n’est introduite.

## Fichiers

| Fichiers                                                     | Rôle                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/trips/calendar.tsx`                   | Destinations, aperçus, vues, navigation pendant le drag et sauvegarde.                                  |
| `calendar-card.tsx`                                          | Nouveau comportement partagé de prise en main et nouvel événement compact.                              |
| `calendar-event.tsx`                                         | Événement horaire branché sur le comportement commun ; redimensionnement conservé.                      |
| `calendar-model.ts`                                          | Calculs communs, durée libre, conversion sans horaire, changements ciblés et coordonnées clavier.       |
| `calendar-interactions.css`                                  | Nouveaux états et règles responsive.                                                                    |
| `use-calendar-scroll.ts`                                     | Défilement progressif aux bords visibles, délai de déclenchement et marge de focus sous l’en-tête fixe. |
| `calendar-place-title.tsx`                                   | Lecture du titre en cache dans les aperçus, sans nouvelle observation du fournisseur.                   |
| `catalog-drag.ts`, `planner-dnd.ts`                          | Contrat des destinations partagé avec le catalogue, géométrie réelle et filtrage des surfaces.          |
| `drag-overlay.tsx`                                           | Modificateur de centrage réutilisé par les aperçus du calendrier.                                       |
| `workbench.tsx`, `workspace.css`                             | Capteurs, annonces, auto-scroll et suppression des styles de l’ancien agenda.                           |
| `planner-model.ts`, `mutation-model.ts`, `mutation-queue.ts` | Intention calendrier et gardes de concurrence ciblées.                                                  |
| `tests/calendar-drag.test.ts`                                | Nouveaux contrôles de planification, de durée, d’ordre et de concurrence.                               |
| `scripts/qa/trips/calendar.py`                               | Recette de non-régression adaptée à la grille mobile.                                                   |
| `scripts/qa/trips/calendar-drag.py`                          | Nouvelle recette universelle avec la vraie base SQL locale, deux comptes et tactile émulé.              |

Les chemins abrégés de ce tableau appartiennent à `apps/web/src/features/trips/`.

Les sélecteurs des recettes `scripts/qa/trips/catalog.py` et `scripts/qa/trips/large.py` sont également adaptés à l’aperçu commun.

Le nouveau composant React est `CalendarCompactEvent`. `CalendarEvent`, la grille et les menus existants sont conservés. L’ancien agenda mobile et les styles de l’ancien aperçu ont été supprimés ; il n’existe plus deux représentations concurrentes des mêmes occurrences sur mobile.

## Règles conservées et limites

Retirer l’horaire d’une étape dans sa propre journée conserve son ordre existant. La ligne d’insertion correspond à cette position ; un déplacement ultérieur parmi les activités sans horaire permet de la réordonner. Un changement de journée vers « Sans horaire » place l’activité à la fin de cette journée. Cela conserve une seule mutation atomique avec les opérations serveur existantes.

Les arrêts ne deviennent pas des événements horaires autonomes dans le calendrier : déplacer leur parent conserve leur rattachement et leurs règles temporelles dérivées. Les opérations de détachement restent celles de l’itinéraire et des détails.

Une activité sans horaire ne reçoit aucune poignée de redimensionnement horaire. Une activité à durée libre ne reçoit pas de durée métier à partir de sa hauteur d’affichage. Les chevauchements restent autorisés et utilisent la disposition côte à côte existante.

Le bandeau des activités sans horaire possède un défilement commun lorsque son contenu devient très haut, au lieu d’un défilement par colonne. Sur un téléphone court, le calendrier conserve les détails et l’édition directe comme alternatives à la manipulation dans une grille compacte.

Les recettes utilisent des identités fictives et une base PostgreSQL temporaire avec les migrations et contrôles réels. Les services externes et le transport Phoenix sont simulés. Elles ne remplacent pas un essai sur l’infrastructure Supabase hébergée ou sur un appareil tactile physique. Aucun gain de performance chiffré n’est revendiqué.

## Vérification reproductible

```sh
pnpm test
pnpm lint
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
NAGI_QA_DIST_DIR=.next/calendar411-qa pnpm --filter @nagi/web build
```

Pour chaque recette SQL, démarrer une base temporaire neuve :

```sh
NAGI_QA_DIST_DIR=.next/calendar411-qa NAGI_QA_PORT=3158 NAGI_QA_OUTPUT=/tmp/nagi-calendar-drag node scripts/qa/trips/server.mjs
python3 scripts/qa/trips/calendar-drag.py --url http://localhost:3158 --output /tmp/nagi-calendar-drag
```

La recette `calendar.py` conserve les contrôles des couleurs, détails, horaires courts, chevauchements, redimensionnement, annulation, rollback et responsive. Les parcours du catalogue sont également couverts par `tests/browser/mapbox-places.mjs`, en mode standard et aperçu privé React StrictMode.

## Validation — 26 novembre 2026

- **682 tests Vitest dans 51 fichiers : réussis.** Les nouveaux cas couvrent notamment l’absence de durée inventée, la conservation de la durée, les limites de journée, l’ordre manuel et les gardes de planification.
- **TypeScript web et tests, ESLint et build Next.js : réussis.** Le build utilise `.next/calendar411-qa` ; le fichier de types du serveur de développement est rétabli après la compilation isolée.
- **17 scénarios de déplacement sur SQL/RPC/RLS réels : réussis.** Ils comprennent la planification à 10:00, la durée libre, les déplacements entre journées et zones, l’ordre après rechargement, 09:07 conservé horizontalement, les arrêts du parent, Échap, les dépôts invalides, le défilement, les changements de vue/période, le rollback, deux comptes concurrents, le clavier et le maintien tactile émulé.
- **8 scénarios historiques du calendrier : réussis.** Alignements, repère horaire du voyage, chevauchements, détails, suppression, couleurs, redimensionnement, erreurs de sauvegarde, modes Jour/Semaine/Séjour et responsive jusqu’à 320 px.
- **Scénario de 500 activités sur 14 jours : réussi.** Dix changements indépendants peuvent être effectués avec 2 s de latence de sauvegarde injectée ; une vraie prise en main et son annulation restent possibles. Aucune erreur navigateur. Les métriques locales ne sont pas utilisées pour annoncer un gain de performance.
- **Catalogue Nagi/Mapbox et itinéraire : réussis**, 26 scènes en mode standard et 26 sous React StrictMode, sans erreur d’exécution ni appel fournisseur payant.
- **Défilement tactile bref : réussi.** Un balayage sur une activité fait défiler la grille sans activer un drag ni modifier l’occurrence, en complément du test de maintien tactile.

Les refus HTTP 422 et 409 des scénarios de rollback et de concurrence sont injectés volontairement. Ils ne correspondent pas à une erreur d’exécution JavaScript.

Défauts détectés et corrigés pendant la recette : prise en main absente dans « Sans horaire » ; rectangles périmés après changement de hauteur ; défilement déclenché au passage de l’en-tête ; perte du contexte quand la source quitte la période visible ; compétition entre deux aperçus produisant un rectangle nul au clavier ; conflit temporel pouvant passer inaperçu lorsqu’un patch ne changeait qu’une partie des champs de planification.

Les captures avant/après à dimensions identiques et les résultats JSON sont conservés localement dans `artifacts/calendar411/`. Le comparatif s’ouvre avec `comparison.html`. Ces captures sont ignorées par Git.
