# Navigation des journées — phase 4.14

La navigation commune à l’itinéraire, au calendrier et à la carte conserve son état partagé dans `TripWorkbench`. Son rendu est isolé dans `TripDaysNavigation`, avec les mêmes destinations et les mêmes zones de dépôt.

## Présentation et interactions

- En-tête « Votre séjour » compact ; le bouton `+` ouvre toujours l’éditeur existant de journée, avec titre et date facultatifs.
- « Tout le voyage » et « À organiser » disposent de repères discrets et de séparateurs fins.
- Chaque journée présente son numéro et sa date courte sur une ligne. Le titre personnalisé occupe une seconde ligne uniquement lorsqu’il existe ; les titres longs sont tronqués et restent disponibles dans le libellé accessible et le tooltip.
- Les compteurs restent dans une colonne fixe, avec chiffres tabulaires. Ils comptent les occurrences principales, sans leurs arrêts imbriqués. Une journée à zéro reste sélectionnable.
- La sélection combine un fond léger, une graisse renforcée et un repère latéral. Le survol, le focus clavier et la destination de dépôt possèdent des états distincts. Une seule destination porte `aria-current=true`.
- Le pied présente une horloge et le fuseau réel du voyage, accompagné d’une explication au survol. Les dates restent des dates calendaires, indépendantes du fuseau du navigateur.

Sur ordinateur, l’en-tête, la destination globale, « À organiser » et le fuseau restent fixes. Seule la liste des jours défile. Une sélection externe ou la réouverture du panneau révèle le jour actif en déplaçant uniquement son conteneur, de la distance nécessaire. Les autres rendus et les changements de vue conservent le défilement manuel.

Sur tablette et mobile, la navigation horizontale existante est conservée, dans un seul conteneur défilant. Le bouton d’ajout reste accessible à son extrémité fixe. Le fuseau et « À organiser » restent accessibles dans la bande.

Tabulation, Entrée et Espace utilisent les boutons natifs. Les flèches haut/bas sur ordinateur, gauche/droite sur mobile, ainsi que Début/Fin déplacent le focus sans sélectionner automatiquement une journée. Ce traitement est suspendu pendant un glisser-déposer pour préserver les commandes du moteur DnD. Les transitions respectent la réduction des animations.

## Logique conservée

L’état `activeDay`, les callbacks de sélection, les routes Next.js et les permissions restent ceux du planificateur existant. Les cibles `nav:<id>` conservent exactement leurs données de dépôt : une journée reçoit son identifiant, « À organiser » reçoit `null`, et « Tout le voyage » reste exclu des destinations de dépôt.

Le survol d’une destination pendant un drag ne change pas la journée sélectionnée. Le dépôt continue à utiliser les mutations du planificateur : occurrences indépendantes, arrêts imbriqués, horaires, durées et notes sont préservés.

Le calcul des compteurs parcourt les étapes une seule fois par changement de liste ; les formateurs de dates sont partagés. Le composant n’ajoute aucun chargement serveur. Les interactions de survol et de focus ne demandent aucun trajet. Le code cartographique, les profils Directions, les quotas et le comportement global/journalier restent inchangés.

Aucune migration Supabase ni modification des données de production n’est nécessaire.

## Fichiers principaux

| Fichier                                               | Rôle                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/web/src/features/trips/day-navigation.tsx`      | Rendu partagé, boutons, DnD, focus et révélation du jour actif.                       |
| `apps/web/src/features/trips/day-navigation-model.ts` | Compteurs, dates calendaires et déplacement minimal du scroll.                        |
| `apps/web/src/features/trips/workbench.tsx`           | Intégration avec l’état partagé existant.                                             |
| `apps/web/src/features/trips/workspace.css`           | Densité, états interactifs, zones fixes et responsive.                                |
| `tests/day-navigation.test.ts`                        | Quinze tests sur les compteurs, dates invalides/interannuelles et défilement minimal. |
| `scripts/qa/trips/day-navigation.py`                  | Recette réelle Next/React/PostgreSQL/SSE/Chromium pour 1, 9 et 30 jours.              |
| `scripts/qa/trips/catalog.py`                         | Régressions catalogue/DnD et dépôt d’une étape existante vers le pied fixe.           |

## Validation

- **770 tests dans 58 fichiers** réussis.
- TypeScript de l’application web et du projet racine, ESLint, formatage et build Next.js de production validés.
- Recette de navigation : voyages de **1, 9 et 30 jours**, avec journées vides, plusieurs étapes et arrêts, titre long et absence de titre ; fuseaux Asia/Tokyo et Pacific/Honolulu, navigateur Pacific/Auckland ; passage de décembre à janvier ; fenêtre de 600 px de haut et téléphone de 390 px.
- Sélection conservée entre les trois vues, focus sans sélection automatique, révélation d’une journée depuis le calendrier et après réouverture, maintien du scroll au changement de vue, un seul sélecteur mobile et ajout accessible.
- Recette Carte existante : **14 groupes** de scénarios réussis, notamment trajets journaliers, absence de recréation de la carte, survol/focus sans appel supplémentaire, synchronisation et responsive à 768/390/320 px.
- Recette historique du catalogue, du calendrier et de l’itinéraire : **26 pages**, aucune erreur JavaScript.
- Recette SQL/SSE du catalogue : dépôts vers les journées et « À organiser », déplacements entre journées, préservation des enfants et horaires, synchronisation avec un second compte, annulation et consultation.

Les essais utilisent des comptes et voyages fictifs dans PGlite, avec le transport Directions et les tuiles simulés. Ils ne consomment pas de crédits cartographiques. Les captures et rapports locaux sont conservés dans `artifacts/days414/`, ignoré par Git.

Après un build isolé dans `.next/days414-final`, un scénario se reproduit ainsi :

```sh
NAGI_QA_DAYS=30 NAGI_QA_DAY_NAV=1 NAGI_QA_ROUTES=1 NAGI_QA_DIST_DIR=.next/days414-final NAGI_QA_PORT=3157 NAGI_QA_OUTPUT=/tmp/nagi-days414-30 node scripts/qa/trips/server.mjs
python3 scripts/qa/trips/day-navigation.py --url http://localhost:3157 --output /tmp/nagi-days414-30
```

`NAGI_QA_DAYS` accepte 1 à 90 jours ; la recette historique conserve quatre jours par défaut. `NAGI_QA_TIMEZONE` permet de choisir un autre fuseau dans ces seules données de test.
