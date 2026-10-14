# Les découvertes administrables — étape 07

## Utilisation

`/admin/contents` réunit les quatre univers. Les raccourcis de la barre latérale
ouvrent la même liste filtrée. « Créer une découverte » propose un univers, puis
un éditeur commun dont les champs s’adaptent au type choisi. Le type devient
immuable à la création.

- `/admin/contents/new?type=tourisme|activites|gastronomie|adresses` : création.
- `/admin/contents/ID` (ou `/edit`) : édition.
- `/admin/contents/ID/preview` : prévisualisation privée de la version enregistrée.

Titre, résumé, présentation, tags, informations propres à l’univers et relations
se trouvent dans la colonne principale. Publication, destination et photographies
occupent la seconde colonne, puis s’empilent sur mobile. Les brouillons peuvent
être incomplets ; titre, slug et catégorie restent nécessaires. Publier exige en
plus résumé, présentation et destination. La fiche publique présente le récit,
les sections spécifiques, tous les renseignements pratiques et la galerie facultative.

Les sélecteurs utilisent les destinations Firestore. Changer de pays réinitialise
ville et quartier ; le quartier reste facultatif. La gastronomie permet plusieurs
associations explicites : pays seul, ville ou quartier. Un restaurant associé ne
crée jamais implicitement une association géographique.

Les relations se sélectionnent par recherche de titre et par type, avec résultats
paginés, éléments sélectionnés, retrait et état vide. Les brouillons peuvent être
associés pour préparer un carnet ; une nouvelle association à une archive est
refusée. Une activité accepte un lieu touristique et un établissement organisateur.
Les deux côtés peuvent être édités, notamment les restaurants d’une spécialité et
les activités d’un lieu.

La sauvegarde explicite bloque les doubles soumissions et affiche une confirmation.
Un conflit de version demande de recharger. Les liens de sortie ouvrent un dialogue
si des modifications restent en cours ; fermeture ou rechargement du navigateur
utilise son avertissement natif. La prévisualisation ouvre la version enregistrée
dans un nouvel onglet, sans publier. La visibilité réelle est vérifiée côté serveur.

## Architecture Firestore

Les anciennes collections `tourism`, `activities`, `food`, `addresses` étaient des
fondations sans éditeur ni lecture publique. La collection commune permet une liste
centralisée et ses curseurs, sans fusion de quatre flux. Les anciens documents ne
sont ni supprimés ni convertis automatiquement.

| Collection | Rôle |
| --- | --- |
| `contents` | Documents discriminés par `type`, ID global stable |
| `contentSlugs` | Réservation privée `TYPE:SLUG`, champ `contentId` |
| `contentRelations` | Arêtes canoniques, deux références et index `memberKeys` |

`src/lib/contents/schema.ts` définit les schémas Zod stricts. `type` utilise les
slugs publics existants : `tourisme`, `activites`, `gastronomie`, `adresses`.
Les informations spécifiques vivent dans `details`, avec un schéma propre à l’univers.

Champs communs : `id`, `type`, `title`, `slug`, `summary`, `description`, `tags`,
`coverImage`, `coverPresentation`, `images`, `imageCaptions`, `photographCaption`,
`destinations`, `status`, `visibility`, `sources`, `verifiedAt`. Les références
photographiques sont des chemins locaux du registre commun, sans téléversement.
`coverPresentation` conserve le texte alternatif et le cadrage historiques.
Le registre et les crédits existants restent la source des photographies.

Métadonnées serveur : `schemaVersion: 1`, `locale: fr`, `createdAt`, `updatedAt`,
`publishedAt`, `archivedAt`, `isArchived`, `revision`, `searchTitle`, `geographyKeys`.
Dates ISO UTC ; les dates historiques sans heure sont normalisées à minuit UTC.
Les ID restent indépendants des titres, slugs et traductions futures.

`geographyKeys` est dérivé côté serveur des associations et de leurs ancêtres :
quartier + ville + pays. La ville retrouve ainsi contenus directs et de quartiers,
une seule fois. Tous les parents sont relus dans la transaction ; ils doivent
exister et ne pas être archivés. Un parent en brouillon reste autorisé.

La première publication fixe `publishedAt` et protège le slug, même après un retour
en brouillon ou une archive. La réservation est atomique, contrôlée contre les
documents existants et conservée pendant l’archivage. Archiver dépublie sans
supprimer les associations ; restaurer remet en brouillon. DELETE est refusé.

## Une seule source par relation

- `serves` : source Adresse → cible Gastronomie.
- `hosts` : source Activité → cible Tourisme ou Adresse.

Chaque extrémité contient exclusivement `{ id, type }`. La clé est
`TYPE_SOURCE:ID_SOURCE~TYPE_CIBLE:ID_CIBLE`. `memberKeys` contient les deux clés
`TYPE:ID` : l’inverse se retrouve par `array-contains`, sans lecture globale.
Les fiches ne stockent ni `specialtyIds` ni relations inverses. Ces champs des
modèles publics sont construits par l’adaptateur serveur.

La transaction vérifie types, existence, doublons et degrés avant d’enregistrer
fiche, réservation et arêtes. La révision des voisins change aussi lorsqu’une
relation est modifiée : deux formulaires ouverts depuis des côtés différents ne
peuvent pas s’écraser silencieusement. Une limite explicite de **40 relations par
fiche** borne transactions et lecture détaillée. Une activité a au plus un lieu
et un organisateur. Une évolution vers davantage de relations nécessitera une
édition paginée des associations.

## Requêtes, recherche et cache

La liste lit **24 documents + 1** au maximum, triés par `searchTitle` puis ID.
Les filtres type, statut, archives, destination et recherche s’appliquent dans
Firestore. Le curseur encode position et filtres ; ceux-ci doivent rester identiques
pour poursuivre. Aucun décalage ni lecture de toutes les fiches n’est utilisé.

La recherche administrative porte sur le **début du titre normalisé**, sans accents
ni casse ; elle ne recherche pas un mot au milieu du texte. Le sélecteur de relations
utilise la même requête. La recherche du catalogue public reste locale à la page
actuellement affichée.

En mode Firestore, les onglets interrogent seulement le type actif, avec statut
publié, visibilité publique, archive absente et clé géographique. Résultat paginé
à 24 + 1 ; « Découvertes suivantes » conserve l’onglet. Le changement d’onglet utilise
la navigation Next.js sur la même page et réinitialise le curseur. Le mode statique
conserve les quatre sélections locales.

Les index nécessaires aux combinaisons de filtres et à la requête publique sont
versionnés dans `firestore.indexes.json`. Les arêtes utilisent l’index simple de
`memberKeys`. Une fiche canonique est trouvée par type + slug, puis ses voisins
par références groupées, bornées à 40.

Le cache React est limité à la requête. Aucune visibilité ne persiste dans un cache
entre deux rendus : une dépublication parentale est revérifiée à la requête suivante.
Les sauvegardes invalident les destinations concernées, la fiche, l’ancienne adresse
de brouillon et ses voisins, y compris une relation retirée. Une erreur secondaire
d’invalidation ne présente jamais une écriture réussie comme un échec.

## Visibilité et sécurité

Une fiche est exposée si elle est publiée, publique, non archivée et possède au
moins une association géographique entièrement publique. Une spécialité partagée
peut rester visible dans une destination et perdre ses associations masquées.
Le serveur retire ces associations de sa projection publique. Une relation n’est
projetée que si ses deux extrémités restent publiques. Aucun lien vers un brouillon
ou une fiche privée ne remonte dans les résultats, le SEO ou les relations.

Pages, prévisualisation et recherche de relations vérifient le rôle administrateur.
Chaque mutation revérifie session Firebase, révocation et rôle, puis exige CSRF
et origine exacte. JSON limité à 100 Ko. Les schémas stricts refusent champs
techniques, références forgées et URL exécutables. React rend les textes sans
HTML injecté. Les images acceptées sont locales.

Les règles interdisent toute écriture de fiche, relation ou réservation depuis
le SDK client, même administrateur. Les lectures directes de `contents` et
`contentRelations` sont réservées aux administrateurs ; le public passe par les
projections serveur. Les anciennes collections restent en lecture administrateur
seulement. Le SDK Admin contourne les règles : contrôles serveur obligatoires.
Aucun upload Storage n’est ajouté.

## Migration et activation

Le `.env` conserve `NAGI_CONTENT_SOURCE=static`. Le mode `firestore` exige également
`NAGI_GEOGRAPHY_SOURCE=firestore`. Les sources ne sont jamais fusionnées et une panne
ne republie pas les démonstrations comme repli.

Le script reprend les **20 fiches existantes**, leurs ID, textes, sources, références
photographiques et relations. Il ne crée aucune destination. Les références sont
retrouvées par ID ou chaîne de slugs pays → ville → quartier pour réutiliser des
destinations ayant d’autres ID. Les destinations manquantes sont toutes signalées
avant écriture. D’anciennes collections non vides bloquent l’import : leurs données
personnalisées doivent faire l’objet d’une conversion explicite.

```sh
npm run contents:import -- --project=nagi-travelapp --dry-run
```

La simulation ne fait aucune écriture. L’application volontaire exige :

```sh
npm run contents:import -- --project=nagi-travelapp --apply --confirm-project=nagi-travelapp
```

Le projet doit correspondre aux deux ID d’environnement. La transaction crée
seulement les fiches et réservations manquantes. Une fiche au même slug conserve
son ID et n’est pas écrasée. Les arêtes initiales sont importées entre fiches
nouvellement créées ; un réimport ne rétablit pas une relation retirée. Un catalogue
préexistant nécessite donc une revue des associations, complétables dans l’éditeur.

Avant activation :

1. Compléter les destinations référencées, sans créer de doublons ; enregistrer
   les anciennes destinations au format courant avant la bascule.
2. Simuler l’import, examiner le résultat puis l’appliquer volontairement.
3. Déployer règles et index sur le projet vérifié, puis attendre leur disponibilité :

   ```sh
   npx firebase deploy --project nagi-travelapp --only firestore:rules,firestore:indexes
   ```

4. Vérifier fiches, associations et images dans l’administration.
5. Activer `NAGI_GEOGRAPHY_SOURCE=firestore` et `NAGI_CONTENT_SOURCE=firestore`
   dans un environnement de validation, puis sur le site, et redémarrer.
6. Vérifier onglets, routes, relations et dépublications.

La simulation sur le projet réel le 14 octobre 2026 a signalé des destinations
manquantes, notamment Asakusa, sans rien écrire. Cette livraison n’a déployé ni
index, ni règles, ni contenus réels. Voir `VALIDATION.md` pour les résultats.

## Vérification locale

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:contents
npm run test:firebase-rules
```

Les deux dernières commandes utilisent exclusivement `demo-nagi`. Java 21 ou
supérieur est nécessaire. Exécuter les suites d’émulateurs successivement : elles
partagent les ports. Le serveur de test est une copie isolée sur `3108` et ne
remplace pas le serveur de développement habituel.
