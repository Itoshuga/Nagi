# Migration Mapbox — 23 novembre 2026

## Résultat et périmètre

L’intégration active de Google Maps Platform est remplacée par Mapbox. Le catalogue éditorial, les permissions Discord, la planification multisource, les occurrences indépendantes, les arrêts, les couleurs et la file de mutations sont conservés. Aucun moteur de trajets, aucune distance ni durée calculée automatiquement n’est ajouté.

La carte utilisait déjà Leaflet. Ce moteur est conservé avec les **tuiles Mapbox Streets v12**, `tileSize: 512`, `zoomOffset: -1`, le logo officiel non modifié et les liens d’attribution. Cette utilisation est documentée dans la [documentation Static Tiles](https://docs.mapbox.com/api/maps/static-tiles/) et le [guide d’attribution](https://docs.mapbox.com/help/dive-deeper/attribution/). Le changement de fond évite d’associer les points d’intérêt Mapbox à un autre fournisseur cartographique.

## Audit et conservation des données

Point de départ : `ced978d`. Branche de travail : `codex/mapbox-migration`. Une sauvegarde Git complète a été créée avant modification.

L’audit distant a trouvé **zéro activité Google, zéro arrêt Google et zéro référence éditoriale Google**. Six références techniques de vérification existaient ; elles ont été archivées dans une table privée sans exposition RPC ni accès direct des rôles API.

Les sauvegardes locales sont exclues de Git dans `artifacts/mapbox-migration/`. Elles comprennent le bundle source, les données de planification, les fonctions SQL et les anciennes tables techniques. Les fichiers contenant des données sont protégés par les permissions du système de fichiers. Il ne s’agit pas d’un nouveau cache de contenu fournisseur.

Deux migrations ont été testées, simulées puis appliquées au projet Supabase Nagi lié :

- `20261123103000_mapbox_provider.sql` : archive technique, retrait des structures actives précédentes, sources `nagi | mapbox | custom`, références externes, contraintes, fonctions de vérification, limites et administration.
- `20261123143000_mapbox_reference_grants.sql` : autorisations distinctes par membre, identifiant et recherche saisie. Deux onglets qui cherchent le même lieu ne peuvent plus écraser leur autorisation respective avant la sauvegarde.

Les migrations historiques déjà appliquées restent immuables. Aucun Google Place ID n’est converti en Mapbox ID. Le chemin de conversion des anciennes occurrences est néanmoins testé avec de vraies lignes dans PostgreSQL embarqué : une référence sans correspondance devient une étape à réassocier, sans copie du contenu Google et sans changement d’identité, de parent, de notes, d’horaire, de durée, de couleur, de version ou d’horodatage. Les événements rejouables sont normalisés ; les reçus d’idempotence sont conservés.

Comparaison distante immédiatement après la migration principale :

| Données               | Avant | Après | Champs existants conservés |
| --------------------- | ----: | ----: | -------------------------- |
| Voyages               |     1 |     1 | Oui                        |
| Journées              |     9 |     9 | Oui                        |
| Activités             |     2 |     2 | Oui                        |
| Arrêts                |     1 |     1 | Oui                        |
| Organisateurs         |     1 |     1 | Oui                        |
| Couleurs personnelles |     0 |     0 | Oui                        |

Les trois occurrences distantes sont toujours `nagi`. La vérification SQL ne trouve plus de colonne `google_place_id`, de RPC Google ni de fonction active dépendant de Google. Les quatre nouvelles tables privées sont sous RLS ; un membre ne peut pas réserver de quota ou certifier une référence. La migration complémentaire ne modifie aucune donnée de voyage. Une relecture finale a constaté des événements applicatifs ultérieurs, à 14:41–14:42 UTC : le statut, la version (149 → 152) et l’horodatage du voyage ont évolué. Cet état courant a été conservé. Les journées, activités, arrêts et leurs champs restent identiques à la sauvegarde.

## Recherche, résolution et affichage

`CatalogPlace` est un modèle de présentation commun aux fiches éditoriales, aux étapes libres et aux résultats externes. Le dossier `apps/web/src/features/integrations/mapbox/` contient l’adaptateur HTTP, la normalisation, les preuves signées, les sessions interactives et la présentation temporaire. Le plan durable n’utilise jamais une fiche Mapbox comme une fiche éditoriale.

- L’onglet Mapbox est seul à lancer la recherche externe. La frappe appelle `suggest` après 300 ms, à partir de trois caractères par défaut. Les requêtes dépassées sont annulées et leurs réponses ignorées. La liste est limitée à six résultats côté fournisseur, serveur et navigateur.
- Lorsqu’aucun titre ne correspond exactement à la saisie, un seul complément `forward` est lancé après 600 ms supplémentaires sans nouvelle frappe. Cela permet notamment de retrouver Sensō-ji à Asakusa malgré les suggestions latines imprécises. Une nouvelle frappe, une sélection ou la fermeture annule ce complément ; aucun Details ni autre fournisseur n’est sollicité.
- Entrée, la loupe ou l’action de recherche explicite appellent immédiatement `forward`. Le démarrage attend la disponibilité du service afin qu’une recherche validée immédiatement ne soit pas écrasée par les suggestions initiales.
- Une suggestion sélectionnée utilise le UUID de son parcours pour `retrieve`. La sélection suivante renouvelle la session avant sa nouvelle paire `suggest`/`retrieve`. Les sélections concurrentes sont sérialisées et dédupliquées.
- Un résultat `forward` possède déjà son point ; l’ajout n’exige pas un appel Details supplémentaire.
- La réouverture d’une référence utilise la recherche saisie lors de son ajout et vérifie **l’identifiant exact** dans `forward`. Si cet ID n’y apparaît pas, une nouvelle paire cohérente `suggest`/`retrieve` est essayée, avec comparaison exacte préalable. Aucune adresse voisine ni établissement ressemblant ne remplace silencieusement la référence.
- Un titre strictement égal à la recherche, après normalisation de casse, accents et ponctuation, passe devant une réponse administrative plus large. Les autres résultats gardent leur ordre relatif. Les villes, quartiers et adresses portent leur véritable type.
- La destination et les coordonnées Nagi déjà disponibles servent de proximité douce. Aucun pays ou rectangle ne restreint la recherche et aucune position réelle de l’utilisateur n’est demandée. Les recherches japonaises utilisent `ja` pour les écritures japonaises et `en` pour les requêtes latines.

Le champ de recherche, les cartes React, les miniatures, le menu, le clavier et le DragOverlay restent ceux de Nagi. Les images absentes ont un pictogramme de catégorie, sans appel payant destiné à remplir chaque miniature. La résolution du point précède toute occurrence optimiste. Les dépôts utilisent les mêmes cibles : timeline, journées, À organiser, calendrier et activité principale.

Itinéraire, calendrier et carte utilisent la présentation active commune. Les informations visibles sont résolues à la demande et les demandes simultanées sont dédupliquées. Un changement d’horaire ou de couleur ne lance pas de requête fournisseur. Le calendrier conserve sa grille, ses couleurs pastel, ses dimensions temporelles, ses vues et ses interactions ; les contraintes propres aux anciens widgets ont disparu.

## Couverture réelle et limites japonaises

Les services ont été essayés avec les **tokens existants**, sans demander un nouveau compte ni un token secret `sk.`. La [documentation Search Box](https://docs.mapbox.com/api/search/search-box/) annonce principalement les États-Unis, le Canada et l’Europe. Les observations japonaises ci-dessous décrivent le compte et la date de cet essai ; elles ne constituent pas une garantie de couverture mondiale. Le [guide japonais](https://docs.mapbox.com/help/troubleshooting/japan-specific-considerations-search-api/) décrit également des particularités de données et d’écriture.

Essais `forward` avec `types=poi`, une proximité adaptée et sans filtre de pays, limite de cinq résultats :

| Recherche saisie                    | HTTP | Résultats |
| ----------------------------------- | ---: | --------: |
| Sensō-ji                            |  200 |         3 |
| Senso-ji                            |  200 |         4 |
| 浅草寺                              |  200 |         5 |
| Pokémon Center SHIBUYA              |  200 |         1 |
| Shibuya Parco                       |  200 |         5 |
| 渋谷PARCO                           |  200 |         5 |
| Shibuya Sky                         |  200 |         5 |
| Nintendo TOKYO                      |  200 |         1 |
| Tokyo Tower                         |  200 |         5 |
| Shinjuku Gyoen                      |  200 |         5 |
| Fushimi Inari                       |  200 |         5 |
| Kiyomizu-dera                       |  200 |         5 |
| Osaka Castle                        |  200 |         5 |
| Empire State Building — contrôle US |  200 |         5 |
| Tour Eiffel — contrôle européen     |  200 |         5 |

Les noms ont été relus temporairement pour évaluer la pertinence. Les résultats comprennent bien les établissements recherchés, mais ils comportent aussi des doublons, des commerces dans un centre commercial et des lieux voisins. Pour Fushimi Inari, la gare précède le sanctuaire. Une liste comportant plusieurs résultats ne signifie donc pas plusieurs réponses équivalentes.

L’autocomplétion latine japonaise est nettement moins fiable : `Pokémon Center SHIBUYA` propose notamment des quartiers ; `Shibuya Parco` propose d’autres quartiers ; `Sensō-ji` peut remonter des établissements éloignés. `浅草寺` produit des suggestions japonaises pertinentes et une récupération avec sa session réussit. Une suggestion n’est jamais présentée comme le lieu demandé par simple approximation.

Les IDs issus de `forward` pour 浅草寺, Pokémon Center SHIBUYA et Shibuya Parco n’étaient pas présents dans leurs listes `suggest`. Leur réouverture **par ID exact dans une nouvelle recherche validée fonctionne** dans les trois cas. Cette différence entre services est prise en charge explicitement.

Les détails enrichis de ces références japonaises répondent 404 ou 422 sur le compte testé. La recherche et les coordonnées de base restent disponibles. Un contrôle américain de Places Details a répondu 200 avec nom, horaires et site, sans photographie. Aucun de ces résultats ne justifie une promesse de Details ou de photos pour tous les établissements. En cas de résultat absent ou de référence disparue, l’utilisateur peut rechercher à nouveau, réassocier ou créer une étape personnalisée ; la planification demeure accessible.

## Persistance, médias et coûts

Les [Product Terms Mapbox du 20 octobre 2026](https://www.mapbox.com/legal/product-terms), §2.7.6, prévoient la conservation des Mapbox Feature IDs, dont `mapbox_id`, pour les usages internes autorisés. Cette permission ne porte pas sur les coordonnées ou les fiches complètes. Les données de recherche temporaire ne sont pas transformées en données permanentes via Geocoding.

La base et les intentions durables conservent seulement la référence, la recherche saisie indépendamment par le membre et les données de planification. Les noms, adresses, coordonnées, horaires et images du fournisseur restent dans la présentation active en mémoire, sans Next Data Cache, cache HTTP, IndexedDB, localStorage de contenu fournisseur, Supabase Storage ou journal Realtime. La session est vidée lorsque le voyage est quitté. Les coordonnées servent à positionner les marqueurs, sans affichage numérique direct.

Les [Places Details](https://docs.mapbox.com/api/search/places/) sont en Public Preview et restent facultatifs. Leur plafond annoncé est de 1 000 enregistrements par mois et par compte. Le plafond Nagi par défaut est de 900 ; il ne mesure pas les autres applications utilisant le même compte. L’interface garde les informations de base si l’enrichissement échoue.

Le §2.7.7 des Product Terms ne confère pas les droits sur une photographie du seul fait de fournir son URL. `MAPBOX_PHOTOS_ENABLED=false` est donc le comportement par défaut. L’activation suppose des droits d’affichage et d’attribution adaptés aux médias concernés ; elle ne télécharge pas les photographies dans Nagi. Un accord complémentaire serait nécessaire pour conserver durablement des fiches ou médias au-delà des droits existants.

Les limites Nagi sont atomiques en SQL : 60 requêtes/minute/membre, 500/jour/membre, 5 000/jour au total, 8/seconde au total et le plafond mensuel Details. Les compteurs distinguent suggest, forward, retrieve et details. Ils mesurent les tentatives serveur réservées, pas la facture Mapbox ni les tuiles chargées directement par le navigateur. Les limites et les restrictions du compte Mapbox restent distinctes.

## Sécurité et configuration

`MAPBOX_ACCESS_TOKEN` reste exclusivement côté serveur. `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` sert aux tuiles navigateur. `MAPBOX_ENABLED` et les plafonds figurent dans `.env.example` et sont correctement pris en compte par Turborepo. Les anciennes variables cartographiques ont été retirées du `.env` local, de l’exemple et du code actif.

Les routes vérifient session, appartenance Discord, accès au voyage, origine exacte, taille et forme de la requête. Une référence nouvelle est signée pour le membre, le voyage, l’ID et la recherche. La sauvegarde exige un point préalablement confirmé et une autorisation serveur récente. Un lecteur peut consulter les références du voyage mais ne peut pas les modifier. Les endpoints Mapbox sont fixes, les IDs sont encodés et les réponses ne dévoilent ni token serveur, ni erreur brute du fournisseur.

Le token Browser existant accepte `localhost:3000` : une tuile 512 × 512 a effectivement chargé dans Chromium sur cette origine. Il refuse le port isolé `3121` par HTTP 403 ; le navigateur signale alors ORB. La recette sur ce port vérifie les points, marqueurs et attributions, sans prétendre y avoir chargé le fond de carte. Les restrictions ont été respectées. Ajouter les origines de déploiement souhaitées dans Mapbox avant de les utiliser.

## Vérifications et reproduction

- **459 tests Vitest réussis dans 34 fichiers**, lint sans avertissement, vérification TypeScript, conformité des types SQL et compilation de production.
- PostgreSQL embarqué avec toutes les migrations : conservation d’anciennes données, RLS et refus entre espaces, références longues, grants liés au membre et à la recherche, concurrence entre onglets, répétitions indépendantes, imbrication/détachement, idempotence, quotas et administration.
- Recette Chromium avec transport Mapbox simulé et vrais composants Nagi : recherche inactive, clavier, recherche immédiate pendant l’initialisation, dépôt direct et répété, arrêt imbriqué, créneau, carte, détails, changement de vue sans nouvel appel, échec de résolution, état vide, quota et formats 320/390/834/1 280 px. Aucune exception JavaScript ni requête Google détectée.
- Recette calendrier sur les routes de production et PostgreSQL isolé : alignement, horaires, fuseau japonais, événements courts/longs/chevauchés, couleurs, modification, suppression confirmée, déplacement, redimensionnement, Échap, échec ciblé, mobile, thème sombre et réduction des animations.
- Deux comptes de démonstration : 20 changements de couleur confirmés, modifications distinctes simultanées, conflit sur une propriété, reprise hors ligne, rollback ciblé et navigation avec sauvegarde en cours.
- APIs réelles : recherches listées, sessions suggest/retrieve, réouverture exacte de trois références japonaises, Details et tuiles.
- Parcours réel intégré : recherche de Pokémon Center SHIBUYA, dépôt d’une référence vérifiée, sauvegarde par les routes de production et SQL/RLS, rechargement complet, résolution par un second membre, propagation de sa note via le journal privé et marqueur sur la carte. Les identités Discord et la base de cette recette sont synthétiques ; aucun voyage distant n’y est modifié.

Les commandes habituelles sont dans `docs/INTEGRATION.md`. Les recettes réelles sont volontaires et bornées :

```sh
NAGI_MAPBOX_LIVE_QA=1 node scripts/qa/mapbox/live.mjs
NAGI_QA_MAPBOX_LIVE=1 NAGI_QA_PORT=3121 NAGI_QA_OUTPUT=/tmp/nagi-mapbox-live-qa pnpm exec dotenv -e .env -- node scripts/qa/trips/server.mjs
python3 scripts/qa/mapbox/browser.py --url http://localhost:3121 --output /tmp/nagi-mapbox-live-qa
```

La recette `scripts/qa/mapbox/autocomplete.py` vérifie aussi les écritures « Senso-Ji », « Senso-ji » et « Sensō-ji » sans Entrée : le temple d’Asakusa apparaît dans les trois cas, avec 4, 4 et 3 résultats. Une recherche « Tokyo » retourne six résultats. Le complément vide conserve les suggestions initiales ; aucune reprise automatique n’est effectuée après une erreur.

Les rapports privés sont dans `artifacts/mapbox-migration/` et les répertoires temporaires de recette. Les réponses de fiches et les tokens ne sont pas enregistrés dans les rapports de couverture. Les captures visuelles utilisent uniquement des données synthétiques.

## Suite de déploiement et point de retour

Les deux migrations sont appliquées. Redémarrer `pnpm dev` pour reprendre la nouvelle configuration locale. Pour un autre environnement, appliquer les migrations avant le nouveau web, configurer les tokens et les origines autorisées, puis compiler et redémarrer.

La révocation des anciennes clés dans Google Cloud reste une opération manuelle : aucun accès d’administration Cloud n’est disponible dans cet environnement. Elles ne sont plus utilisées par le projet. Les valeurs ont été retirées du `.env` local, sans prétendre les avoir révoquées chez le fournisseur.

Le bundle et les sauvegardes précédant la migration constituent le point de retour technique. Une restauration de schéma nécessite une opération explicite à partir de ces sauvegardes ; aucun retour automatique ni réactivation silencieuse de Google n’est prévu. Aucun commit n’a été créé pendant cette intervention.
