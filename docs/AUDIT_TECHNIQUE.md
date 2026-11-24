# Audit technique de Nagi du 24 novembre 2026

Les corrections restent dans le dépôt. Aucun déploiement, changement de données utilisateur ou changement de configuration distant n’a été effectué. Le design, les commandes et la personnalité du bot sont conservés. Les consultations Supabase distantes portent sur les avis et les catalogues PostgreSQL, sans lecture des lignes métier.

## État initial et sources de vérité

Git était propre. Les huit workspaces forment un graphe sans cycle : web Next.js, bot Discord.js, puis `shared`, `permissions`, `database`, `discord`, `ui` et `config`. Aucun import de package vers une application n’a été trouvé dans les imports déclarés. Les packages TypeScript sont consommés par la transpilation Next.js et le bundle tsup du bot ; ils n’exigent pas chacun un artefact de build autonome.

Les sources de vérité sont les migrations SQL pour l’intégrité, les droits et le journal transactionnel ; les validations de `packages/shared` pour les entrées ; les contrôles Discord serveur pour les appartenances ; les lignes confirmées et reçus SQL pour les sauvegardes. Une intention optimiste ou un Broadcast ne vaut pas confirmation.

| Contrôle initial                     | Résultat                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Lint                                 | Réussi                                                                                     |
| Typechecking des workspaces et tests | Réussi                                                                                     |
| Vitest                               | 643 tests dans 46 fichiers, réussis                                                        |
| Builds web et bot                    | Réussis                                                                                    |
| Prettier                             | Échec sur 276 fichiers à cause des fins de ligne CRLF ; réussite avec `--end-of-line auto` |
| Types SQL                            | Faux échec dû à la comparaison CRLF/LF sous Windows                                        |
| Dépendances                          | Deux avis : esbuild faible, minimatch modéré, dans l’outillage de développement            |
| Git                                  | Cache `.pnpm-store/v11/index.db` et fichier Next.js généré encore suivis                   |

Les premières commandes pnpm confinées échouaient à vérifier la signature du gestionnaire, faute d’accès au registre/cache. Les commandes avec accès au cache et au registre ont ensuite utilisé pnpm 12.21.0. Un lancement simultané du build et de `next typegen` a également provoqué un conflit sur `.next/types` pendant l’audit : les validations finales sont exécutées séparément.

## Corrections réalisées

| Priorité | Défaut avéré et fichiers                                                                                                                                                           | Correction et vérification                                                                                                                                                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Une galerie photo chargée à l’ouverture des détails pouvait lever `ChunkLoadError` hors ligne et remplacer tout le planificateur. `features/images/components.tsx`, `gallery.tsx`. | Import au clic, erreur locale explicite et nouvel essai possible. La recette collaborative vérifie les notes hors ligne, l’échec du module, la reconnexion et l’ouverture réussie de la galerie.                                                                                                                      |
| P1       | Une requête navigateur bloquée pouvait conserver indéfiniment une place dans la file. `features/trips/sync-client.ts`, `use-trip-mutations.ts`.                                    | Échéance de 30 secondes pour mutation et récupération, combinée à l’annulation de session. Les reprises conservent l’identifiant d’idempotence. Deux tests vérifient expiration et annulation.                                                                                                                        |
| P1       | Un snapshot complet passant en lecture seule conservait les intentions non confirmées. `features/trips/mutation-queue.ts`.                                                         | Même retrait des intentions et message explicite que lors d’un delta retirant les droits ; aucune émission en lecture seule. Deux tests couvrent la file hors ligne et une requête déjà en vol. SQL refusait déjà les écritures interdites : aucun contournement d’autorisation n’a été établi.                       |
| P2       | Les routes `mutations` et `external` lisaient le corps complet avant de limiter sa taille, en caractères plutôt qu’en octets.                                                      | Lecteur JSON commun dans `lib/request-body.ts`, aussi utilisé par les images : arrêt pendant la lecture, 413 au dépassement, UTF-8 strict et libération du lecteur. Limites conservées : 256 Kio pour voyages/Mapbox, 32 Kio pour images. Tests de flux, Unicode, faux Content-Length, JSON et routes.                |
| P2       | L’échec de l’enrichissement initial SSE pouvait arriver après allocation des ressources ; une exception de souscription ne nettoyait pas tout. Route `sync`.                       | Enrichissement avant allocation ; nettoyage du canal et des timers en cas d’échec de souscription, annulation ou déconnexion. Quatre tests couvrent ces cas.                                                                                                                                                          |
| P2       | Un corps JSON `null` sur une réponse 403 faisait perdre la classification de révocation ; un objet d’erreur pouvait devenir un message non textuel. `sync-client.ts`.              | Validation de la forme de l’erreur et conservation de la classification HTTP. Deux tests de régression.                                                                                                                                                                                                               |
| P2       | Deux dépendances de développement comportaient des avis connus. `pnpm-workspace.yaml`, lockfile.                                                                                   | Overrides limités à esbuild 0.27.7 → 0.28.2 et minimatch 10.2.6 → 11.0.1. Installation figée, lint, tests, builds et audit vérifiés. Aucun changement global de versions.                                                                                                                                             |
| P2       | Deux politiques de palette réévaluaient `auth.uid()` pour chaque ligne.                                                                                                            | Nouvelle migration `20261124183303_calendar_palette_rls_initplan.sql`, créée avec la CLI, utilisant `(select auth.uid())`. Prédicats, rôles et droits inchangés. EXPLAIN local confirme l’apparition d’InitPlan pour SELECT et DELETE ; tests d’isolation des palettes conservés. Migration non appliquée à distance. |
| P2       | Comparaison des types générés sensible aux fins de ligne ; recettes Python lisant l’UTF-8 comme CP1252 ; remplacement atomique d’un rapport parfois refusé sous Windows.           | Normalisation de comparaison, `.gitattributes`, encodage UTF-8 explicite des JSON de recette et reprises courtes sur les seuls refus de remplacement Windows. Génération, formatage et recettes réellement rejoués.                                                                                                   |
| P3       | Helpers et schémas d’anciens parcours sans consommateur applicatif.                                                                                                                | Retrait de `listCountries`, `listContent`, `createEntry`, `createRelation`, du type `ContentTable` et de deux anciens schémas. Recherche dans applications, commandes, scripts, documentation et tests ; les tests emploient les validations actuelles du catalogue.                                                  |
| P3       | Cache et fichier Next.js généré versionnés ; README incohérent sur pnpm et migrations.                                                                                             | Retrait du suivi Git uniquement, copies locales conservées ; exclusions des caches/logs Python ; pnpm 12.21.0 documenté, engine cohérent, package Discord et procédure Windows explicités.                                                                                                                            |

Les avis de dépendances sont [GHSA-g7r4-m6w7-qqqr pour esbuild](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr) et [GHSA-g3hv-75wg-m249 pour minimatch](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).

## Sécurité, base de données et architecture

Les contrôles existants utiles sont conservés : PKCE Discord, redirections internes, cookies HttpOnly/SameSite=Lax/Secure sur HTTPS, suppression des credentials fournisseur des cookies, chiffrement AES-GCM lié au compte, renouvellement sous lease versionné, vérification serveur des appartenances, RLS indépendante et médias privés autorisés avant lecture du cache. Les tests des migrations couvrent notamment l’isolation interserveurs, les écritures concurrentes, les reçus d’idempotence, la confidentialité et la suppression de comptes. Deux tests supplémentaires surveillent globalement RLS et les privilèges des fonctions.

Les catalogues PostgreSQL locaux et distants confirment zéro table publique sans RLS, zéro fonction privilégiée sans `search_path` fixé et zéro fonction privilégiée exécutable par le rôle `PUBLIC`. L’autorisation explicite de `anon` sur `is_nagi_admin()` est distincte de `PUBLIC` : ce prédicat lit uniquement l’identité courante et retourne faux pour un appel anonyme. Les RPC exposées aux comptes authentifiés ont leurs propres contrôles d’identité et de droits ; leur exposition intentionnelle n’est pas comptabilisée comme une vulnérabilité corrigée.

Les dix avis « RLS sans politique » concernent des tables volontairement interdites aux comptes ordinaires, notamment journaux privés, archives et files de nettoyage. Ajouter une politique permissive pour faire disparaître ces avis affaiblirait la protection. Les avis distants sont des observations horodatées, pas une certification exhaustive.

La séparation SSE/Realtime/journal est justifiée : Realtime signale, SSE transporte les résultats autorisés et le journal SQL permet la reprise. Le polling sert de rattrapage. La file demeure uniquement en mémoire avec avertissement de fermeture quand des opérations attendent ; aucune persistance de notes privées supplémentaire n’a été introduite.

Les anciennes migrations Google et leur archive sont conservées pour l’historique et la préservation des références. Aucun SDK Google Maps/Places n’est chargé dans la recette navigateur. Serper demeure une intégration actuelle. Les fournisseurs photo facultatifs ne sont pas activés par l’audit.

Le bot conserve ses trois commandes, son acquittement avant travail réseau, ses réponses et ses contrôles Nagi distincts des rôles Discord. Le lease, le heartbeat, la synchronisation conditionnelle du registre et le retrait des listeners à l’arrêt sont conservés. Les tests de commandes/API simulées et le build du bot passent ; aucun bot réel n’a été lancé.

## Mesures reproductibles

Le benchmark final utilise le build Next.js de production, PostgreSQL embarqué avec les migrations et RPC réelles, Chromium 1440 × 1000 et 500 ms de latence SQL injectée. Vingt échantillons suivent un échauffement pour chaque interaction. Ce sont des mesures locales, sans comparaison temporelle avant/après équivalente.

| Interaction            | Affichage médian / p95 | Confirmation médiane / p95 |
| ---------------------- | ---------------------- | -------------------------- |
| Couleur                | 33,8 / 47,9 ms         | 633,8 / 666,1 ms           |
| Horaire                | 14,8 / 23,1 ms         | 601,8 / 624,6 ms           |
| Réorganisation d’arrêt | 13,1 / 19,1 ms         | 591,4 / 620,4 ms           |

Chaque interaction mesurée produit une requête navigateur et aucune relecture complète du voyage. Les confirmations incluent la latence injectée. La recette CRUD mesure 8,4 ms pour l’ajout, 7,7 ms pour une journée et 18,6 ms pour le retrait avec deux secondes injectées.

Sur vingt modifications entre deux comptes, le délai commit SQL → affichage distant est de 80,5 ms en médiane et 101 ms au p95 ; le délai depuis l’interaction, incluant 500 ms injectées, est de 658 / 693 ms. Le scénario indépendant de 500 activités sur 14 jours rend 254 événements en vue semaine : frame médiane 16,7 ms, p95 83,3 ms et maximum 216,6 ms, avec zéro erreur navigateur. Ces frames incluent un véritable drag et son annulation ; elles signalent une limite à profiler et ne prouvent pas un gain de fluidité.

L’inventaire de tous les chunks JavaScript passe de 101 fichiers / 2 319 613 octets à 102 / 2 317 590 octets. La somme compressée gzip passe de 748 455 à 749 034 octets, soit +579 octets. Cet inventaire inclut les chunks différés : il ne mesure pas le transfert initial d’une page. La correction évite désormais de demander le module de galerie à l’ouverture des notes ; le test réseau hors ligne échouait avant et réussit après. Aucune réduction importante de bundle n’est revendiquée.

Les fichiers de mesures et captures restent dans `artifacts/audit/`, ignoré par Git. Ils contiennent exclusivement les données de recette. Les procédures maintenues sont dans [la recette du planificateur](../scripts/qa/trips/README.md).

## Validations finales

| Commande ou recette                         | Résultat                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline`  | Réussi, lockfile inchangé                                                                                              |
| `pnpm audit --json`                         | Aucun avis connu après correction                                                                                      |
| `pnpm lint`                                 | Réussi, zéro avertissement                                                                                             |
| `pnpm format:check`                         | Réussi                                                                                                                 |
| `pnpm typecheck`                            | Réussi sur les sept workspaces ayant du code et les tests                                                              |
| `pnpm test`                                 | 667 tests dans 50 fichiers, réussis                                                                                    |
| `pnpm db:types:check` et `pnpm icons:check` | Réussis                                                                                                                |
| `pnpm build`                                | Web et bot réussis ; packages internes consommés par ces builds                                                        |
| `pnpm test:mapbox-ui`                       | Neuf écrans, trois cas d’économie d’images, aucune erreur d’exécution                                                  |
| `crud.py`                                   | Ajouts, journée, retrait, mobile 320/390 px et thème sombre réussis                                                    |
| `calendar.py`                               | Huit scénarios, géométrie, fuseau, clavier, drag, couleurs et responsive réussis                                       |
| `catalog.py`                                | Douze scénarios, visites répétées, arrêts, dépôts et synchronisation réussis                                           |
| `collaboration.py`                          | Neuf scénarios, dont vingt couleurs entre deux comptes et échec/reprise de galerie hors ligne, réussis                 |
| `benchmark.py`                              | Soixante échantillons utiles, mesures ci-dessus                                                                        |
| `synchronization.py`                        | Vingt propagations entre deux comptes, aucune erreur navigateur                                                        |
| `large.py`                                  | 500 activités / 14 jours, dix interactions, déplacement annulé et aucune erreur navigateur ; frames lentes documentées |
| `python -m compileall -q scripts/qa`        | Réussi                                                                                                                 |
| `git diff --check`                          | Réussi                                                                                                                 |

Les nouveaux tests sur les anciennes implémentations ont reproduit six échecs dans quatre fichiers avant restauration des corrections. Le défaut de module photo a aussi été reproduit sur le vrai build avant correction.

## Statistiques et limites restantes

La CI exécute désormais `pnpm audit` après l’installation figée afin de signaler les futurs avis connus. Cette étape dépend de la disponibilité du registre, déjà nécessaire à l’installation.

- 24 tests unitaires/intégration ajoutés ; une recette collaborative étendue et une validation existante réorientée vers les schémas réellement utilisés.
- Six défauts runtime corrigés, plus les problèmes d’outillage Windows ; deux avis de dépendances corrigés.
- Quatre helpers et deux schémas obsolètes retirés ; zéro dépendance directe supprimée ou ajoutée.
- Deux artefacts retirés du suivi Git ; zéro fichier applicatif supprimé et copies locales préservées.
- Une migration additive préparée, aucune migration historique réécrite et aucune migration distante exécutée.
- Diff textuel final : 44 fichiers concernés, 735 lignes ajoutées et 539 retirées, documentation, tests et lockfile inclus ; ce volume ne mesure pas à lui seul la qualité du changement.
- Les six valeurs de secrets serveur présentes localement ont été recherchées dans les chunks client ; aucune occurrence n’a été trouvée. Cela ne constitue pas une analyse de tout l’historique Git.

La migration RLS reste à intégrer au prochain déploiement autorisé. Les deux avis [Auth RLS Initialization Plan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) resteront donc visibles sur la base distante jusque-là.

Cinq clés étrangères sans index couvrant et vingt-neuf index déclarés inutilisés sont des pistes à confronter à une charge représentative ; aucun index n’a été ajouté ou supprimé arbitrairement. Voir les avis [clés étrangères](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) et [index inutilisés](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). L’avis [protection des mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) doit être interprété avec la configuration des fournisseurs distants : le parcours du dépôt utilise exclusivement Discord, sans mot de passe.

Le flux OAuth Discord réel, la reconnexion Gateway du bot hébergé, les quotas et disponibilités des fournisseurs payants et les réglages d’hébergement n’ont pas été exercés avec des comptes réels. Les performances WAN/production et l’exhaustivité des secrets historiques ne sont pas établies par les recettes isolées. Le scénario de 500 activités présente des frames lentes dans l’environnement de test ; son profil mérite une mesure dédiée avant de décider d’une virtualisation ou d’un changement de rendu.
