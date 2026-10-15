# Catalogue Firestore — schéma actif

Les schémas Zod sont la référence runtime : `src/lib/geography/schema.ts` pour
la géographie, `src/lib/contents/schema.ts` pour les fiches et leurs relations.

| Collection | Document | Références |
| --- | --- | --- |
| `countries` | `ManagedCountry` | ID stable |
| `cities` | `ManagedCity` | `countryId` |
| `districts` | `ManagedDistrict` | `cityId` |
| `geographySlugs` | Réservation géographique privée | Destination et périmètre |
| `contents` | `ManagedContent`, discriminé par `type` | `destinations[]`, clés d’agrégation dérivées |
| `contentSlugs` | Réservation de fiche privée | Univers + slug → ID de fiche |
| `contentRelations` | `ContentRelation` | Deux références `{ id, type }`, index `memberKeys` |

Le modèle commun réutilise les quatre types de rendu publics. Les anciennes
collections `tourism`, `activities`, `food`, `addresses` sont conservées sans
écriture client ni raccordement public. L’import refuse de les ignorer si elles
contiennent des données personnalisées.

Les ID sont indépendants des slugs. Les dates sont des chaînes ISO UTC. Une
première publication protège l’adresse ; une archive conserve données et
réservations. `revision` refuse les éditions concurrentes périmées. Une relation
n’existe qu’une fois, dans une arête canonique qui ne copie pas ses cibles.
Les champs publics historiques `specialtyIds` et `venue` sont calculés par projection.

Les requêtes publiques de fiches utilisent statut, visibilité, absence d’archive,
univers et clé géographique. Parents et extrémités des relations sont vérifiés
avant projection. Les règles n’autorisent aucune lecture publique directe des
fiches complètes. Toute écriture passe par un contrôleur autorisé, protégé contre
les requêtes intersites et validant les données côté serveur.

Firestore est la seule source publique depuis l’étape 09. Imports et déploiements
restent des actions volontaires ; voir [PUBLIC_DATA.md](PUBLIC_DATA.md).

Voir [la géographie](GEOGRAPHY.md) et [les quatre univers](CONTENTS.md) pour les
champs, invariants, index, limites et procédures de migration et de bascule.
