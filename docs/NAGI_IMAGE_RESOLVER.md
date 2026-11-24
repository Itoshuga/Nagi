# Nagi Image Resolver — phase 4.7.3

État actuel : [Nagi Image Resolver 3.0 — Serper et galerie persistante](./NAGI_IMAGE_RESOLVER_3.md). Le présent rapport et celui de la phase 4.7.4 sont conservés comme historique ; les photos Mapbox ne font plus partie du parcours photographique actif.

Implémentation et vérifications du 23 novembre 2026. Les photographies forment une couche de présentation indépendante du planning. Mapbox reste le fournisseur de recherche et de localisation.

## Comportement livré

- Recherche Wikidata avec labels et alias français, anglais et japonais : ordre des mots libre, qualificatifs de catégorie, variantes de langue et petites fautes sur les mots longs. Une recherche complémentaire est effectuée si la première ne confirme pas d’entité. Les branches contradictoires et numéros différents restent distincts.
- Photographie P18 prioritaire, puis PageImages d’une page Wikipedia liée à la même entité, puis Commons, puis Openverse. Les légendes Commons sont prises en compte et GeoSearch complète les noms. Les fichiers Wikipedia locaux et non libres restent exclus.
- Une entité confirmée ou une photographie Commons dont le nom et les coordonnées de source concordent permettent la sélection automatique. Les résultats uniquement textuels restent des propositions. Les coordonnées de sujet et de prise de vue fournies par Commons sont considérées, sans reprendre de coordonnées Mapbox dans les métadonnées photographiques.
- Chaque lieu affiche un visuel : photographie pertinente ou pictogramme Lucide adapté à sa catégorie (boutique, café, restaurant, hôtel, musée, parc, transport, monument ou lieu générique), centré sur un fond bleu discret. Les pictogrammes apparaissent immédiatement, sans appel réseau, avec un libellé accessible. Seules les icônes utilisées sont importées ; la bibliothèque de recherche d’icônes n’est pas chargée. Ce même visuel remplace une photo qui ne charge pas.
- Affichage progressif dans les résultats Mapbox, les activités, les arrêts, les détails et les fiches du catalogue. Les blocs du calendrier restent inchangés. Les miniatures et aperçus utilisent les URL officielles `imageinfo`, y compris `thumb.wikimedia.org` et `thumburls` ; aucune URL de redimensionnement n’est inventée.
- Crédits discrets sur les miniatures, accessibles en détail avec auteur, titre, œuvre originale, licence/version et indication de présentation recadrée. Les métadonnées HTML sont converties en texte, sans `dangerouslySetInnerHTML`.
- Choix manuel, recherche précisée, conservation de l’image actuelle, retour au choix automatique et pictogramme. Le catalogue se modifie depuis la zone médias d’une fiche enregistrée ; un choix dans un voyage concerne uniquement la visite. L’import existant dans la galerie est conservé et une nouvelle couverture importée réinitialise le choix global.

## Fournisseurs et endpoints

| Fournisseur | Appels serveur                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wikidata    | `https://www.wikidata.org/w/api.php` : `wbsearchentities`, `wbgetentities`                                                                                             |
| Wikipedia   | `https://fr.wikipedia.org/w/api.php`, `https://en.wikipedia.org/w/api.php`, `https://ja.wikipedia.org/w/api.php` : `pageimages`, `pageprops`, association QID vérifiée |
| Commons     | `https://commons.wikimedia.org/w/api.php` : recherche de fichiers, `imageinfo`, `extmetadata`, `sha1`, `thumburls`                                                     |
| Openverse   | `https://api.openverse.org/v1/images/` ; OAuth facultatif sur `/v1/auth_tokens/token/`                                                                                 |

Openverse est intégré avec un filtre de licences et une vérification de l’origine Commons. Les autres hébergeurs restent exclus tant qu’ils ne disposent pas d’un vérificateur de licence fiable. Il n’y a ni scraping ni téléchargement automatique dans Storage. L’appel réel Openverse a dépassé le timeout lors de l’audit ; son succès en production n’a donc pas été validé.

Références officielles : [Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo), [PageImages](https://www.mediawiki.org/wiki/Extension:PageImages), [User-Agent Wikimedia](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy), [nouveau domaine de miniatures](https://phabricator.wikimedia.org/T427465), [Openverse](https://api.openverse.org/v1/), [usage temporaire Search Box](https://docs.mapbox.com/api/search/search-box/).

## Licences

CC0, domaine public avec déclaration et lien de licence vérifiables, CC BY et CC BY-SA (versions reconnues 1.0, 2.0, 2.5, 3.0 et 4.0). CC0 et domaine public restent distincts. Auteur requis pour BY/BY-SA ; licences inconnues, NC, ND, restrictions incompatibles, versions contradictoires et auteurs inconnus sont écartés. SVG, logos, cartes, diagrammes et photographies explicitement historiques sont filtrés. Ces contrôles portent sur les métadonnées officielles ; ils ne constituent pas une expertise de tous les droits éventuellement attachés aux sujets photographiés.

Les métadonnées conservent titre, auteur, liens d’attribution, licence/version/URL, source, dimensions, hash Commons disponible et date de vérification. Une licence incomplète reste refusée, même pour une image P18.

## Supabase et permissions

Projet **Nagi**, référence **`ynstekndjombxnvjtznt`**, connexion **Thelessia**, vérifié avant application.

Migration appliquée : **`20261123183444_nagi_image_resolver.sql`** ; version enregistrée **`20261123183444`**. Le fichier local a été aligné sur la version attribuée par Supabase. Les migrations Mapbox précédentes `20261123103000` et `20261123143000` étaient présentes.

Migration complémentaire appliquée : **`20261123184051_image_assignment_read_policy.sql`**, version **`20261123184051`**. Elle conserve une seule politique de lecture applicable par rôle, avec les mêmes contrôles d’accès.

- `external_images` : métadonnées ouvertes vérifiées, dédupliquées par fichier source et identifiant déterministe ; lecture des images disponibles et récentes, écriture serveur uniquement.
- `image_resolution_cache` : clé SHA-256 de référence, identifiants des candidates, sélection, raisons, QID, expiration et bail. Aucune lecture des membres. Un indicateur signale la présence d’une preuve géographique, sans enregistrer les coordonnées.
- `place_image_assignments` : choix global d’une fiche **ou** choix d’une visite dans un voyage ; révision photo propre, indépendante de la version du planning.
- `private.image_resolver_usage` : budgets et compteurs serveur.
- RLS sur les trois tables exposées ; mutations par `set_place_image`, avec vérification SQL du rôle administrateur ou des permissions Discord de modification du voyage, et de l’appartenance réelle de la visite au voyage.
- L’UUID de visite reste identique lors du déplacement entre activité et arrêt. L’association ne référence donc pas exclusivement une des deux tables. Les associations de visites supprimées deviennent illisibles et sont purgées après un délai.
- Les broadcasts photo réutilisent le flux privé du voyage, avec un événement distinct du journal des mutations. Ils ne changent aucun horaire, ordre, note, couleur ou version du voyage.

Les noms, adresses, coordonnées et résultats bruts de Mapbox ne sont enregistrés dans aucune nouvelle table. Le contexte est signé pour un membre, un voyage et un ID, limité à une heure, transmis temporairement en mémoire et vérifié côté serveur. Les métadonnées photographiques persistées proviennent des ressources ouvertes.

Vérification distante après migration : RLS activée ; aucune écriture directe de métadonnées, lecture du cache ou réservation de fournisseurs pour `authenticated` ; aucune exécution de sélection pour `anon`. Les données existantes sont restées à **1 voyage, 3 activités, 1 arrêt et 3 médias**. Aucun fichier photo n’a été copié dans Storage. L’audit des fournisseurs n’a pas rempli la base avec des photos de démonstration.

L’analyse de sécurité signale les deux nouvelles fonctions `SECURITY DEFINER` accessibles aux membres : accès intentionnel, contrôles d’autorisation dans les fonctions, `search_path` vide, droits publics révoqués. Les autres alertes existaient avant cette migration. Guide : [fonctions privilégiées exposées](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Sécurité et performances

- Deux jobs client et deux appels fournisseur concurrents par processus ; deux baux de résolution partagés en base entre instances. Déduplication des recherches actives et des fichiers par URL/hash ; annulation des tâches encore en attente lorsqu’un résultat quitte l’écran.
- IntersectionObserver, délai d’inactivité de 850 ms, aucune dépendance aux mutations du planning. Les réponses Mapbox restent affichées immédiatement avec leur pictogramme initial.
- Cache positif 14 jours, propositions ambiguës 7 jours, absence de résultat 24 heures, indisponibilité au moins 5 minutes. Une suggestion ambiguë peut être réévaluée dès qu’un contexte signé apporte des coordonnées. Le choix manuel n’est jamais remplacé automatiquement.
- Vérification des choix anciens à partir de 14 jours, disponibilité et licence contrôlées à nouveau. Un échec réseau du navigateur ne suffit pas à supprimer globalement une photo : une vérification serveur avec bail et budget est nécessaire. En cas d’échec, la carte revient à son pictogramme.
- 10 résolutions/minute et 100/jour/membre, 2 000/jour pour l’application ; Openverse limité prudemment à 1/minute et 90/jour globalement, même avec OAuth.
- Timeout de 6,5 secondes par requête fournisseur, budget de 16 appels logiques par résolution, timeout global 70 secondes, une seule reprise possible pour un `Retry-After` court. Les réponses 429/503 imposent un délai partagé par hôte. Les variantes restent séquentielles et s’arrêtent dès qu’une photo fiable est disponible.
- Les anciens résultats négatifs ou ambigus sont invalidés une fois pour adopter le moteur assoupli (`matcher-v2`). Les associations positives et les choix manuels restent réutilisés ; aucune migration SQL supplémentaire n’est nécessaire.
- Endpoints fixes, HTTPS, redirections refusées, JSON uniquement, réponses bornées à 2 Mo. Corps des routes bornés à 32 Ko, validation Zod, contrôle d’origine et de session. Aucun proxy d’URL utilisateur.
- Les images résolues sont limitées aux hôtes officiels `upload.wikimedia.org` et `thumb.wikimedia.org`. Le composant existant utilise les miniatures externes sans proxy d’optimisation Next ; aucune wildcard `remotePatterns` n’a été ajoutée.

## Configuration serveur

`NAGI_IMAGE_USER_AGENT` doit identifier Nagi et fournir une adresse ou URL réelle de contact. Le contact donné pour ce travail a été configuré dans `.env`, ignoré par Git. À reporter dans l’environnement serveur de déploiement. Sans contact valide, le résolveur conserve les pictogrammes.

`NAGI_OPENVERSE_CLIENT_ID` et `NAGI_OPENVERSE_CLIENT_SECRET` sont facultatifs ; jeton OAuth conservé seulement côté serveur. Aucune création automatique de compte Openverse. `NAGI_TOKEN_ENCRYPTION_KEY` existante sert également à signer le contexte temporaire, avec un domaine de signature distinct. Aucun nouveau secret n’est exposé au navigateur.

## Correctif du déclenchement automatique

Le premier parcours navigateur remplaçait `window.fetch` par une fonction fléchée, ce qui masquait une erreur d’invocation du fetch natif. `ImageSession.request` appelait `this.fetcher(...)` : le navigateur recevait la session comme contexte et rejetait la promesse avec « Failed to execute 'fetch' on 'Window': Illegal invocation ». Aucun appel réseau ni aucune résolution Supabase n’étaient effectués, et l’illustration restait affichée.

L’appel utilise maintenant une référence de fonction détachée de la session. Un test reproduit l’échec avant correction ; le transport du test navigateur conserve désormais le contexte d’appel natif. Un nouveau parcours `scripts/qa/images/browser.py` teste également les vraies routes Next.js et le résolveur avec PostgreSQL embarqué, une identité fictive, des réponses de fournisseurs simulées et le fetch natif non remplacé. Il vérifie le chargement automatique dans une activité et dans les résultats Mapbox. Les imports Windows et fins de ligne du banc de test ont été corrigés.

Pour compiler ce parcours sans remplacer les fichiers du serveur de développement, `NAGI_QA_DIST_DIR` permet un dossier de compilation séparé. Le test fonctionne avec `NAGI_QA_IMAGES=1`, `NAGI_QA_PORT=3131`, puis `python scripts/qa/images/browser.py --output <dossier-de-test>` face à `scripts/qa/trips/server.mjs`. Aucun compte ni voyage réel ne sont utilisés par ce parcours.

## Tests et observations

Tests Vitest : licences et auteurs, métadonnées hostiles, URL dangereuses, voisinage et homonymes, photo d’entité, PageImages non libre, suggestions Commons, concurrence, preuve signée, autorisation des routes, cache, choix concurrents et chargement visible. Les tests PostgreSQL embarqués exécutent toutes les migrations et vérifient RLS, cloisonnement des voyages, membres expirés, rôles, révisions photo, priorité des imports et conservation de l’image lors de `nest_item` / `relocate_stop`.

Résultat après assouplissement : **534 tests réussis dans 39 fichiers**, lint sans avertissement, types TypeScript conformes, build Next.js de production réussi. Les tests couvrent les variantes de noms, la sélection géographique Commons, les mauvaises branches, les descriptions de bâtiments historiques et l’adoption du nouveau cache. Les 114 tests PostgreSQL ont été rejoués avec la migration complémentaire. Le contrôle distant d’une session sans identité refuse également la mutation photo.

Le parcours Edge utilise un profil synthétique sans fenêtre, des données de voyage fictives et un transport Mapbox/images simulé. Il couvre le glisser-déposer, les crédits, l’illustration, la sélection manuelle, plusieurs tailles d’écran et l’absence de sauvegarde du planning lors des changements photo. Il ne se connecte pas au compte utilisateur.

Audit réel, langue française, lieux résolus avec coordonnées :

| Lieu                              | Résultat observé                           | Temps des métadonnées |
| --------------------------------- | ------------------------------------------ | --------------------- |
| Sensō-ji                          | Automatique, CC0                           | 952 ms                |
| Tokyo Tower                       | Automatique, CC BY-SA                      | 923 ms                |
| Shibuya Crossing                  | Automatique, CC0                           | 781 ms                |
| Shibuya Parco                     | Automatique, CC BY-SA                      | 660 ms                |
| Pokémon Center SHIBUYA            | Automatique, CC BY                         | 597 ms                |
| Shinjuku Gyoen                    | Automatique, CC BY-SA                      | 805 ms                |
| Musée du Louvre                   | Automatique, CC BY                         | 1 003 ms              |
| Tour Eiffel (nouveau moteur)      | Automatique, CC BY-SA, coordonnées Commons | 1 083 ms              |
| Boutique inconnue                 | Aucun résultat fiable                      | 856 ms                |
| Sensō-ji avec coordonnées à Paris | Aucune sélection automatique, propositions | 4 024 ms              |

L’audit initial utilisait 32 requêtes de métadonnées. Le nouveau moteur a aussi été contrôlé sur « PARCO Shibuya », « Louvre Museum Paris », « Shinjuku Gyoen National Garden » et « Tour Eiffel » : quatre sélections automatiques avec licences vérifiées, 17 requêtes au total, environ 0,8 à 1,2 seconde par lieu. La photo P18 de la tour Eiffel déclarant « Public domain » sans URL de licence exploitable reste écartée ; une autre photographie CC BY-SA est sélectionnée avec les coordonnées Commons. Référence : [GeoSearch Commons](https://commons.wikimedia.org/wiki/Commons:API/MediaWiki).

Ces audits ne font aucun appel Mapbox, aucune écriture Supabase et aucun téléchargement d’originaux. Ils ne mesurent pas le chargement CDN des fichiers ni la latence depuis tous les pays. Ils ne garantissent pas une photo libre pour chaque établissement ; le pictogramme de catégorie couvre ce cas.

Audit additionnel sans coordonnées : Shibuya Parco et Pokémon Center SHIBUYA confirmés par pays/ville (environ 2 secondes) ; Sensō-ji reste ambigu avec des propositions (environ 3 secondes). Son contexte obtenu après sélection permet une nouvelle vérification géographique. L’affichage initial des résultats Mapbox simulés prenait 562 ms pendant le test navigateur ; la photo n’en bloque pas l’apparition.

Commandes reproductibles :

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/eslint/bin/eslint.js . --max-warnings 0
node scripts/schema-types-from-migrations.mjs --check
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
$env:NAGI_IMAGE_LIVE_QA='1'
node scripts/qa/images/live.mjs
node scripts/qa/images/live.mjs --suggestions
$env:NAGI_TEST_BROWSER='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node tests/browser/mapbox-places.mjs
```

## Fichiers

Nouveaux modules : `apps/web/src/features/images/{model,metadata,matching,http,proof,providers,server,route,session,components,place-placeholder}` ; routes `/api/images` et `/app/[guildId]/trips/[tripId]/images` ; migrations ci-dessus ; `tests/image-{resolver,matching,cache,route,session}.test.ts` ; `scripts/qa/images/live.mjs` ; ce document.

Intégrations modifiées : types partagés des lieux et types SQL générés ; serveur, provider React et `PlaceImage` Mapbox ; `EntryImage` ; cartes de catalogue et d’activités ; détails d’activités et d’arrêts ; fiches publiques et formulaire d’administration ; flux de synchronisation photo séparé ; `.env.example` ; tests PostgreSQL et scénario navigateur Mapbox.

## Vérifications restant dans l’application déployée

- Connexion Discord réelle, révocation d’un accès et sélection avec deux comptes réels dans un voyage collaboratif.
- Rafraîchissement après choix photo, puis déplacement activité ↔ arrêt dans le voyage existant ; synchronisation photo sur une seconde session réelle.
- Import d’une nouvelle couverture du catalogue, confirmation de sa priorité et conservation de la galerie ; aucun upload réel n’a été fait pendant cet audit.
- Configuration du User-Agent dans l’hébergement et vérification de ses accès réseau à Wikimedia. Le build local a réussi ; le site n’a pas été déployé par cette intervention.
- Recontrôle du service Openverse une fois disponible ; ajout éventuel de vérificateurs de sources autres que Commons, d’un cache mutualisé d’entités Wikidata et d’une révision éditoriale des candidats ambigus.
