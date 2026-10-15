# Données publiques — étape 09

Firestore est l’unique source de données métier. Les anciennes variables
`NAGI_GEOGRAPHY_SOURCE` et `NAGI_CONTENT_SOURCE` sont supprimées de la configuration
et ignorées si elles subsistent dans un environnement. Une base vide reste vide.
Une panne, un index absent ou un document incompatible produit une indisponibilité,
sans repli sur les exemples locaux.

## Audit et sources retirées du site

Les anciens modules `src/data/geography.ts`, `discoveries.ts`, `catalogue/*`,
`geographic-covers.ts`, `content-covers.ts`, `destination-photographs.ts` et
`discovery-photographs.ts` sont déplacés dans `fixtures/catalogue/`. Ils servent
exclusivement aux imports volontaires et aux tests. Les convertisseurs de démos
sont dans `fixtures/catalogue/helpers/`, les transactions d’import dans
`scripts/migrations/`. Aucun module de `src` ne les importe, y compris indirectement
par les formulaires, les décodeurs de documents ou les crédits photographiques.
Un test parcourt ces imports pour prévenir leur réintroduction.

Les libellés des univers (`src/data/universes.ts`), les textes éditoriaux et de
navigation (`fr.ts`) et l’image institutionnelle du jardin restent statiques.
Les identifiants préférés Japon / Tokyo / Kyoto ont été retirés de l’accueil.

## Collections

| Collection | Usage |
| --- | --- |
| `countries`, `cities`, `districts` | Identité, textes, parent, publication et couverture |
| `contents` | Les quatre univers, destinations explicites, détails facultatifs et couverture |
| `contentRelations` | Relations `serves` et `hosts`, filtrées sur leurs deux extrémités |
| `photoAssets` | Références et autorisations des couvertures dans Firebase Storage |
| `geographySlugs`, `contentSlugs` | Réservations privées, écrites par les transactions d’administration |

Le SDK Admin reste serveur uniquement. Les projections publiques retirent révisions,
archives, clés d’indexation et autres métadonnées de gestion. Aucun nouveau endpoint
public ni SDK Web de lecture n’a été ajouté.

## Repositories et visibilité

`src/lib/geography/repository.ts` centralise les listes publiées, la résolution par
slug et parent et le chargement groupé des ascendances. Une ville est recherchée
avec son `countryId`, un quartier avec son `cityId`. Les références d’une liste ou
des relations sont dédupliquées puis lues par lots de 100, dans trois niveaux
quartiers → villes → pays. Les parents privés, brouillons ou archivés masquent leurs
ascendances dans la projection. Une référence absente ne crée pas de destination.

`src/lib/contents/public.ts` interroge type + slug pour une fiche, ou type +
`geographyKeys` pour un onglet. Publication, visibilité et archive sont filtrées
dans Firestore ; les ascendances sont revérifiées côté serveur. Une spécialité
multi-destinations conserve uniquement ses associations visibles. Dans la vue
agrégée d’une ville, seule une association visible appartenant à cette ville peut
faire apparaître la fiche. Une association publique ailleurs ne contourne pas
le masquage d’un quartier local.

Les relations sont limitées à 40 par fiche, lues en une requête puis avec `getAll`
pour leurs voisins. Seuls les liens enregistrés et leurs extrémités visibles sont
projetés. Les champs facultatifs continuent d’être omis lorsqu’ils sont vides.

## Accueil, listes et filtres

L’accueil sélectionne le premier pays publié par **sortOrder croissant, nom puis identifiant**,
puis ses trois premières villes dans le même ordre. Le champ d’ordre existant de
l’administration contrôle ainsi les mises en avant. Un pays publié sans ville utilise sa
propre couverture et son lien. Sans pays, l’illustration neutre et les textes de
marque restent présents ; la section des destinations est masquée.

Le répertoire affiche 12 pays par page, avec au plus 6 villes par pays et un accès
à leur liste complète. Les pages Pays et Ville affichent 24 enfants par page.
Le répertoire ne charge plus les quartiers uniquement pour les compter.
Les compteurs indiquent le nombre de lignes effectivement affichées.

Chaque onglet Ville / Quartier reste sur la même URL, avec `onglet` et `#univers`.
Il interroge seulement l’univers choisi. Les contenus sont paginés par 24 avec le
curseur `apres`. La recherche `q`, normalisée sans accents, porte sur le **début du
titre dans tout ce carnet** ; le thème filtre explicitement **la page affichée**.
Les liens suivants conservent la recherche. Changer de filtre ou d’onglet retire
le curseur des fiches. Un curseur lié à un autre filtre n’est pas réutilisé.

Pour compenser les quartiers masqués, une page peut lire jusqu’à quatre lots de
candidats ; le curseur avance sur les fiches masquées aussi. Au-delà, une page
sans fiche visible invite à poursuivre, sans prétendre que le carnet entier est
vide. Aucune collection entière n’est chargée pour un compteur et aucun total
inexact n’est affiché sur les onglets non chargés.

## Cache, erreurs et images

Next.js 16.4 est configuré sans Cache Components. `connection()` impose le rendu
à la requête. `React.cache` déduplique seulement dans un rendu serveur, sans cache
persistant des documents ou de leur visibilité. Les sauvegardes utilisent
`revalidatePath` sur la fiche, ses anciens/nouveaux voisins et ses destinations ;
les mutations géographiques invalident l’accueil, le répertoire et la hiérarchie
concernée. Le site entier n’est pas invalidé à chaque sauvegarde.

Le proxy résout seulement la hiérarchie ou la fiche demandée pour garantir les
statuts HTTP 404 des routes dynamiques avec Next 16.4. Il ne charge plus toute la
géographie. Une erreur donne une page 503 avec `no-store`, `Retry-After` et
`noindex`. Les frontières d’erreur gèrent aussi l’accueil, le répertoire et les
échecs pendant le rendu. Les lectures publiques ont un délai de réponse maximal
de huit secondes ; les logs ne contiennent que l’opération et un code nettoyé,
jamais les messages privés du SDK, les documents ou les identifiants privilégiés.

L’upload existant reste inchangé. `coverPhoto` et les anciennes couvertures
`photos.cover` sont lus directement depuis le document. Les anciens chemins
locaux enregistrés dans Firestore restent compatibles sans recherche dans un
registre local. Les textes alternatifs et positions enregistrés sont conservés ;
un ancien chemin seul utilise le nom du document et une position centrale.
Les nouvelles photos Storage restent servies par leur accès protégé sans cache
et affichées avec `next/image`. Les imports enregistrent les crédits de leurs
photographies en base (`coverImage.credit` ou `coverCredit`).

## Index et déploiement

`firestore.indexes.json` inclut les index composés suivants, en plus des index
administratifs et photographiques déjà présents :

- Pays : `status`, `visibility`, `archivedAt`, puis `sortOrder`, `name` pour les listes, ou `slug` pour les URL.
- Villes : mêmes égalités, `countryId`, puis `sortOrder`, `name` pour les listes, ou `slug` pour les URL.
- Quartiers : mêmes égalités, `cityId`, puis `sortOrder`, `name` pour les listes, ou `slug` pour les URL.
- Fiche par URL : `type`, `slug`, `status`, `visibility`, `isArchived`.
- Onglet : `isArchived`, `type`, `status`, `visibility`, `geographyKeys` (array), `searchTitle`.

Les documents créés ou réenregistrés par l’administration et les imports possèdent `sortOrder`. Réenregistrer les éventuels anciens documents sans ce champ avant leur mise en ligne.

L’identifiant du document départage les titres/noms identiques. Déployer les index
et attendre leur état prêt avant de publier cette version :

```sh
npx firebase deploy --project nagi-travelapp --only firestore:indexes
```

Ce déploiement n’importe aucun document. Ne pas installer un cache CDN HTML qui
ignorerait les en-têtes des pages dynamiques ou des photographies protégées.

## Import volontaire et audit du projet réel

Aucun import ne s’exécute au démarrage. Les deux scripts existants restent en
simulation par défaut et exigent un projet explicite. L’écriture exige à la fois
`--apply` et `--confirm-project=...`. Ils conservent les documents administrés,
identifiants, réservations et relations existants ; les conflits arrêtent la
transaction sans écriture partielle. Un réimport ne recrée pas une relation
retirée par un administrateur.

```sh
npm run geography:import -- --project=nagi-travelapp --dry-run
npm run contents:import -- --project=nagi-travelapp --dry-run
```

Audit réel du 15 octobre 2026, **en lecture seule** : un pays et une ville publiés,
aucun quartier. La simulation géographique signale le Japon sous un autre ID ;
la simulation des fiches signale des quartiers et villes absents. Le nouvel index
de liste des pays manquait lors de cet audit (code Firestore 9).

Correction du 15 octobre 2026 : les 7 nouveaux index ont ensuite été déployés sur
`nagi-travelapp` avec `firebase deploy --only firestore:indexes --non-interactive`.
Les 19 index du projet sont maintenant `READY`. Les requêtes réelles Pays, Villes,
Quartiers, résolution par slugs et les quatre univers réussissent. L’accueil, le
répertoire, le pays, la ville et ses quatre onglets ont été vérifiés en HTTP 200 sur
le serveur local connecté au projet réel. Seuls les index ont été déployés ; aucun
document touristique n’a été importé et aucune règle n’a été modifiée. Ne pas créer des destinations de démonstration
pour remplir l’interface : compléter le catalogue administré selon le contenu
souhaité, ou rapprocher volontairement les exemples avant tout import.

Pour ajouter les attributions manquantes aux couvertures locales déjà enregistrées,
utiliser `npm run photos:credits -- --project=nagi-travelapp --dry-run`, examiner le
plan puis appliquer volontairement avec les deux options de confirmation. Ce script
ajoute seulement les crédits connus aux références inchangées, sans changer la
photo ni un crédit déjà renseigné. Les couvertures Storage ne sont pas concernées.

## Vérification

`npm test` inclut les modèles, la résolution, la confidentialité, les relations,
les requêtes bornées, les curseurs et l’isolation des fixtures. Les suites Firebase
utilisent uniquement `demo-nagi`, des copies Next.js temporaires et des comptes
jetables. Elles doivent s’exécuter successivement (ports partagés) :

```sh
npm run test:geography
npm run test:contents
npm run test:photos
npm run test:firebase-rules
npm run test:admin-auth
npm run typecheck
npm run lint
npm run build
```

La suite des fiches couvre aussi l’accueil vide, le pays sans ville, Sakura en vue
agrégée, la recherche publique, 24 + 6 résultats, un parent masqué, les curseurs
invalides et une indisponibilité 503. Voir `VALIDATION.md` pour les résultats exécutés.
