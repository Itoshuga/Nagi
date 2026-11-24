# Nagi Image Resolver 3.0 — phase 4.7.5

**Politique actuelle : [bibliothèque fixe de dix photos, sans rechargement](./NAGI_IMAGE_ECONOMY.md).** Les grandes galeries, la pagination et les boutons d’actualisation décrits ci-dessous appartiennent à l’implémentation initiale, remplacée depuis pour réduire les crédits Serper.

Complément : [prévisualisation administrateur en développement, phase 4.7.5.1](./NAGI_IMAGE_PREVIEW.md). La publication en production conserve les vérifications décrites ci-dessous.

Implémentation et validation du 24 novembre 2026. Serper devient la source principale de découverte photographique. Les références découvertes sont conservées dans une galerie privée ; seules les photographies dont les droits sont établis rejoignent le système de publication existant.

## Fonctionnement

1. Réutiliser une couverture importée ou choisie manuellement, puis un résultat positif encore valide du résolveur existant.
2. Pour une nouvelle recherche, consulter les photographies Serper déjà vérifiées et la galerie persistante.
3. Lorsqu’un lieu est consulté ou ajouté et n’a encore aucune galerie, rechercher au maximum une première page Serper. Les résultats ordinaires de l’autocomplete ne lancent pas cette indexation payante.
4. Conserver les références sûres, y compris les sites commerciaux et les images sans licence connue. Vérifier, lorsque possible, les fichiers Commons identifiés dans ces résultats auprès de l’API Commons officielle.
5. Sans photographie publiable, utiliser les fournisseurs existants : Wikidata/P18, image Commons d’une page Wikipedia liée à la même entité, recherche Wikimedia Commons, Openverse, puis pictogramme de catégorie.

Les appels photographiques Mapbox et Foursquare sont retirés du parcours actif. Les helpers et types historiques restent compatibles avec les anciens tests ; leurs indicateurs sont désactivés. Search Box, Places Details géographiques, les coordonnées, la carte et les directions Mapbox sont conservés.

## API Serper et références officielles

Le serveur utilise exclusivement `POST https://google.serper.dev/images`, avec la clé dans l’en-tête `X-API-KEY`. Le corps contient `q`, `gl`, `hl`, `num` et `page`. Aucun appel à cet endpoint et aucune clé Serper ne sont envoyés au navigateur.

Les réponses du compte ont confirmé `num=100`, les pages 1 et 2 et une consommation de **2 crédits par appel réussi** pour les recherches testées. Il s’agit d’une mesure sur ce compte, sans conversion monétaire supposée. Le produit et son exemple de réponse sont consultables sur le [site officiel Serper](https://serper.dev/).

Les [conditions Serper](https://serper.dev/terms) permettent de conserver les informations pour les besoins de l’usage et maintiennent les droits des tiers. La galerie apporte identification du lieu, classement, déduplication et vérification ; elle ne constitue pas un miroir public des résultats bruts. Une URL découverte ne vaut pas autorisation de publier la photographie.

## Pagination, déduplication et cache

- Jusqu’à 100 références sûres par réponse ; aucune suppression selon la licence ou le classement à cette étape.
- Identité du lieu fondée sur la source, le type et l’identifiant stable Nagi ou Mapbox, avec clé SHA-256. Deux établissements homonymes restent distincts.
- Normalisation des URL originales : suppression des paramètres de suivi connus, conservation des signatures et transformations. UUID déterministe par galerie et URL normalisée. Les pages sources supplémentaires sont conservées ; un nom de fichier identique ne suffit pas à fusionner deux photos.
- Métadonnées disponibles conservées : titre, URL originale, miniature, dimensions, source, domaine, page source, URL Google et position. Les champs manquants ne sont pas inventés.
- La recherche utilise le nom, les alias réellement présents et les parents géographiques. Les noms japonais déjà disponibles peuvent produire une variante japonaise ; aucune traduction japonaise n’est inventée. `gl=jp` découle du pays connu. Une variante supplémentaire n’est essayée que si la recherche précédente n’a aucun résultat.
- Le classement combine correspondance du nom et des alias, position Serper et préférence horizontale pour les destinations. Le contexte géographique est inclus dans la requête. Un faible classement ne retire pas la référence de la galerie.
- Chaque réponse est enregistrée avant de demander la suivante. Une session d’indexation s’arrête à la fin réelle des résultats, sans nouvelles références, à la limite configurée, au quota, à une erreur ou à l’annulation.
- Cinq pages par lot par défaut ; « Charger davantage » continue explicitement le même curseur. Plafond absolu de 50 pages par recherche par défaut. Une actualisation volontaire repart de la première page et déduplique avec les références existantes, sous délai minimal et quotas.
- Une galerie déjà enregistrée se consulte sans Serper : 24 références par page visible, filtre sur les titres enregistrés, pages précédente/suivante. Une galerie terminée n’est pas réindexée automatiquement à chaque visite.
- Les caches et révisions des photographies sélectionnées sont réutilisés. Les résultats négatifs et les erreurs conservent leur état ; les échecs temporaires ont un délai de reprise. Aucun problème de chargement d’image ne lance une nouvelle recherche Serper.

« Tous les résultats accessibles » n’apparaît que pour l’épuisement de la recherche. Une limite de pages ou de quota reste signalée comme une recherche pouvant être poursuivie. L’indexation ne prétend jamais récupérer toutes les photographies de Google Images.

## Galerie et choix

La section de couverture des pays, villes, quartiers, catégories, fiches et détails de visite utilise « Modifier la photo » et « Rechercher de nouvelles photos ». Aucun bouton supplémentaire n’est ajouté aux cards ordinaires.

La modale réutilise les composants Nagi : grille responsive, filtre, miniatures paresseuses, navigation, aperçu, provenance et vérification. Le titre, le filtre et les actions restent accessibles pendant le défilement. La grille monte 24 références, pas toute la collection. Son code est chargé séparément des composants ordinaires d’affichage d’image.

Cliquer une référence ouvre ses informations. Une photographie autorisée peut ensuite être confirmée avec « Choisir ». Le choix est optimiste, ciblé, persistant et revient à l’état précédent si l’enregistrement échoue. Un choix manuel garde sa priorité ; une nouvelle couverture importée réinitialise le choix global conformément au comportement existant.

Le choix global d’une fiche et le choix d’une occurrence de voyage restent distincts. Modifier la photo d’une visite ne modifie ni le catalogue ni les autres voyages. Les broadcasts photo passent par le canal privé existant, sans mutation d’horaire, d’ordre, de couleur ou de version du planning.

## Droits, permissions et disponibilité

| Statut               | Comportement                                                                 |
| -------------------- | ---------------------------------------------------------------------------- |
| `unknown`            | Référence privée visible dans la galerie autorisée ; publication impossible. |
| `open_license`       | Licence compatible et preuve exigées ; attribution conservée.                |
| `permission_granted` | Permission explicite documentée ; aucune licence libre inventée.             |
| `restricted`         | Référence conservée pour examen, sans publication.                           |
| `rejected`           | Référence refusée, sans publication.                                         |

La vérification manuelle est réservée aux administrateurs globaux. Le formulaire conserve auteur, licence, lien et preuve. Les licences ouvertes acceptées restent CC0, domaine public, CC BY et CC BY-SA avec lien/version cohérents ; auteur requis pour BY/BY-SA. Les licences NC, ND ou indéterminées ne sont pas transformées en licences ouvertes.

Les écritures de couverture globale exigent le rôle administrateur. Les choix de visite exigent les permissions Discord du voyage et l’appartenance réelle de l’occurrence. Ces contrôles sont exécutés côté serveur et dans les RPC SQL. Les références privées ne sont pas accessibles directement par les rôles `anon` et `authenticated`, y compris par lecture directe d’un administrateur ; l’API vérifie le droit de consulter la galerie.

Les URL ont un état `unknown`, `available` ou `unavailable`. En cas d’échec, le client essaie une alternative déjà autorisée ou le pictogramme. Un signalement utilisateur ne peut pas rendre arbitrairement une photo indisponible pour tous. Un administrateur peut exclure/rejeter une référence ; une photographie Serper retirée de la publication est désactivée dans `external_images`.

Les métadonnées sont affichées comme texte. Les URL malformées, locales, privées, avec identifiants ou schéma dangereux sont refusées ; seules les URL HTTPS publiques sont acceptées. Les recherches serveur utilisent les API officielles, jamais un proxy arbitraire vers les URL d’image. Aucun fichier original n’est téléchargé automatiquement, aucun fichier photo n’est copié dans Storage et aucune wildcard de domaine n’est ajoutée à Next Image. Les références non vérifiées utilisent seulement leur miniature dans la galerie privée.

## Supabase — migration appliquée avec le CLI

Projet lié : **Nagi**, `ynstekndjombxnvjtznt`.

Migration appliquée : `supabase/migrations/20261124110000_serper_image_discovery.sql`, via `npx --yes supabase@latest db push --remote --yes` (CLI 3.3.0). Le mode `--remote` est nécessaire avec cette version du CLI.

| Table / fonction                                     | Adaptation                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image_galleries`                                    | Nouvelle table privée : identité, état, curseur, limites, crédits, bail, reprise et hash de requête. Le texte de recherche généré et le contexte Mapbox ne sont pas conservés. |
| `image_candidates`                                   | Nouvelle table privée : références, sources, classement, droits, preuve, disponibilité, exclusion et signalements.                                                             |
| `external_images`                                    | Table existante étendue aux photographies Serper vérifiées ; aucune référence à droits inconnus ne peut devenir une photographie publique.                                     |
| `place_image_assignments`                            | Table existante étendue aux pays, villes, quartiers, catégories et lieu externe global ; révisions et choix par visite conservés.                                              |
| `private.image_resolver_usage`                       | Compteurs existants réutilisés pour les budgets Serper.                                                                                                                        |
| `reserve_image_discovery` / `finish_image_discovery` | Réservation serveur, concurrence entre instances, déduplication des pages, compteurs et finalisation idempotente sous bail.                                                    |
| `review_image_candidate`                             | Vérification administrateur et création des métadonnées publiables.                                                                                                            |
| `set_catalog_image` / `set_place_image`              | Sélection avec permissions et contrôle de révision ; aucune seconde table de sélection.                                                                                        |

Une sauvegarde de contrôle avant/après a confirmé que toutes les lignes et valeurs préexistantes des 12 tables vérifiées ont été conservées : 1 pays, 1 ville, 1 quartier, 5 catégories, 3 fiches, 3 médias, 1 voyage, 9 journées, 4 activités, 2 arrêts, 2 associations photo et 25 images externes. Le contrôle compare les colonnes antérieures à la migration. L’audit ultérieur a ajouté uniquement la galerie réelle de Tokyo et ses 100 références ; il n’a pas modifié les couvertures choisies ou le voyage.

Les sauvegardes privées et rapports bruts restent dans `artifacts/serper-migration/`, ignoré par Git. Les dumps de données ne doivent pas être publiés.

## Configuration serveur

La clé fournie est configurée dans le `.env` racine ignoré par Git. `.env.example` contient une valeur vide.

| Variable                                | Valeur par défaut / usage                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `SERPER_API_KEY`                        | Secret serveur uniquement.                                                   |
| `SERPER_IMAGES_ENABLED`                 | `true` ; nécessite une clé et le résolveur actif.                            |
| `SERPER_IMAGES_PAGE_SIZE`               | `100`, au maximum 100.                                                       |
| `SERPER_IMAGES_MAX_PAGES`               | `5` par lot explicite.                                                       |
| `SERPER_IMAGES_MAX_TOTAL_PAGES`         | `50` par recherche, plafond configurable au maximum 100.                     |
| `SERPER_IMAGES_MAX_CONCURRENT_REQUESTS` | `2` travaux Serper simultanés entre instances.                               |
| `SERPER_IMAGES_GLOBAL_DAILY_LIMIT`      | `200` réservations par jour.                                                 |
| `SERPER_IMAGES_USER_DAILY_LIMIT`        | `30` réservations par utilisateur et par jour.                               |
| `SERPER_IMAGES_USER_MINUTE_LIMIT`       | `6` réservations par utilisateur et par minute.                              |
| `SERPER_IMAGES_REFRESH_SECONDS`         | `900` secondes avant une nouvelle actualisation.                             |
| `NAGI_IMAGE_RESOLVER_ENABLED`           | `true` ; désactiver arrête les nouvelles recherches, sans effacer les choix. |
| `NAGI_IMAGE_MAX_CONCURRENT_REQUESTS`    | `2` requêtes fournisseur simultanées par processus et file client.           |
| `NAGI_IMAGE_DIAGNOSTICS`                | `false` ; diagnostics agrégés facultatifs, sans secret ni contexte du lieu.  |

Les budgets comptent les réservations de requête, y compris les tentatives échouées ; ils ne représentent pas une facture. Les crédits effectivement retournés sont enregistrés séparément. Au tarif observé de 2 crédits par page, le plafond global de 200 requêtes correspondrait à 400 crédits pour 200 réponses comparables réussies.

`MAPBOX_PHOTOS_ENABLED`, `MAPBOX_PLACES_PHOTOS_ENABLED` et `FOURSQUARE_PHOTOS_ENABLED` sont désactivés. Les tokens géographiques Mapbox, le User-Agent/contact Wikimedia et la configuration Openverse existants sont conservés. Reprendre ces variables serveur dans l’hébergement lors du déploiement et redémarrer le processus local après modification du `.env`.

## Erreurs et consommation

Les appels Serper ont un timeout de 12 secondes, des réponses JSON bornées à 2 Mo et refusent les redirections. Une erreur n’entraîne pas de boucle de requêtes payantes. Les réponses 429/402 appliquent un délai de reprise ; 401/403 signalent une configuration indisponible. Les références déjà enregistrées restent consultables. Le bail de 45 secondes peut être repris après l’arrêt d’une instance ; une finalisation avec un ancien bail ne remplace pas le résultat courant.

Les erreurs des sources libres laissent les références Serper privées en attente de vérification. Les sources ouvertes restent utilisables si Serper est indisponible. Les originaux tiers peuvent expirer ou refuser le hotlinking ; leur affichage n’est pas garanti.

## Validation réelle et consommation observée

Chaque recherche ci-dessous a retourné 100 résultats bruts sur sa première page. Le compte a accepté `num=100`. Les colonnes de références uniques indiquent le résultat de la validation d’URL et de la déduplication, sans filtrage de licence.

| Lieu                   | Références sûres uniques, première page |
| ---------------------- | --------------------------------------: |
| Japon                  |                                     100 |
| France                 |                                      96 |
| Kamakura               |                                      99 |
| Tokyo                  |                                     100 |
| Kyoto                  |                                      99 |
| Paris                  |                                     100 |
| Shibuya                |                                      99 |
| Asakusa                |                                     100 |
| Shinjuku               |                                     100 |
| Sensō-ji               |                                     100 |
| Shibuya Parco          |                                     100 |
| Pokémon Center SHIBUYA |                                     100 |
| Shibuya Sky            |                                      97 |
| Tokyo Tower            |                                      98 |

Kamakura a également retourné 100 résultats bruts sur la page 2. **15 appels réussis au total, 30 crédits retournés** : 2 appels de vérification Kamakura (4 crédits) et 13 appels complémentaires (26 crédits). Aucun appel supplémentaire n’a été nécessaire pour relire la première page de Kamakura dans l’audit.

La recherche Tokyo a utilisé les véritables données du catalogue et le service d’indexation de l’application : **100 références persistées, 24 retournées par page de galerie, une seule requête Serper d’indexation, zéro requête Serper pour relire, paginer ou retenter l’indexation automatique**. Aucun choix manuel de couverture n’a été effectué sur les données réelles. La vérification des choix, des permissions et des conflits utilise une base PostgreSQL et un voyage de test isolés.

Les autres recherches réelles sont des audits du provider, sans création de fausses fiches dans le catalogue. Les photographies n’ont pas été téléchargées pour cet audit ; ces résultats valident la découverte, sans certifier la pertinence visuelle ou les droits de chaque résultat.

## Tests et vérifications

- **592 tests passent dans 43 fichiers**, dont **123 tests PostgreSQL** avec toutes les migrations.
- Provider : endpoint/en-tête, pagination, 100 références commerciales conservées, URL dangereuses refusées, déduplication prudente, alias réellement connus, clé réfléchie par un fournisseur rejetée, absence de retry payant sur 429.
- Base : RLS et droits RPC, aucune publication inconnue, baux concurrents et périmés, budgets et cooldown, limite de lot distincte de l’épuisement, reindexation sans écrasement des droits, sélection persistante, choix par visite indépendants, couverture importée prioritaire.
- Session : mises à jour optimistes, retour arrière, choix manuel protégé, alternatives autorisées en cas d’image cassée, compatibilité des anciennes images temporaires.
- Navigateur réel avec composants React et transport fournisseur simulé : galerie de 80 références, 24 montées par page, filtre, précédent/suivant, publication interdite avant vérification, validation d’une permission puis confirmation, provenance et crédits, absence d’appel d’indexation pendant la consultation et le choix. Captures desktop et mobile 390 px sans débordement. Le parcours vérifie également calendrier, carte et glisser-déposer. Aucune erreur JavaScript observée.
- TypeScript racine et tous les workspaces, ESLint sans avertissement, formatage Prettier, conformité des types SQL et build Next.js de production réussis. Build dans `.next/serper-images-qa`, sans arrêter le serveur de développement.
- Contrôle de la clé dans les sources livrables et les fichiers JavaScript du navigateur. Aucun ajout de clé réelle aux fichiers versionnables.

Les fallbacks Wikidata/Commons/Openverse sont couverts par les tests simulés existants. Le succès réseau réel d’Openverse n’a pas été réaffirmé dans cette phase ; l’audit historique avait rencontré un timeout. Les captures de galerie utilisent des images synthétiques, sans prétendre montrer les photographies réelles de tous les lieux.

## Fichiers principaux

| Domaine                    | Fichiers créés ou adaptés                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Découverte                 | `apps/web/src/features/images/serper.ts`, `discovery.ts`, `config.ts`, `http.ts`, `diagnostics.ts`                                                                        |
| Résolveur et API existants | `apps/web/src/features/images/server.ts`, `route.ts`, `model.ts`, `providers.ts`, `matching.ts`                                                                           |
| Galerie et sélection       | `apps/web/src/features/images/gallery.tsx`, `components.tsx`, `session.ts`                                                                                                |
| Affichage partagé          | `apps/web/src/features/integrations/mapbox/place-image.tsx`, `features/images/place-placeholder.tsx`                                                                      |
| Catalogue administrable    | `apps/web/src/features/geography/{cover,discover,admin-form,admin-list,admin-detail}.tsx`, `features/categories/pages.tsx`, `features/entries/form.tsx`                   |
| Base                       | `supabase/migrations/20261124110000_serper_image_discovery.sql`, `packages/database/src/database.types.ts`                                                                |
| Configuration              | `.env.example` ; `.env` local ignoré                                                                                                                                      |
| Tests et audit             | `tests/serper-images.test.ts`, `tests/image-provider-pipeline.test.ts`, tests cache/session/route/base, `tests/browser/mapbox-places.mjs`, `scripts/qa/images/serper.mjs` |
| Documentation              | Ce rapport ; liens depuis les rapports 1.0 et 2.0, conservés comme historique.                                                                                            |

L’audit Serper est volontaire et borné : `NAGI_IMAGE_LIVE_QA=1 node scripts/qa/images/serper.mjs`. Il reprend les résultats locaux existants pour éviter les appels redondants. Il utilise la ville Tokyo et un administrateur déjà présents pour vérifier la persistance des références ; il n’importe pas de photographie ni de couverture de démonstration.
