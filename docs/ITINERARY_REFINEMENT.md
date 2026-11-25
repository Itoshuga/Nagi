# Itinéraire — phase 4.10

## Résultat

L’itinéraire conserve les journées, étapes et arrêts existants. La date devient un titre de section ; le numéro du jour, le compteur et le titre personnalisé passent au second plan. Les lignes restent légères au repos, avec une surface discrète au survol et une sélection distincte pour le lieu réellement ouvert dans les détails.

La colonne temporelle est commune aux étapes et aux arrêts. Le branchement des enfants part du centre de la photo du parent et s’arrête au point du dernier arrêt. Les photos, noms, menus et actions suivent une grille adaptée aux écrans étroits. Les arrêts sont plus petits que leur parent. Les états « Libre », horaire explicite et horaire estimé restent distincts ; les calculs de durée incluse sont conservés.

Le bouton Compass de fin de journée est aligné avec les photos et ouvre toujours « Explorer le catalogue », avec la journée cible. Les journées vides ont une explication courte et une destination de dépôt. Les catégories techniques Mapbox connues reçoivent un libellé lisible sans modifier leurs identifiants fournisseur.

## Déplacement

Les zones sont discrètes au repos et élargies pendant un déplacement. Une ligne indique une insertion, une surface et le libellé « Ajouter comme arrêt » indiquent une imbrication. Le texte décrit l’opération réellement prise en charge : réordonner les arrêts, remettre un arrêt en étape, déplacer vers une journée ou conserver l’ordre chronologique.

Le nouveau helper pur `tripDropFeedback` partage ces règles entre les indicateurs et les annonces accessibles. Il réutilise `tripDropChange` et les contraintes existantes ; le moteur de collision dnd-kit est conservé. Les zones invalides ne sont pas affichées comme disponibles. Les détails, menus et éditeurs existants restent utilisables sans glisser-déposer.

La miniature de déplacement est compacte, centrée sur le pointeur et lit la photo déjà résolue en cache. Elle n’observe pas une nouvelle source à charger. Les rectangles sont remesurés après les changements de taille pendant le geste via `ResizeObserver`, sans interrogation périodique.

Pendant un drag, un instantané du plan stabilise l’affichage. La file existante continue à recevoir les modifications distantes. Au dépôt, la destination est revérifiée dans le dernier état et le contexte initial de l’occurrence alimente les gardes de concurrence existantes. Une note distante peut ainsi être conservée sans déplacer brutalement l’interface pendant le geste.

## Fichiers et composants

| Fichiers                                                               | Modification                                                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web/src/features/trips/itinerary.tsx`, `workspace.css`           | Journées, colonnes, lignes, horaires, actions, états vides et indicateurs d’insertion.       |
| `apps/web/src/features/trips/activity-stops.tsx`, `activity-stops.css` | Hiérarchie et branchement des arrêts, sélection, noms accessibles et dépôts contextuels.     |
| `apps/web/src/features/trips/activity-card.tsx`                        | Identifiant optionnel du titre pour le nom accessible des arrêts.                            |
| `apps/web/src/features/trips/step-editor.tsx`                          | Libellé compact « Libre » ; éditeur existant conservé.                                       |
| `apps/web/src/features/trips/drag-overlay.tsx`                         | Aperçu compact et utilisation de la photo en cache sans nouveau chargement.                  |
| `apps/web/src/features/trips/planner-dnd.ts`                           | Helper partagé de validité et de description du dépôt.                                       |
| `apps/web/src/features/trips/workbench.tsx`                            | Affichage stable pendant le drag, vérification de la destination et annonces accessibles.    |
| `apps/web/src/features/integrations/mapbox/model.ts`, `components.tsx` | Catégories lisibles et titre des étapes personnalisées.                                      |
| `tests/trip-dnd.test.ts`, `tests/mapbox-places.test.ts`                | Validité des destinations, intentions, chronologie et libellés Mapbox.                       |
| `tests/browser/mapbox-places.mjs`                                      | Alignements mesurés, sélection, états invalides, mises à jour distantes et petits écrans.    |
| `scripts/qa/trips/catalog.py`                                          | Recette SQL enrichie : deux comptes pendant un drag et déplacement d’un parent avec enfants. |
| `scripts/qa/trips/itinerary.py`                                        | Nouvelle recette ciblée des déplacements d’arrêts avec sauvegarde SQL.                       |

Aucun nouveau composant React, aucune dépendance et aucune migration Supabase. Aucun composant supprimé. Les anciens styles de surlignage du catalogue et les libellés de dépôt génériques remplacés ont été retirés ; les styles des détails restent distincts de ceux de la timeline.

Les pictogrammes de `apps/web/src/features/images/place-placeholder.tsx` reconnaissent également les catégories traduites en français pour conserver le bon visuel en l’absence de photo.

## Règles conservées et limites

- Les étapes déjà horaires gardent leur ordre chronologique et leurs heures. Les déplacer dans l’itinéraire ne crée pas d’heure à partir de leur position verticale.
- Un arrêt extrait conserve l’horaire dérivé déjà prévu par les règles existantes, lorsqu’un horaire parent permet ce calcul. Cette refonte ne change pas cette conversion.
- Une étape possédant des arrêts ne peut pas être imbriquée dans une autre étape. Les occurrences répétées d’un même lieu restent indépendantes.
- Le dépôt au centre d’une étape suit les sources prises en charge par le moteur actuel ; la destination explicite « Ajouter comme arrêt » reste disponible pour les lieux Nagi.
- Les permissions, transactions, reçus d’idempotence, notes, couleurs, photos choisies, relations et fuseaux horaires conservent leurs mécanismes actuels.
- Les tests utilisent des comptes fictifs et une base PostgreSQL temporaire avec les migrations réelles. Le transport Phoenix et les services externes sont simulés. Ils ne constituent pas une recette de l’infrastructure Supabase hébergée ou d’un appareil tactile physique.
- Aucune amélioration chiffrée de performance n’est annoncée. Les scénarios contrôlent l’absence de sauvegarde, de recherche fournisseur et de nouveau chargement de résolution d’image pendant les déplacements testés.

## Validation du 25 novembre 2026

- **673 tests Vitest, 50 fichiers : réussis.**
- **TypeScript** web et tests, **ESLint**, **Prettier** sur les fichiers modifiés et **build Next.js : réussis**. Build isolé dans `.next/itinerary-redesign-qa`, sans arrêter le serveur de développement.
- **Recette navigateur standard et aperçu privé React StrictMode : réussis**, 26 scènes par parcours, aucune erreur d’exécution et aucun appel fournisseur payant.
- **Recette catalogue avec SQL/RPC/RLS et deux comptes : 18 scénarios réussis.** Insertion avant une étape, occurrences répétées, arrêts, journées vides, annulation, calendrier à 14:30/13:15, déplacement de l’événement existant, clavier/mobile/consultation, note reçue pendant le drag et parent déplacé avec ses enfants après rechargement.
- **Recette native des arrêts : 5 scénarios réussis.** Réorganisation au pointeur, extraction vers « À organiser », retour dans une journée, réimbrication de la même occurrence après rechargement et déplacement par le menu existant. Cinq sauvegardes ciblées, aucune erreur d’exécution.
- Les mesures de géométrie vérifient l’alignement temporel commun, le départ du branchement sous la photo et son extrémité au dernier point. Contrôles à 1280, 834, 390 et 320 px, avec noms longs, thème sombre et absence d’horaire.

Régressions détectées et corrigées pendant la recette : priorité CSS insuffisante pour l’indentation des arrêts ; décalage entre les rectangles de dépôt et une projection animée pendant le drag ; parent affiché sélectionné lorsqu’un enfant était ouvert ; nom accessible générique pour un arrêt Mapbox ; destinations affichées dans les détails en dehors de la surface de dépôt autorisée.

## Reproduire les contrôles

```sh
pnpm test
pnpm lint
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm exec tsc --noEmit -p tsconfig.json
NAGI_QA_DIST_DIR=.next/itinerary-redesign-qa pnpm --filter @nagi/web build
NAGI_QA_DIST_DIR=.next/itinerary-redesign-qa node tests/browser/mapbox-places.mjs
NAGI_IMAGE_DEV_QA=1 NAGI_PREVIEW_UI_QA=1 NAGI_QA_DIST_DIR=.next/itinerary-redesign-qa node tests/browser/mapbox-places.mjs
```

Pour la recette SQL, démarrer `scripts/qa/trips/server.mjs` avec `NAGI_QA_DIST_DIR`, `NAGI_QA_PORT` et `NAGI_QA_OUTPUT`, puis lancer `catalog.py` ou `itinerary.py` avec les mêmes `--url` et `--output`. Utiliser une base temporaire neuve pour chaque recette. Voir également `scripts/qa/trips/README.md`.

Le comparatif local est dans `artifacts/itinerary-redesign/comparison.html`, avec les captures avant/après à dimensions identiques. Ce répertoire de captures est ignoré par Git.
