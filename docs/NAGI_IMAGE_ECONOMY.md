# Résolveur d’images — bibliothèque fixe de dix photos

Politique du 24 novembre 2026. Elle remplace les anciennes galeries paginées et la relance manuelle.

## Comportement

- Un lieu sans photo ni tentative antérieure peut déclencher **une seule requête Serper**, page 1, `num=10`. Les réponses invalides ou dupliquées peuvent donner moins de dix images. Aucun appel supplémentaire ne complète les résultats.
- Les références reçues sont conservées en base. Réouverture, rechargement de la page et nouvelle occurrence du même lieu réutilisent ces données. L’identité est la source et l’identifiant stable du lieu ; les homonymes ne sont pas fusionnés.
- **Aucun bouton de rechargement et aucune continuation payante.** L’API refuse les anciens paramètres `refresh=true` et `continue=true`. Le service et la réservation SQL bloquent aussi ces paramètres pour une galerie déjà tentée, même après expiration du bail ou des anciens délais.
- Une tentative vide, interrompue ou échouée reste définitive. Le pictogramme reste disponible ; aucune relance automatique ou manuelle ne consomme un autre crédit. Un quota atteint avant toute réservation n’est pas une tentative.
- Les ouvertures simultanées partagent une réservation. Une requête réservée conserve sa réponse même si la modale est fermée. L’attente d’un autre travailleur interroge uniquement Supabase.
- **Dix choix maximum au total**, y compris les photographies autorisées issues du cache. Les galeries anciennes de plusieurs centaines de références affichent dix choix. Le filtre porte uniquement sur ces dix photos et les offsets ne donnent pas accès aux suivantes.
- Une couverture déjà choisie reste conservée et figure dans les dix choix lorsqu’elle est disponible, même si elle appartenait à une ancienne page. Les autres références historiques restent stockées ; aucune photo, sélection ou donnée de voyage n’est supprimée.

Depuis le 25 novembre 2026, les photos Serper sont validées automatiquement pour Nagi, sans changer les plafonds ni la politique de cache décrits ici. Voir [la validation automatique](NAGI_AUTOMATIC_PHOTO_APPROVAL.md).

## Configuration

```env
SERPER_IMAGES_PAGE_SIZE=10
SERPER_IMAGES_MAX_PAGES=1
SERPER_IMAGES_MAX_TOTAL_PAGES=1
SERPER_IMAGES_MAX_CONCURRENT_REQUESTS=1
SERPER_IMAGES_GLOBAL_DAILY_LIMIT=50
SERPER_IMAGES_USER_DAILY_LIMIT=20
SERPER_IMAGES_USER_MINUTE_LIMIT=6
```

Les variables de taille et pagination sont conservées pour compatibilité : le code impose dix résultats et une seule page, même avec d’anciennes valeurs à 20 ou 100. `SERPER_IMAGES_REFRESH_SECONDS` est supprimée ; aucun délai ne permet une relance.

Le plafond partagé reste de cinquante réservations par jour. Les administrateurs utilisent ce plafond ; les autres membres ont aussi un plafond personnel de vingt. Six réservations par minute restent autorisées. Les compteurs historiques ne sont pas réinitialisés. Les crédits effectivement renvoyés par Serper sont enregistrés séparément.

## Base

Migration appliquée via le CLI au projet Nagi lié : `20261124170000_fixed_place_photo_library.sql`, après les migrations économiques `20261124150000` et `20261124160000`.

Elle remplace les fonctions `reserve_image_discovery` et `finish_image_discovery`, conserve leurs signatures et leurs permissions réservées au serveur, bloque les anciennes relances et tronque les réponses d’anciens travailleurs à dix références. Elle ne modifie ni ne supprime les données existantes.

## Vérifications

La suite couvre les galeries de quatre-vingts photos, les filtres et offsets, les couvertures anciennes conservées, le plafond partagé avec les photos autorisées, les tentatives vides ou interrompues, les ouvertures simultanées, les quotas et le refus des anciennes relances.

Le parcours navigateur utilise les composants réels avec un transport simulé : dix miniatures, aucun bouton de relance ni pagination, filtre limité à ces dix choix, un seul appel initial, réouverture gratuite et absence de nouvelle tentative après échec. Les parcours existants de carte, calendrier, attribution et sélection de couverture restent vérifiés.

Validation finale : **643 tests passent dans 46 fichiers**, ainsi que TypeScript, ESLint et le build de production isolé `.next/fixed-images-qa`. Les parcours navigateur passent en mode normal et en aperçu privé sous React StrictMode, sans erreur d’exécution. Le contrôle distant de sept galeries, dont quatre contrôles applicatifs, ne déclenche aucun appel Serper et ne consomme aucun crédit. La comparaison des quatorze tables avant/après migration confirme des données identiques, notamment les 1 490 références, 33 images externes et trois sélections officielles présentes au moment du contrôle.

Le contrôle distant sans appel fournisseur se reproduit avec :

```sh
NAGI_IMAGE_LIVE_QA=1 node scripts/qa/images/serper.mjs --economy-cached
```

Il vérifie les anciennes demandes SQL de rechargement et continuation, la réutilisation du cache applicatif et le plafond de dix choix. Les preuves privées sont enregistrées dans `artifacts/serper-economy/`, ignoré par Git. Un audit payant de plusieurs lieux exige `--all-places` explicitement.

Un précédent test réseau avec `num=10`, page 1, a renvoyé dix images et un crédit sur ce compte. Aucun appel Serper supplémentaire n’est nécessaire pour vérifier ce verrouillage.
