# Catalogue Firestore — géographie active et contenus préparatoires

La géographie est maintenant définie par les modèles Zod de `src/lib/geography/schema.ts`. [GEOGRAPHY.md](GEOGRAPHY.md) décrit les collections actives, les réservations de slugs, l’archivage, la migration et la visibilité héritée. Les paragraphes ci-dessous restent une proposition pour les quatre univers, non encore administrés.

La bascule géographique est contrôlée par `NAGI_GEOGRAPHY_SOURCE` et ne mélange pas les sources. Les quatre univers conservent leurs données statiques. Les interfaces préparatoires sont dans
`src/types/firestore.ts` et réutilisent les modèles métier existants.

| Collection racine | Modèle | Relation stable |
| --- | --- | --- |
| `countries` | `ManagedCountry` | ID actuel, ex. `country-jp` |
| `cities` | `ManagedCity` | `countryId` → `countries` |
| `districts` | `ManagedDistrict` | `cityId` → `cities` |
| `tourism` | `TourismDiscovery` | `location: { kind: 'city' ou 'district', id }` |
| `activities` | `ActivityDiscovery` | `location`, `venue` optionnel vers tourisme ou adresse |
| `food` | `FoodDiscovery` | `destinations[]` → pays, villes ou quartiers |
| `addresses` | `AddressDiscovery` | `location`, `specialtyIds[]` → `food` |

L’ID Firestore reprend exactement l’ID statique et reste indépendant du slug.
Chaque document conserve `id` pour faciliter les adaptateurs futurs ; l’ID de
document est la référence faisant autorité. Les slugs restent des valeurs de
routage modifiables. Les types `universe` actuels restent inchangés ; la collection
anglaise est un détail de persistance, pas une nouvelle URL publique.

Une ville possède un seul pays, un quartier une seule ville. Les lieux et
activités n’ont qu’un parent local ; ville et pays sont dérivés. Les spécialités
sont partagées entre plusieurs destinations. La relation avec les établissements
reste définie uniquement par `addresses.specialtyIds` : ne pas ajouter un second
tableau d’adresses dans `food` qui risquerait de diverger.

Tous les documents de catalogue ajoutent `status: 'draft' | 'published'` et
`visibility: 'public' | 'private'`. L’import géographique reprend explicitement la publication des destinations actuelles. Ne pas
considérer une valeur absente comme publiée. `createdAt` et `updatedAt` utilisent
des chaînes ISO 8601 UTC ; les dates statiques au format date seule seront
normalisées lors de la migration. Ne pas mélanger des `Timestamp` et des chaînes.

Un document publié public est lisible dans son **intégralité** : réserver les
notes internes et les données d’audit utilisateur à de futures collections
privées distinctes, fermées par défaut. Les sources et la date de vérification
éditoriale peuvent rester publiques. Les règles n’assurent pas de projection
masquant des champs privés.

Pour les futures listes publiques, filtrer simultanément `status == 'published'`
et `visibility == 'public'` : les règles ne filtrent pas les résultats à la place
d’une requête. Les index composites seront ajoutés selon les requêtes réellement
utilisées, par exemple lieu + statut + visibilité + tri. Éviter les collections
profondément imbriquées et prévoir la pagination avant les grandes listes.

`readAdminCatalogueDocument()` offre une première lecture serveur brute et
protégée. Elle n’est utilisée par aucune page actuelle et ne prétend pas valider
le document en un modèle TypeScript. Ajouter les parseurs et convertisseurs de
chaque entité lors de la migration avant de brancher les composants publics.
Le SDK Admin contournant les règles, cette fonction appelle `requireAdmin()`.

Ces contrôles sont opérationnels pour la géographie. Pour les futurs formulaires des quatre univers, prévoir validation runtime, intégrité des destinations, unicité des slugs, dates serveur et transitions de publication. L’audit privé et les références de médias seront
définis lorsque les fonctionnalités correspondantes seront développées.

La future migration devra être rejouable à partir des identifiants actuels,
contrôler les relations, comparer les contenus et conserver un retour possible
aux données statiques avant le basculement public.
