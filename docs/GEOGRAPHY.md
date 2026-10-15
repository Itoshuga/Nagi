# Géographie administrable — étape 06

## Utilisation

L’administration reprend les sessions et l’identité visuelle de l’étape 05.

- `/admin/countries` : pays, recherche par nom, tri et archives.
- `/admin/countries/new` : créer un pays.
- `/admin/countries/ID` : présentation du pays et liste de ses villes.
- `/admin/countries/ID/edit` : modifier le pays.
- `/admin/cities` : toutes les villes, puis accès à leurs quartiers.
- `/admin/cities/new?country=ID` : ajouter une ville au pays présélectionné.
- `/admin/cities/ID` : présentation de la ville et liste de ses quartiers.
- `/admin/cities/ID/edit` : modifier la ville.
- `/admin/districts/new?city=ID` et `/admin/districts/ID/edit` : éditer un quartier.

Le fil d’Ariane conserve les destinations parentes. La création d’un enfant depuis
son parent ne redemande pas le contexte. Une création depuis la liste globale des
villes permet de choisir le pays. Une ville sans quartier est une destination
complète et possède toujours ses quatre onglets. Une ville avec quartiers garde
également ses contenus directs ; les contenus des quartiers peuvent remonter à
la ville, sans descendre arbitrairement dans les autres quartiers.

Les formulaires dédiés regroupent informations, présentation, image et publication.
Un unique bouton « Upload une photo » définit la couverture dans Firebase Storage ; voir [PHOTOS.md](PHOTOS.md). L’absence d’image donne lieu à une illustration neutre sur le site public.
Les formulaires affichent les erreurs près des champs et bloquent les soumissions
multiples. Les listes sont adaptées au mobile et les actions d’archivage sont
confirmées dans un dialogue utilisable au clavier.

## Collections et invariants

Les modèles Zod de `src/lib/geography/schema.ts` sont la référence runtime. Les
collections restent plates : `countries`, `cities`, `districts`.

| Champ commun | Rôle |
| --- | --- |
| `id` | Identique à l’ID du document ; UUID à la création, IDs historiques à l’import |
| `kind` | Collection, vérifiée côté serveur |
| `schemaVersion` | `1` pour cette version du catalogue |
| `locale` | `fr` ; identité séparée des textes pour préparer les futures traductions |
| `name`, `nativeName` | Nom affiché et nom local facultatif |
| `slug` | Adresse URL, unique dans son périmètre |
| `summary`, `description` | Résumé et présentation complète en texte brut |
| `coverImage` | Référence locale validée avec texte alternatif et position, ou `null` |
| `status` | `draft` ou `published` |
| `visibility` | `public` ou `private` |
| `sortOrder` | Entier positif ou nul ; les petits nombres apparaissent d’abord |
| `createdAt`, `updatedAt` | Dates ISO 8601 UTC |
| `publishedAt` | Première publication, conservée après dépublication |
| `archivedAt` | `null` pour une destination active, date ISO pour une archive |
| `revision` | Version positive pour détecter les éditions concurrentes |
| `editorial` | Présentation historique préservée lors de l’import, ou `null` |

Un pays ajoute `isoCode` facultatif (format deux lettres) et `continent` facultatif.
Une ville exige `countryId`. Un quartier exige `cityId`. Le pays d’un quartier est
calculé depuis sa ville ; aucun `countryId` redondant ne risque de diverger.
Les parents doivent exister et ne pas être archivés pour enregistrer un enfant.
Les déplacements entre parents sont refusés, y compris via une requête forgée.
Les noms affichés identiques sont autorisés ; ils ne définissent jamais les relations.

L’objet `editorial` conserve notamment humeur, région, légende et photographies
secondaires du carnet actuel. Il permet de préserver le rendu de la migration
sans fabriquer de nouveaux textes. Modifier l’image principale retire les anciennes
variantes qui pourraient masquer ce choix sur le site. Les crédits photo existants
sont conservés. Les nouvelles destinations n’exigent aucun de ces champs historiques.
Les notes internes et audits privés ne doivent pas être ajoutés aux documents
publiés : Firestore expose le document entier lorsque sa lecture est autorisée.

### Compatibilité des destinations déjà enregistrées

Les premiers documents Firestore n’avaient ni `kind`, ni version de schéma,
ni révision ; leur `coverImage` était un chemin. Le lecteur reconnaît ce format
précis et construit en mémoire le modèle courant à partir de la collection et
du chemin enregistré et du nom du document. Les champs `isoCode` et `continent` vides des anciens
enfants sont retirés. Un ancien brouillon peut avoir un résumé et une description
vides : il reste consultable et éditable, mais le formulaire exige de les compléter
avant l’enregistrement. Aucun texte de démonstration n’est injecté.

Cette lecture ne modifie pas Firestore. La prochaine sauvegarde ou opération
d’archivage volontaire enregistre le format courant en conservant ID, relations,
dates existantes et adresse publiée. La révision initiale est `1`. Si une ancienne
destination publiée n’a pas de `publishedAt`, sa date de modification sert de
repère pour protéger immédiatement son adresse. Une visibilité privée explicite
reste privée. Un document déjà versionné invalide n’est jamais rétroconverti.

Un format non reconnu reste refusé ; l’administration indique désormais le
document concerné, au lieu de masquer ce cas derrière une panne de configuration.
Les anciennes destinations doivent être enregistrées au format courant avant
la bascule publique : les requêtes publiques et règles exigent les champs explicites
de visibilité et d’archivage.

## Slugs, concurrence et stabilité des URL

Le nom propose un slug sans accents. Le champ reste corrigible avant la première
publication ; un nom entièrement non latin peut nécessiter une proposition latine
manuelle. Les slugs acceptent les lettres minuscules ASCII, chiffres et tirets, sans
segments vides. `explorer` est réservé pour les quartiers afin de préserver le routage.

Les réservations privées sont dans `geographySlugs` :

- pays : `countries:root:SLUG` ;
- ville : `cities:COUNTRY_ID:SLUG` ;
- quartier : `districts:CITY_ID:SLUG`.

La transaction lit la destination, son parent, la réservation et les éventuels
homonymes d’URL avant toute écriture. Deux créations simultanées du même slug
ne peuvent donc pas réussir toutes les deux. Une correction de slug de brouillon
libère l’ancienne réservation dans la même transaction. Une archive conserve sa
réservation pour permettre une restauration sans collision.

Dès que `publishedAt` existe, l’adresse devient immuable, même si la destination
repasse en brouillon ou dans les archives. Aucun système de redirections d’anciennes
adresses n’est encore nécessaire. Le nom et les présentations restent modifiables.
Une modification exige la `revision` chargée par le formulaire ; un conflit répond
`409` et demande de recharger plutôt que d’écraser une autre modification.

## Publication et archivage

Une destination est effectivement publique si elle est publiée, de visibilité
publique, non archivée, et si tous ses parents remplissent les mêmes conditions.
Son propre statut n’est pas forcé lorsqu’un parent est dépublié : l’administration
indique « Publié » avec la raison du masquage hérité. Republier le parent rend ses
enfants déjà publiés de nouveau visibles.

Un brouillon reste dans la liste active et peut être préparé. Une archive est mise
à l’écart dans la liste « Archives » et repasse en brouillon ; elle reste restaurable.
Restaurer ne republie jamais automatiquement la destination. Archiver un parent
masque ses descendants sans modifier ni supprimer leurs documents ou contenus.
Le dialogue indique leur présence. La suppression définitive est désactivée pour
toutes les destinations, y compris celles sans enfant. L’API DELETE renvoie un refus
explicite et recommande l’archivage.

## Sécurité

Chaque page vérifie `requireAdmin()`. Les mutations passent par les Route Handlers
Node.js `/api/admin/geography/KIND` et `/api/admin/geography/KIND/ID` :

- `POST` sur une collection crée ;
- `PUT` sur un document enregistre une édition ;
- `POST` sur un document archive ou restaure ;
- `DELETE` est explicitement refusé.

Chaque appel revérifie le cookie, la révocation, le rôle actuel et la protection
CSRF existante. Les sessions absentes, comptes ordinaires et origines étrangères
sont refusés avant lecture du corps. Le corps est limité à 100 Ko en streaming.
Zod valide à nouveau toutes les données sur le serveur ; les champs inconnus,
images non autorisées et incohérences de périmètre sont refusés. Les erreurs SDK
et secrets ne sont jamais renvoyés au navigateur.

`store.ts` est un module serveur interne ; ses transactions sont appelées par le
contrôleur autorisé et par l’import de confiance. Les composants n’appellent pas
le SDK Admin. Les lectures publiques utilisent une projection explicite du modèle,
sans métadonnées d’administration, et filtrent les parents avant toute génération
de page, lien ou métadonnée SEO. Le catalogue des quatre univers est également lu dans Firestore ; les fiches sans destination visible ne sont pas exposées.

Les règles Firebase interdisent **toute écriture géographique depuis le SDK client,
même pour un administrateur** : on ne peut pas contourner les réservations de
slugs et validations. Les réservations ne sont jamais lisibles depuis un client.
Les lectures publiques de destinations contrôlent la publication de leurs parents.
Les règles et les accès serveur des quatre univers et des couvertures sont documentés dans CONTENTS.md et PHOTOS.md.

## Migration et bascule contrôlée

Firestore est la seule source publique depuis l’étape 09 ; l’administration enregistre
ses destinations en base. Aucun import de démonstration n’est automatique.

Depuis un poste de confiance correctement configuré, simuler l’import :

```sh
npm run geography:import -- --project=nagi-travelapp --dry-run
```

Le mode sans `--apply` ne fait aucune écriture. Pour appliquer volontairement :

```sh
npm run geography:import -- --project=nagi-travelapp --apply --confirm-project=nagi-travelapp
```

Les deux occurrences du projet doivent correspondre aux projets serveur et Web de
l’environnement. Un projet absent, inattendu ou une confirmation manquante bloque
l’exécution. Ne pas recopier aveuglément l’identifiant dans un autre environnement.
Le script n’ajoute ni compte utilisateur, ni rôle, ni contenu des quatre univers.

Le script reprend les **10 destinations existantes** : Japon, Tokyo, Kyoto, Osaka,
Fujiyoshida et les cinq quartiers Shinjuku, Ueno, Asakusa, Shibuya, Ginza. Les IDs,
textes, photographies, ordre et parents sont conservés. Les métadonnées de dates
situent l’import ; elles n’inventent pas une date de création éditoriale historique.
Une transaction crée uniquement les documents et réservations manquants. Les
documents existants conformes sont conservés intégralement, y compris les éditions
administratives. Un format incompatible ou conflit d’URL arrête l’import sans
écriture partielle. Aucun document n’est supprimé ou écrasé.

Après import :

1. Vérifier dans l’administration 1 pays, 4 villes et 5 quartiers, les images,
   présentations, statuts et relations.
2. Déployer les règles du dépôt après vérification du projet et de la base
   Firestore **(default)** :

   ```sh
   npx firebase deploy --project nagi-travelapp --only firestore:rules,firestore:indexes
   ```

Les règles Storage restent restrictives et peuvent être déployées séparément si le bucket est provisionné.

3. Déployer les index puis vérifier les pages publiques. Firestore est la seule source ; aucune activation par variable ni retour statique n’existe.

## Lectures publiques, cache et index

Voir [PUBLIC_DATA.md](PUBLIC_DATA.md), référence de l’étape 09 : requêtes ciblées,
listes paginées, visibilité parentale, cache limité à la requête et nouveaux index.
Les données d’exemple et l’implémentation d’import sont isolées hors de `src`.

## Émulateurs et vérifications

Installer Node.js 22+ et Java 21+. Depuis la configuration locale d’émulation
présentée dans [FIREBASE.md](FIREBASE.md), lancer `npm run firebase:emulators`,
puis importer avec `--project=demo-nagi` et, pour écrire,
`--apply --confirm-project=demo-nagi`. Aucune vraie clé n’est nécessaire.
Garder la production séparée ; les tests utilisent uniquement le projet demo-nagi.

```sh
npm test
npm run test:firebase-rules
npm run test:geography
npm run test:admin-auth
npm run typecheck
npm run lint
npm run build
```

Les commandes d’émulateurs doivent être exécutées séquentiellement. Le test de
la géographie démarre une copie temporaire de Next.js sur `3107`, crée ses comptes
et documents dans `demo-nagi`, teste les créations / publications / dépublications,
les URL, les quartiers facultatifs, les conflits de slug simultanés, les versions,
les gardes d’accès, la migration et l’absence de source locale, puis nettoie son
serveur et ses comptes. Les données de l’émulateur sont jetables à son arrêt.
Le test Auth utilise `3105` et nécessite désormais aussi l’émulateur Firestore.
Aucune de ces vérifications ne prouve une connexion réelle au projet de production.

Références : [transactions Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions),
[validation Zod](https://zod.dev/api). Les conventions Next.js utilisées proviennent
des guides de la version installée, dans `node_modules/next/dist/docs/`.
