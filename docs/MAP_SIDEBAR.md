# Sidebar Carte — phase 4.13

Le panneau Carte présente les étapes et les arrêts avec la même famille de lignes interactives : nom prioritaire, repère numéroté, métadonnées secondaires et état de sélection distinct du survol. Les arrêts gardent une légère indentation et leur numérotation hiérarchique. Le header, la synthèse des déplacements, les transitions, la section sans coordonnées et l’ajout d’étape restent dans le panneau existant.

## Sélection et interactions

La sélection de carte est dérivée de l’état partagé du planificateur sous la forme `{ id, type: 'step' | 'stop' }`. Elle ne crée pas de second état de navigation.

- Un arrêt est recherché par son propre identifiant. Le parent fourni par le planificateur n’est jamais utilisé comme repli lorsqu’un arrêt est sélectionné, absent ou devenu obsolète.
- L’ouverture d’un arrêt utilise obligatoirement `onStopDetails`. Aucun chemin ne remplace cet appel par l’ouverture du parent.
- Une seule ligne porte `aria-pressed=true`, avec coche, repère latéral et fond de sélection. Le survol et le focus restent temporaires et indépendants.
- Le marqueur sélectionné indique l’identifiant et le type exacts. Si plusieurs occurrences partagent un emplacement, son numéro et son libellé concernent l’occurrence choisie ; la popup conserve l’accès individuel aux autres lieux.
- Les portions de trajet liées à la sélection restent accentuées pendant le survol d’un autre lieu. Le survol d’une transition peut accentuer sa seule portion. Aucune géométrie supplémentaire n’est inventée.
- Entrée et Espace ouvrent les détails de la ligne focalisée. Le panneau de détails reçoit le focus, y compris lorsqu’il était déjà ouvert ; sa fermeture le rend à la bonne ligne, notamment après une sélection depuis une popup de marqueur.
- Un arrêt sans coordonnées reste sélectionnable indépendamment et ouvre ses détails sans sélectionner son parent ni créer un faux marqueur.

## Lecture du parcours

Le résumé distingue les métriques principales des informations secondaires. Les liaisons apparaissent dans un alignement dédié, avec distance, durée, destination et état indisponible éventuel. Les valeurs restent celles de Directions. Les durées de visite demeurent séparées des durées de déplacement.

Les horaires indicatifs des arrêts réutilisent `activityStops`, comme dans l’itinéraire, et portent le signe `≈`. Une durée inconnue empêche d’inventer l’heure des arrêts suivants. La section « Sans coordonnées » est séparée, avec les mêmes boutons accessibles que la liste principale.

Sur ordinateur et tablette, la largeur du panneau s’adapte à l’espace disponible. Sur téléphone, le panneau conserve la hiérarchie dans une portion de la carte et respecte l’espace des attributions. Le recentrage et la consultation d’un lieu tiennent compte du panneau superposé.

Les trajets automatiques à vélo, la sélection de journée commune, l’ordre des visites, les quotas, la déduplication et l’exploration du catalogue restent ceux de la phase 4.12. **La sélection, le survol et le focus n’ajoutent aucun appel Directions.** Aucune migration ni modification des données du voyage.

## Code et validation

| Fichier                                            | Rôle                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/web/src/features/trips/map-sidebar.tsx`      | Header, synthèse, lignes communes, transitions, positions absentes et ajout.           |
| `apps/web/src/features/trips/map-sidebar-model.ts` | Sélection typée, métadonnées, rattachement des transitions et niveaux d’accentuation.  |
| `apps/web/src/features/trips/map.tsx`              | Synchronisation des lignes, marqueurs et tracés ; callback d’arrêt obligatoire.        |
| `apps/web/src/features/trips/workbench.tsx`        | Focus des détails, libellé d’arrêt et retour vers la ligne concernée.                  |
| `apps/web/src/features/trips/workspace.css`        | Hiérarchie, états interactifs, repères et responsive ; suppression des anciens styles. |
| `tests/map-sidebar.test.ts`                        | Dix régressions sur la sélection indépendante, les horaires et les transitions.        |
| `scripts/qa/trips/map-routes.py`                   | Recette réelle Next/PostgreSQL/SSE/Chromium, avec transport Mapbox synthétique.        |

- **755 tests dans 57 fichiers** réussis ; TypeScript, ESLint, formatage et build Next de production validés.
- Recette Carte : 14 groupes de scénarios, clics/Entrée/Espace, parent/arrêt, popup partagée, arrêt sans position, maintien de la sélection pendant le survol, restitution du focus, changements de journée, synchronisation et mobile. Aucun appel Directions supplémentaire pour les interactions.
- Recette historique du catalogue : 26 pages, sans erreur JavaScript.
- Les captures utilisent des identités et des géométries synthétiques ; aucun nouvel appel facturable Mapbox ni écriture dans les voyages de production pour cette recette.

Après compilation dans `.next/map413-qa` :

```sh
NAGI_QA_ROUTES=1 NAGI_QA_DIST_DIR=.next/map413-qa NAGI_QA_PORT=3157 NAGI_QA_OUTPUT=/tmp/nagi-map413-qa node scripts/qa/trips/server.mjs
python3 scripts/qa/trips/map-routes.py --url http://localhost:3157 --output /tmp/nagi-map413-qa
```

Les captures desktop/tablette/mobile, l’état sélectionné et le rapport sont conservés localement dans `artifacts/map413/`, ignoré par Git. La référence visuelle précédente provient de la recette de la phase 4.12.
