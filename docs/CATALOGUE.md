# Catalogue Nagi — conventions de l’étape 03

## Modèle

`src/types/discoveries.ts` expose une union discriminée `Discovery` : `TourismDiscovery`, `ActivityDiscovery`, `FoodDiscovery` et `AddressDiscovery`. Le discriminant `universe` utilise `tourisme`, `activites`, `gastronomie` ou `adresses`. Chaque fiche a un identifiant stable, un slug unique dans son univers, des textes, des tags, un statut, des dates et des sources. Les photographies, galeries et informations pratiques inconnues restent facultatives.

Les dates `createdAt` et `updatedAt` sont des dates ISO éditoriales. `verifiedAt` désigne la consultation des sources de la fiche ; elle ne garantit pas qu’un établissement est ouvert ni que les informations restent inchangées. Les prix, horaires et attentes n’ont pas été inventés pour le jeu de démonstration.

Un lieu touristique, une activité ou une adresse possède un seul rattachement `location: { kind, id }`, à une ville ou un quartier. La ville et le pays parents sont dérivés du catalogue géographique. Une spécialité possède plusieurs références `destinations`, qui peuvent aussi viser un pays. Les noms et slugs ne servent jamais de clés de relation.

Les activités distinguent `editorial-idea` et `offered-experience`. Les quatre exemples sont des idées : thé, wagashi, furoshiki et promenade autonome de croquis à Ueno. Aucun prestataire, prix, disponibilité ou réservation n’est suggéré comme vérifié. L’interface affiche un lien de réservation seulement pour une expérience proposée dont ce lien est renseigné.

## Règles géographiques

| Destination consultée | Associations incluses |
| --- | --- |
| Quartier | Références explicites à ce quartier seulement |
| Ville, dans la couche de lecture | Références à la ville et à chacun de ses quartiers ; catalogue affiché avec ou sans subdivision |
| Pays, dans la couche de lecture | Références au pays, à ses villes et à leurs quartiers |

Une association nationale ou municipale **ne descend pas automatiquement** dans les quartiers. Cela évite de présenter une spécialité ou un établissement comme lié à un quartier sans association explicite. Pour une pertinence à plusieurs niveaux, une spécialité peut comporter plusieurs références ; la requête filtre la collection de fiches, donc elle ne produit jamais de doublon.

Exemples : le tonkatsu est lié à Tokyo, Shinjuku et Ginza mais n’apparaît qu’une fois dans les résultats de lecture agrégés pour Tokyo. L’interface de Tokyo présente ses cinq quartiers ; les contenus se consultent dans chacun d’eux. L’okonomiyaki est lié à Osaka et Asakusa. Maisen Aoyama appartient directement à Tokyo, car Omotesandō n’est pas l’un des quartiers modélisés ; sa fiche reste accessible depuis la relation avec le tonkatsu. Fujiyoshida possède Honchō-dōri directement ; ses catégories vides sont conservées avec un état éditorial adapté.

Les catégories sont des onglets sur toutes les pages Ville et Quartier. `?onglet=gastronomie` sélectionne la catégorie ; l’absence du paramètre, une valeur inconnue ou plusieurs valeurs reviennent à Tourisme. Le segment `explorer` reste réservé pour rediriger les anciens liens en 308 vers la page géographique et le bon onglet. Les villes avec quartiers conservent leurs propres onglets et contenus directs. Les URLs de fiches ne comportent aucun segment de destination : `/decouvertes/[universe]/[slug]`.

## Relations et fonctions

| Relation ou besoin | Source et lecture |
| --- | --- |
| Adresse → spécialités | `AddressDiscovery.specialtyIds` ; `getSpecialtiesForAddress()` |
| Spécialité → adresses | Relation inverse dérivée par `getAddressesForSpecialty()` |
| Activité → lieu ou établissement | `ActivityDiscovery.venue`, avec type et identifiant ; `getAssociatedVenue()` |
| Lieu ou établissement → activités | Relation inverse dérivée par `getActivitiesForVenue()` |
| Contenus d’une destination | `getDiscoveriesForDestination(scope, universe?)` |
| Fiche canonique | `getDiscoveryBySlug(universe, slug)` et `discoveryPath()` |
| Suggestions | Même univers, au moins un tag commun et périmètres géographiques compatibles ; `getSimilarDiscoveries()` |
| Recherche | `filterDiscoveryCards()`, indépendante des composants et du catalogue global |

Toutes les fonctions publiques de lecture excluent les brouillons, y compris dans les relations et les paramètres statiques. Les références inconnues renvoient `undefined` ou une collection vide. Les adaptateurs de pages appellent `notFound()` si la destination, l’univers, la fiche ou la chaîne des parents est invalide.

Le contexte `?depuis=<identifiant de destination>&univers=<univers d’origine>` sert uniquement à la navigation. Les composants valident les valeurs contre une liste connue ; ils n’acceptent aucun URL de retour fourni directement. Les liens entre fiches transmettent ce contexte et le retour retrouve la sélection d’origine via `?onglet=…#univers`, y compris pour une ville avec quartiers. La balise canonique ignore toujours ces paramètres. Le fil d’Ariane stable privilégie une association précise, puis la ville, et conserve son lien vers l’univers. `explorerPath()` et les retours utilisent la même règle de destination.

## Onglets et historique

`PlaceUniverses` utilise la géographie publique active et la source explicite des fiches. Le mode statique répartit les cartes locales ; le mode Firestore interroge uniquement l’onglet actif et sa destination, par pages de 24 fiches. `DestinationTabs` reçoit ces sélections, sans dupliquer les données éditoriales. Le panneau actif est déterminé par `useSearchParams` ; il n’existe pas de second état React de sélection susceptible de diverger de l’historique.

Un clic ajoute une entrée avec `history.pushState`, que Next.js synchronise avec ses hooks. Il ne provoque ni changement de route, ni requête RSC de navigation, ni défilement programmé. Le chemin, les autres paramètres et l’ancre existante sont conservés. Précédent/Suivant rétablissent la sélection depuis l’URL. Un clic sur l’onglet déjà actif n’ajoute pas d’entrée.

Les liens d’onglets restent de vrais liens pour le partage et l’ouverture dans un nouvel onglet. Avec JavaScript, ils sont interceptés pour changer uniquement le panneau. Sans JavaScript, le serveur rend l’onglet demandé après une navigation normale. Les pages Ville et Quartier utilisent `connection()` pour produire le bon HTML dès le premier chargement d’un lien partagé. Leurs métadonnées et URL canoniques ne varient pas selon l’onglet ; les fiches détaillées sont également rendues à la requête pour tenir compte des destinations dépubliées.

Les rôles `tablist`, `tab` et `tabpanel`, les relations ARIA et le focus mobile suivent le [modèle d’onglets WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Les flèches gauche/droite activent les onglets avec boucle ; Début/Fin rejoignent les extrémités ; Entrée/Espace activent l’onglet. Les touches haut/bas conservent leur fonction de défilement. Un seul onglet entre dans l’ordre de tabulation et les panneaux masqués ne sont pas accessibles au focus.

Le panneau garde une hauteur minimale pour limiter les sauts entre une grille et un état vide. Les recherches et filtres sont réinitialisés lorsque l’on change d’univers. Les images des panneaux inactifs ne sont pas montées. Sur mobile, la barre reste horizontale et défile si les quatre libellés ne tiennent pas dans la largeur disponible.

`src/proxy.ts` intercepte les routes géographiques et les fiches canoniques, en utilisant leurs sources publiques actives et en contrôlant leur visibilité. Le validateur pur `isKnownGeographicRoute()` vérifie la chaîne pays/ville/quartier et les anciens segments de catégories. Un chemin invalide est réécrit vers la 404 statique existante, avec statut 404 et URL inchangée : cela préserve le HTML complet de la page d’erreur malgré le comportement observé de Next 16.4 pour `notFound()` sur ces routes dynamiques.

## Organisation et évolution

Les contenus sont répartis dans `fixtures/catalogue/catalogue/` par univers, puis réunis dans `fixtures/catalogue/discoveries.ts`. Les valeurs communes de publication ne sont déclarées qu’une fois. Les ressources photographiques et leurs crédits vivent dans leur registre, distinct des textes éditoriaux.

Les pages publiques sont des Server Components et utilisent exclusivement Firestore. Les exemples ci-dessus ne sont plus une source du site ; ils restent disponibles uniquement pour un import volontaire ou les tests. Les onglets chargent leur page de résultats côté serveur et conservent leur URL. Voir [PUBLIC_DATA.md](PUBLIC_DATA.md) pour la recherche, la pagination et la confidentialité.

Pour ajouter une fiche : créer un identifiant, choisir un slug libre dans son univers, renseigner le parent ou les destinations, puis ajouter uniquement les relations de référence. Ajouter les sources et les crédits de toute photo. Lancer `npm test`, `npm run lint`, `npm run typecheck` et `npm run build`, puis vérifier le serveur avec `npm run test:routes`. Le nombre attendu dans ce dernier script est celui du jeu de démonstration actuel et doit évoluer lorsque des pages sont ajoutées.

L’administration, les requêtes Firestore, les arêtes de relations, les index et la migration sont désormais implémentés. Voir [CONTENTS.md](CONTENTS.md). Les fonctions pures ci-dessus restent utiles pour le catalogue statique et le rendu des voisins déjà chargés ; elles ne servent pas à charger toute la base Firestore.

## Vérification

Les tests couvrent les cas métier demandés, la recherche accentuée, les données absentes, les associations invalides, les brouillons, les URL d’onglet et la logique du clavier. Le parcours HTTP part de l’accueil et contrôle les 32 pages, les 36 variantes d’onglets, la sélection initiale et les attributs ARIA, les images, les canoniques, les redirections et les 404. La relecture d’un historique est simulée dans un test pur ; elle ne remplace pas un parcours Précédent/Suivant réel après hydratation. Les limites visuelles et interactives sont indiquées dans `VALIDATION.md`.
