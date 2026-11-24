# Nagi Image Resolver 2.0 — phase 4.7.4

Rapport historique, remplacé par [Nagi Image Resolver 3.0 — Serper et galerie persistante](./NAGI_IMAGE_RESOLVER_3.md). Les providers photographiques Mapbox et Foursquare décrits ici ne font plus partie du parcours actif.

État livré et audité le 24 novembre 2026. Le résolveur existant et ses routes sont conservés. Aucun nouveau résolveur indépendant, aucune migration SQL et aucune écriture sur les voyages réels.

## Fonctionnement livré

1. Une couverture importée ou une photographie explicitement choisie garde la priorité. Une association libre automatique encore valide est réutilisée à la réouverture.
2. En l’absence d’image prioritaire, le provider Mapbox peut interroger Places Details pour un ID confirmé et un contexte géographique signé. Il exige sa configuration et une autorisation d’utilisation renseignée.
3. Sans photo Mapbox exploitable, le résolveur réutilise Wikidata/P18, Wikipedia, Commons et Openverse. Openverse peut compléter des propositions Commons ambiguës ; une bonne sélection arrête la chaîne.
4. Foursquare dispose d’un contrat d’adaptateur typé et d’un diagnostic de configuration, mais **aucun adaptateur réseau Foursquare n’est installé**. Cette intégration facultative ne fait aucun appel et reste désactivée.
5. Sans image pertinente, le pictogramme de catégorie reste visible dans les dimensions habituelles.

Les sources libres restent actives. **Les photos Mapbox restent désactivées dans le `.env` livré**, faute d’autorisation documentée couvrant leurs sources. La présence d’une URL renvoyée par une API n’a pas été assimilée à une licence photographique.

## Deux politiques de conservation

| Images                                   | Conservation et choix                                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commons, Wikipedia et Openverse vérifiés | Tables `external_images`, `image_resolution_cache` et `place_image_assignments` existantes ; licences et révisions conservées.                        |
| Mapbox et futur adaptateur Foursquare    | Type `ProviderImage`, `usageRights: provider-restricted`, aucune licence libre fabriquée, aucune URL écrite dans les tables d’images ou dans Storage. |

Un candidat Mapbox conserve uniquement son affichage en mémoire pendant la session, au maximum dix minutes, durée réductible selon l’autorisation applicable. L’expiration retire ses URLs des enregistrements client et revient au pictogramme sans relancer une requête. Ce délai technique n’est pas une affirmation d’un droit de cache accordé par Mapbox.

La modale distingue « Choisir cette image » pour les images libres et « Utiliser pour cette session » pour les images fournisseur. Le second choix ne fait aucune mutation serveur et concerne uniquement la visite affichée par cet utilisateur. Il ne constitue pas une personnalisation collaborative persistante. Les permissions de choix persistant et les révisions photo existantes restent appliquées par les RPC habituels.

Les crédits indiquent la plateforme et la source ; aucun auteur absent n’est inventé. Les photographies fournisseur utilisent `object-contain` par défaut. Un recadrage nécessite une autorisation configurée. L’URL directe fournie sert au chargement paresseux ; aucune miniature, URL de transformation ou redimensionnement fournisseur n’est inventé.

## Contrôle de pertinence et sécurité

- ID Mapbox exact, nom compatible, lieu actif et coordonnées cohérentes à 250 mètres maximum.
- Logos, menus, produits, affiches, URL SVG/GIF/PDF et images trop petites avec dimensions connues sont écartés. Les dimensions absentes ou `null` sont acceptées.
- Les façades, bâtiments et intérieurs identifiés dans les métadonnées sont classés avant les fichiers indéterminés. Ces derniers restent des propositions manuelles. Ce classement porte sur les métadonnées, sans analyse visuelle automatique du contenu.
- Origines HTTPS exactes autorisées, sans identifiants d’accès, URL locale ou adresse privée. Les requêtes serveur restent dirigées uniquement vers les API officielles ; aucun téléchargement ni proxy des images externes.
- Réponses JSON Places bornées à 2 Mo, redirections refusées, token serveur absent des réponses client. Aucune wildcard ajoutée à `next/image`.
- La gare voisine de Fushimi Inari est désormais rejetée pour une demande de sanctuaire. Les suffixes religieux multilingues sont reconnus. Des photographies d’anciens lieux homonymes ne sont plus proposées pour la boutique « Les Fleurs ».
- Les anciens caches négatifs/ambigus sont réévalués une fois avec `matcher-v3`. Les associations automatiques présentant une contradiction de catégorie sont invalidées ; les choix manuels sont préservés.

## Charge et quotas

La recherche Mapbox et son autocomplete ne sont pas modifiés. Le délai client de 850 ms et l’observation de visibilité restent actifs. Les résolutions sortantes partagent une concurrence configurable, deux par défaut. Les baux Supabase existants limitent en complément à deux les travaux simultanés du résolveur libre entre instances ; augmenter la concurrence HTTP ne supprime pas ce garde-fou.

Les photos Places ciblent les visites enregistrées et les détails explicitement ouverts. Une localisation confirmée est attendue avant l’appel. Aucun appel photo Places n’est fait pour les résultats visibles ordinaires par défaut. Une option permet de l’autoriser avec le même budget partagé.

Les détails de lieu et le provider photographique partagent les requêtes simultanées d’un même utilisateur et d’un même ID. Les visites répétées partagent une résolution photographique en cours ; les résultats fournisseur ne sont pas conservés dans un cache serveur de réponses. Les échecs récents sont mémorisés cinq minutes sous une clé hachée, sans métadonnées du lieu ni URLs.

Le provider réutilise `reserve_mapbox_places` et `MAPBOX_DETAILS_MONTHLY_LIMIT` : **900 tentatives par défaut**, communes aux panneaux de détails et aux photos. Ce compteur conservateur réserve aussi les tentatives qui échouent ; il ne représente pas la facture Mapbox. Le quota Public Preview publié est de **1 000 enregistrements retournés par mois et par compte**. Les appels groupés n’ont pas été activés : les demandes sont progressives et ciblées, et un batch ne réduit pas le nombre d’enregistrements facturables.

Une réponse 429, 401 ou 403 bloque les nouveaux appels Details du processus pendant au moins une heure, avec prise en compte de `Retry-After`. Search Box, les sources libres et le planificateur continuent de fonctionner. La réservation SQL partagée reste l’autorité de budget entre instances ; le coupe-circuit HTTP est local à chaque processus.

Des compteurs serveur agrégés mesurent demandes, résultats, erreurs, fallbacks, latences et enregistrements Places effectivement retournés. Les diagnostics optionnels ne contiennent aucun token, nom de lieu, URL, recherche, coordonnée ou identité de membre. Ils ne sont pas une estimation de facture et ne sont pas persistés entre redémarrages.

## Configuration

Le contact Wikimedia local a été rétabli à la demande de l’utilisateur avec l’adresse déjà configurée dans l’identité Git du projet, sans l’afficher dans le chat. Il est enregistré dans `WIKIMEDIA_CONTACT_EMAIL`, fichier `.env` ignoré par Git. Aucun token Mapbox n’a été remplacé.

| Variable                                                 | Usage / valeur livrée                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `WIKIMEDIA_CONTACT_EMAIL`                                | Contact alternatif au `NAGI_IMAGE_USER_AGENT` existant ; ne pas remplacer un contact opérationnel.       |
| `NAGI_IMAGE_RESOLVER_ENABLED`                            | `true` ; `false` suspend les nouvelles recherches sans effacer les choix existants.                      |
| `NAGI_IMAGE_MAX_CONCURRENT_REQUESTS`                     | `2` par défaut ; plafond de requêtes sortantes et de file client, de 1 à 20.                             |
| `NAGI_IMAGE_DIAGNOSTICS`                                 | `false` ; activer en développement pour les diagnostics anonymes.                                        |
| `MAPBOX_PLACES_PHOTOS_ENABLED`                           | `false` tant que les droits ne sont pas établis.                                                         |
| `MAPBOX_PLACES_PHOTO_RIGHTS_REFERENCE`                   | Référence serveur de l’accord ou de l’autorisation couvrant les sources autorisées. Vide par défaut.     |
| `MAPBOX_PLACES_PHOTO_ALLOWED_ORIGINS`                    | Liste d’origines HTTPS exactes couvertes par l’autorisation, séparées par des virgules. Vide par défaut. |
| `MAPBOX_PLACES_PHOTO_CROPPING_ALLOWED`                   | `false`, à modifier uniquement si autorisé.                                                              |
| `MAPBOX_PLACES_PHOTO_SESSION_SECONDS`                    | `600` au maximum, à réduire si nécessaire selon le contrat.                                              |
| `MAPBOX_PLACES_PHOTOS_VISIBLE_RESULTS`                   | `false` ; les résultats ordinaires ne dépensent pas de quota photo Places.                               |
| `MAPBOX_DETAILS_MONTHLY_LIMIT`                           | Budget partagé existant, `900` par défaut.                                                               |
| `FOURSQUARE_PLACES_API_KEY`, `FOURSQUARE_PHOTOS_ENABLED` | Clé vide et `false` ; contrat préparé, adaptateur réseau non installé.                                   |

`MAPBOX_PHOTOS_ENABLED` est un ancien indicateur ; il ne suffit plus à activer l’affichage de photographies via le panneau de détails. Le résolveur est désormais l’unique chemin de sélection photo Mapbox.

Les paramètres existants de Mapbox, du User-Agent et d’Openverse sont conservés. Les ajouts locaux n’écrasent aucune valeur présente. Les variables sont documentées dans `.env.example` ; seules les nouvelles valeurs nécessaires doivent être reprises dans l’hébergement.

## Audit réel de couverture

Audit de métadonnées sur **14 lieux** : neuf au Japon et cinq en France. Aucun compte Discord réel utilisé, aucune écriture Supabase, aucun téléchargement de photographie fournisseur et aucune conservation de ses URLs.

| Lieu                   | Places observé                                                               | Résultat libre final                             |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Sensō-ji               | 422                                                                          | Photo d’entité, CC0                              |
| Tokyo Tower            | 422                                                                          | Photo d’entité, CC BY-SA                         |
| Shibuya Parco          | 422                                                                          | Photo d’entité, CC BY-SA                         |
| Pokémon Center SHIBUYA | 422                                                                          | Photo d’entité, CC BY                            |
| Nintendo TOKYO         | 422                                                                          | Photo d’entité, CC BY                            |
| Shibuya Sky            | 422                                                                          | Photo d’entité, CC BY-SA                         |
| Shinjuku Gyoen         | 422                                                                          | Photo d’entité, CC BY-SA                         |
| Fushimi Inari          | Pas de correspondance nominale suffisante lors de l’audit Search Box initial | Photo du sanctuaire, CC0, après rejet de la gare |
| Kiyomizu-dera          | 422                                                                          | Photo d’entité, CC BY-SA                         |
| Tour Eiffel            | 200, aucune photo                                                            | Commons confirmé géographiquement, CC BY-SA      |
| Musée du Louvre        | 200, aucune photo                                                            | Photo d’entité, CC BY                            |
| Château de Versailles  | 200, aucune photo                                                            | Commons confirmé géographiquement, CC BY-SA      |
| Le Petit Cler, Paris   | 200, trois références photo, dimensions absentes                             | Aucune photographie libre fiable ; pictogramme   |
| Les Fleurs, Paris      | 200, cinq références photo                                                   | Propositions homonymes rejetées ; pictogramme    |

Résultat : **12 sélections automatiques libres**, deux fallbacks, huit références photographiques Mapbox disponibles pour les deux commerces mais **non autorisées à l’affichage par la configuration livrée**. La disponibilité des références ne prouve ni la qualité visuelle de chaque image ni ses droits de réutilisation. Les miniatures de tous les lieux réels n’ont pas fait l’objet d’une expertise visuelle manuelle.

L’audit initial a utilisé **14 recherches Search Box et 13 appels Details**, avec **cinq enregistrements retournés**. Il a effectué 55 requêtes vers les sources ouvertes, dont un appel Openverse anonyme sans photographie sûre supplémentaire. Les recontrôles ciblés de Fushimi Inari et de la boutique ont ajouté 20 requêtes ouvertes, dont deux Openverse, sans nouvel appel Mapbox. Ces appels d’audit explicites ne passent pas par les compteurs de l’application ; les volumes sont bornés dans le script.

Les 12 résultats libres retenus ont demandé environ **0,52 à 2,35 secondes** de résolution de métadonnées, 0,99 seconde pour le recontrôle du sanctuaire. Les commerces sans résultat sûr ont demandé environ 3,66 à 5,55 secondes. Le délai de recherche du parcours navigateur simulé était de **528 ms**, indépendant du chargement des photos ; ce chiffre n’est pas une mesure de la latence réelle de Mapbox ni des CDN photographiques.

## Vérifications et fichiers

Validation : **571 tests dans 42 fichiers**, dont tests PostgreSQL embarqués des migrations existantes, types TypeScript, ESLint sans avertissement, build Next.js de production isolé. Le navigateur réel avec identités et fournisseurs simulés couvre six chargements de page, ordinateur, tablette et mobile, DnD, carte/calendrier, crédits, choix libre, choix temporaire non sauvegardé, absence de recadrage non autorisé et absence d’erreur runtime. L’expiration et les réponses automatiques tardives sont testées avec une horloge contrôlée.

Fichiers principaux :

- `apps/web/src/features/images/{model,config,provider-photos,diagnostics,server,http,providers,matching,session,components,place-placeholder}` : modèle commun, intégration, droits, quota, sélection et fallback.
- `apps/web/src/features/integrations/mapbox/{server,place-image}` : transport Details partagé et rendu photo ; `features/trips/activity-card` : catégorie de lieu transmise au fallback.
- `.env.example`, `.env` local ignoré : configuration et contact.
- `tests/image-provider-{photos,pipeline}.test.ts`, `tests/mapbox-photo-quota.test.ts`, tests existants de matching, session et résolveur, `tests/browser/mapbox-places.mjs` : couverture ajoutée et adaptée.
- `scripts/qa/images/multi-source.mjs` : audit réel explicitement activé et borné. L’accès Supabase y est interdit par construction ; les réponses Places brutes ne sont jamais écrites.
- Ancien `place-illustration.tsx` supprimé, remplacé par les pictogrammes demandés.

Reproduction :

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/eslint/bin/eslint.js . --max-warnings 0
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
NAGI_QA_DIST_DIR=.next/image-resolver-v2-qa pnpm --filter @nagi/web build
NAGI_QA_DIST_DIR=.next/image-resolver-v2-qa node tests/browser/mapbox-places.mjs
NAGI_IMAGE_LIVE_QA=1 node scripts/qa/images/multi-source.mjs
# Recontrôle ciblé sans dépense Mapbox :
NAGI_IMAGE_LIVE_QA=1 NAGI_QA_OUTPUT=/tmp/nagi-images-recheck node scripts/qa/images/multi-source.mjs --only 'Fushimi Inari' --open-only
```

Rapports locaux ignorés : `artifacts/image-resolver-v2/`. L’état initial et les recontrôles sont distingués ; le rapport final reprend les associations corrigées.

## Conditions et actions restantes

La [documentation Places](https://docs.mapbox.com/api/search/places/) confirme l’endpoint, les dimensions facultatives, le quota Preview et la restriction d’usage temporaire. Elle précise que les photos par défaut sont indexées depuis les sites des établissements ; les photos partenaires demandent un accès commercial. Les [conditions produit Mapbox du 20 octobre 2026](https://cdn.prod.website-files.com/609ed46055e27a02ffc0749b/6ad79764a359d21b46049ea4_Mapbox%20Product%20Terms%20%28October%2020%2C%202026%29.pdf) ne fournissent pas de règles photographiques assez précises pour déduire une autorisation générale de réutilisation des photos des établissements. **C’est la raison du choix de désactivation par défaut**, et non une affirmation que tout affichage serait interdit.

Avant activation Mapbox : obtenir ou vérifier les droits applicables, renseigner leur référence et les origines couvertes, confirmer les obligations d’attribution et de présentation, puis activer le provider. L’accès au réseau de photos partenaires n’a pas été demandé ni activé. Aucun nouveau token n’est nécessaire si le token existant dispose des accès convenables.

Foursquare reste facultatif. Son [endpoint photo actuel](https://docs.foursquare.com/fsq-developers-places/reference/place-photos) attend un `fsq_place_id`, distinct d’un Mapbox ID. Le futur adaptateur devra identifier le même établissement par recherche appropriée, vérifier la couverture géographique et les [conditions Places PAYG](https://foursquare.com/legal/terms/apilicenseagreement/) avant d’effectuer des appels ou de conserver des données. Aucune clé ni permission Foursquare disponible n’a été présumée.

Aucune migration à appliquer. L’authentification Discord réelle, la collaboration à deux comptes et les obligations du contrat propre au compte Mapbox restent à vérifier dans l’environnement de déploiement. Les résultats de couverture dépendent des réponses et des droits des fournisseurs ; aucune photo hors sujet n’est choisie pour augmenter artificiellement le taux de remplissage.
