# Nagi v3 · Espaces Discord et voyages

Un socle commun pour une application de voyage et son bot Discord. Le web et le bot sont deux processus indépendants, reliés à Supabase PostgreSQL. Aucune destination ni statistique de démonstration n’est intégrée.

## Démarrage

Prérequis : **Node.js 24 ou supérieur**, **pnpm 11.12.0**, un projet Supabase et une application Discord. Docker est nécessaire uniquement si vous choisissez Supabase en local. Utiliser exclusivement pnpm ; le lockfile est versionné.

```sh
pnpm install
cp .env.example .env
```

Renseigner `.env`, appliquer la migration et configurer Discord selon les étapes ci-dessous, puis :

```sh
pnpm dev       # Next.js + bot, via Turborepo
pnpm dev:web   # web seul : http://localhost:3000
pnpm dev:bot   # bot seul, rechargement avec tsx watch
```

Les processus chargent le `.env` **à la racine**. Les variables du système priment sur le fichier. Une configuration obligatoire manquante provoque une erreur explicite au démarrage, sans afficher les valeurs des secrets. Le build ne nécessite pas de connexion aux services externes.

Comme Kitsu, les lancements web `dev` et `start` utilisent une limite d’en-têtes de 32 Kio et des cookies de session compacts. Les cookies de tous les projets sur `localhost` sont envoyés quel que soit le port ; leur accumulation peut provoquer une erreur 431 avant même que Next.js ne reçoive la requête. Une fenêtre privée permet de vérifier ce diagnostic. Supprimer tous les cookies `localhost` déconnecte également les autres applications locales : privilégier les anciens cookies du projet concerné.

## Organisation

```text
apps/web          Next.js App Router : public, OAuth, /app, /admin
apps/bot          Discord.js : modules de commandes, handler, worker
packages/shared   validations Zod, types métier, environnement, heartbeat
packages/permissions  règles de rôles communes aux deux backends
packages/database client typé et services métier communs
packages/ui       composants shadcn/ui fondés sur Radix + tokens Tailwind
packages/config   TypeScript strict commun
supabase/migrations  schéma, contraintes, RLS, file et verrous
scripts           génération des types PostgreSQL
tests             tests Vitest, API Discord simulée et PostgreSQL embarqué
```

Next.js 16.4, React 19.3, Tailwind 4, Discord.js 14, Supabase JS 2, Zod 4. Les versions exactes résolues sont figées dans `pnpm-lock.yaml`. Webpack est utilisé pour le web ; il évite les contraintes de sockets auxiliaires de Turbopack dans les environnements restreints. ESLint 9 est conservé pour les plages de compatibilité déclarées par les plugins Next.js.

La couleur principale de Nagi est `#73A6DF`. Les tokens clair/sombre et leurs variantes de texte contrastées sont définis dans `apps/web/src/app/globals.css`. Le logo fourni est conservé dans `apps/web/public/nagi-logo.png` et utilisé dans la navigation, la connexion et l’icône du navigateur. Les embeds Discord reprennent le même bleu.

## 1. Supabase

1. Créer un projet dans [Supabase](https://supabase.com/dashboard).
2. Copier l’URL et la clé publique `anon` (ou publishable) dans `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Copier la clé `service_role` (ou secret serveur) dans `SUPABASE_SERVICE_ROLE_KEY`. Elle reste exclusivement dans les backends.
4. Dans **Authentication → Sign In / Providers**, désactiver email, téléphone et tous les fournisseurs autres que Discord. Ne pas désactiver les inscriptions OAuth si vous souhaitez accueillir de nouveaux utilisateurs.
5. Dans **Authentication → URL Configuration**, définir Site URL sur `NEXT_PUBLIC_APP_URL`. Autoriser précisément `http://localhost:3000/auth/callback` en développement et `https://votre-domaine/auth/callback` en production. Éviter les jokers en production.
6. Appliquer les migrations avant de lancer les applications.

Avec la CLI Supabase :

```sh
pnpm dlx supabase@3.2.0 login
pnpm dlx supabase@3.2.0 link --project-ref VOTRE_PROJECT_REF
pnpm dlx supabase@3.2.0 db push --remote
pnpm dlx supabase@3.2.0 migration list --remote
```

La CLI applique tous les fichiers de `supabase/migrations` dans l’ordre et enregistre les versions exécutées. Ne pas réexécuter une migration déjà appliquée dans SQL Editor ; les corrections et évolutions utilisent de nouveaux fichiers de migration.

En local, démarrer Docker, fournir `DISCORD_APPLICATION_ID` et `DISCORD_CLIENT_SECRET` à la CLI, puis :

```sh
pnpm dlx supabase start
pnpm dlx supabase db reset
```

La CLI doit recevoir ces variables dans son environnement ; les commandes `pnpm dlx` ne chargent pas automatiquement `.env`. Le callback Discord local de Supabase est `http://localhost:54321/auth/v1/callback`. Le fichier `supabase/config.toml` désactive déjà les inscriptions email/SMS. Copier les URL et clés locales affichées par la CLI dans `.env`.

### Modèle et garanties SQL

- Pays → ville → quartier facultatif → catégorie → fiche. Le quartier est facultatif ; la catégorie est portée par la fiche.
- `cities.neighborhoods_enabled` contrôle l’utilisation des quartiers. Une clé étrangère composite empêche les quartiers d’une autre ville. Désactiver les quartiers d’une ville exige de détacher d’abord les fiches concernées.
- Slugs uniques par pays, ville ou `(ville, catégorie)` selon l’entité.
- Relations nommées, orientées ou bidirectionnelles ; pas d’auto-relation ni de doublon symétrique bidirectionnel.
- Supprimer un pays, une ville, un quartier ou une catégorie encore référencé est refusé. Les relations d’une fiche supprimée sont supprimées en cascade.
- UUID, timestamps, index et contraintes validés par PostgreSQL.
- Les cinq catégories initiales sont des lignes SQL modifiables. Aucune liste de catégories n’est codée en dur dans les applications.
- Les profils ne sont jamais directement insérables ou modifiables par un navigateur. La RPC `sync_discord_profile` tire l’identité de `auth.identities.provider_id`, jamais de métadonnées utilisateur modifiables.
- RLS : géographie et catégories lisibles publiquement ; seules les fiches publiées et leurs relations visibles sont publiques. Le contenu se modifie avec des droits Nagi d’administration. Les tables opérationnelles Discord sont lisibles par les admins et modifiables par le service serveur seulement.

### Types issus du schéma

```sh
pnpm db:types        # applique les migrations dans PostgreSQL embarqué, puis introspecte les catalogues
pnpm db:types:check  # vérifie que les types versionnés correspondent aux migrations
```

La génération utilise PGlite, sans Docker ni identifiants externes. Le contrat minimal `auth` du script sert uniquement à appliquer les migrations publiques ; le schéma de l’application n’est pas simulé. Les colonnes, enums, clés étrangères et signatures RPC sont réellement lus dans PostgreSQL. Après toute migration, régénérer `packages/database/src/database.types.ts`. Pour auditer un projet distant, la CLI officielle peut également produire ses types avec `pnpm dlx supabase gen types typescript --project-id VOTRE_PROJECT_REF --schema public`.

## 2. Discord OAuth

1. Créer une application sur le [Discord Developer Portal](https://discord.com/developers/applications).
2. Copier **Application ID** dans `DISCORD_APPLICATION_ID`.
3. Dans **OAuth2**, ajouter le redirect URI **Supabase** : `https://VOTRE_PROJECT_REF.supabase.co/auth/v1/callback`.
4. Copier Client ID et Client Secret dans **Supabase → Authentication → Providers → Discord**. Le backend web reçoit désormais le même secret dans `DISCORD_CLIENT_SECRET` pour renouveler les tokens Discord. Il utilise aussi `DISCORD_BOT_TOKEN` pour vérifier les serveurs communs. Ces deux valeurs restent exclusivement côté serveur.
5. Le bouton appelle Supabase `signInWithOAuth({ provider: 'discord', options: { scopes: 'identify guilds' } })`. Nagi ne demande aucun autre scope utilisateur. Le [fournisseur Discord intégré à Supabase](https://github.com/supabase/auth/blob/master/internal/api/provider/discord.go) ajoute actuellement `email` à ses scopes internes ; aucun formulaire email ou mot de passe n’existe dans Nagi.

Le callback `/auth/callback` échange le code PKCE et synchronise le profil depuis l’identité Discord vérifiée retournée par Supabase. Les redirections se limitent aux chemins internes `/app` et `/admin` sous l’URL canonique configurée. Les cookies sont HttpOnly, SameSite=Lax et Secure sur HTTPS. Aucun client Supabase de navigateur n’est nécessaire. La fabrique unique `apps/web/src/lib/supabase/auth.ts` est utilisée par le proxy, les Server Actions et le callback, comme dans Kitsu. Le cookie dédié `nagi-auth` utilise le mode `tokens-only` : l’objet utilisateur Discord complet ne gonfle plus les en-têtes. Les pages privées vérifient les claims puis relisent le profil et ses permissions en base. Les écritures de cookies sont explicites dans les actions et le callback ; le proxy persiste les renouvellements avant le rendu, y compris sur les pages publiques connectées.

Le proxy Next.js renouvelle les sessions ; chaque layout privé et chaque mutation vérifie aussi l’utilisateur côté serveur. `/admin` exige un rôle Nagi `admin` ou `owner`, indépendamment des rôles du serveur Discord. Les réponses privées ne sont pas mises en cache publiquement. La déconnexion utilise une Server Action protégée par les contrôles d’origine de Next.js et ferme uniquement la session courante (`scope: local`). Lors de la prochaine connexion ou écriture de session, les anciens cookies `sb-...` du seul projet Supabase Nagi sont expirés ; les cookies de Kitsu et des autres projets sont conservés. Le changement de nom du cookie peut demander une reconnexion unique.

Références officielles : [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Discord avec Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord).

## 3. Bot et serveur de développement

1. Dans **Bot**, créer/récupérer le token et définir `DISCORD_BOT_TOKEN`.
2. N’activer **aucun intent privilégié** : seul `GatewayIntentBits.Guilds` est utilisé.
3. Installer le bot sur votre serveur avec les scopes `bot` et `applications.commands`, sans permission Administrateur. Les réponses initiales sont éphémères et n’exigent pas d’accès au contenu des messages.
4. Activer le mode développeur Discord pour copier le Guild ID dans `DISCORD_DEV_GUILD_ID`.
5. Utiliser `DISCORD_COMMAND_SCOPE=guild` pendant le développement ; utiliser `global` en production.

Le token doit appartenir à la même application que `DISCORD_APPLICATION_ID` ; le bot le vérifie avant toute synchronisation. Les changements de scope n’effacent jamais l’autre scope. Pour nettoyer un ancien serveur/global, exécuter intentionnellement un déploiement sur ce scope avec toutes les commandes désactivées, puis revenir à la configuration souhaitée. Le registre du scope choisi doit être réservé à Nagi : le bulk overwrite remplace **toutes** les commandes de cette application dans ce scope, y compris les commandes créées manuellement. Les commandes globales peuvent mettre du temps à se propager côté clients Discord.

Une erreur Discord `50001 · Missing Access` pendant la synchronisation indique un accès manquant à la ressource ciblée. Vérifier le Guild ID et l’installation **sur le serveur** avec `bot` et `applications.commands` (une installation personnelle est différente). Après correction, demander une synchronisation depuis `/admin/bot` ou redémarrer le bot ; les nouvelles tentatives d’une demande existante restent limitées à cinq.

## 4. Rôles et propriétaires

Définir `NAGI_OWNER_DISCORD_IDS` avec les identifiants numériques autorisés, séparés par des virgules. Utiliser **exactement la même liste** sur le web et le bot, pointant vers le même projet Supabase. Redémarrer les deux services après modification.

La RPC serveur `configure_owners` synchronise cette liste dans un schéma privé et attribue le rôle `owner` aux profils correspondants. Le premier login du propriétaire est traité automatiquement. Un propriétaire peut aussi utiliser les commandes d’administration avant son inscription web ; il est identifié par son ID Discord. Retirer un propriétaire de la liste le ramène au rôle `user` au prochain démarrage configuré. Aucun ID privé n’est versionné.

La synchronisation conserve les propriétaires inchangés, ajoute les nouveaux et retire uniquement les identifiants absents de la configuration. Elle respecte la protection `safeupdate` de Supabase, sans désactiver cette protection.

Pour accorder le rôle `admin` à un compte déjà connecté une fois, utiliser **uniquement SQL Editor avec un accès privilégié** :

```sql
update public.profiles
set role = 'admin'
where discord_id = 'ID_DISCORD_DE_L_ADMIN';
```

Pour révoquer ce rôle : attribuer `user`. Les comptes `owner` restent contrôlés par la configuration serveur. La gestion des rôles dans l’interface est volontairement hors du CRUD de cette phase. Les vérifications sensibles relisent les permissions côté serveur et échouent sans privilège si Supabase est indisponible.

## 5. Commandes et synchronisation

Les commandes initiales sont `/ping`, `/help` et `/status` (admin Nagi). `/ping` publie un embed « Aye Sir !! Nagi au rapport. », suivi d’un court texte et de trois paragraphes Discord, API Discord et Supabase. Il présente le statut et la latence de la passerelle, le délai de l’accusé de réception REST et une lecture Supabase limitée à 2,5 secondes. L’avatar du bot apparaît en miniature à droite. Le footer affiche l’avatar de l’utilisateur et `Demandé par @username • JJ/MM/AAAA, HH:mm`, à l’heure de la demande dans le fuseau Europe/Paris. Le texte s’adapte aux pannes et reste disponible si Supabase est inaccessible.

Les autres réponses restent éphémères par défaut. Une commande sans restriction peut déclarer `ephemeral: false` pour une réponse publique et `requiresProfile: false` si elle n’a pas besoin du profil Nagi. Cette dernière option est interdite aux commandes administrateur/propriétaire : leurs permissions sont toujours vérifiées en base. Les refus, commandes désactivées et réponses de maintenance restent privés. `/help` masque les commandes désactivées et celles interdites à l’utilisateur.

Pour ajouter une commande, créer un module `.ts` dans un sous-dossier de `apps/bot/src/commands`, avec un export par défaut conforme à `NagiCommand` :

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { NagiCommand } from '../../types/command';

export default {
  name: 'bonjour',
  description: 'Saluer Nagi',
  category: 'general',
  isEnabled: true,
  isMaintenance: false,
  ownerOnly: false,
  adminOnly: false,
  data: new SlashCommandBuilder().setName('bonjour').setDescription('Saluer Nagi'),
  async execute(interaction) {
    await interaction.editReply('Bonjour !');
  },
} satisfies NagiCommand;
```

Le handler diffère la réponse avant toute lecture réseau : les commandes utilisent `editReply`, sans refaire `reply` ou `deferReply`. Ajouter les options/sous-commandes au builder, puis valider les valeurs métier avec Zod avant d’appeler un service partagé. Les noms du builder et des métadonnées doivent correspondre. Ne placer dans `commands` que des modules de commandes ; les utilitaires restent ailleurs.

**Cycle de synchronisation :**

1. Au démarrage web, l’instrumentation valide la configuration, synchronise les propriétaires et insère une demande durable `web-startup`. Une panne Supabase est journalisée et l’initialisation sera réessayée avant une requête authentifiée ; aucun succès n’est annoncé artificiellement.
2. Au démarrage bot, une demande `bot-startup` est enregistrée. Les demandes encore en attente sont fusionnées par `(application_id, scope)`.
3. Le bot acquiert un lease PostgreSQL de 90 secondes avant de se connecter à Discord. Un second processus attend ; il ne se connecte pas tant que le premier détient le lease.
4. Le lease est renouvelé toutes les 20 secondes. Les appels Supabase expirent après 10 secondes. Une perte du lease annule les requêtes REST et ferme le bot ; le gestionnaire de processus pourra le relancer.
5. Toutes les 3 secondes, le worker réclame une demande avec verrouillage transactionnel. Il rescane récursivement les modules, valide le contrat et les doublons, puis compare le registre distant au registre local activé.
6. Si nécessaire, un seul bulk overwrite Discord retire les commandes supprimées/désactivées et publie les ajouts/options. Un registre déjà conforme ne provoque pas de PUT. Le client REST gère les rate limits, les délais et les nouvelles tentatives réseau.
7. La réussite, le nombre de commandes, leurs métadonnées et l’erreur éventuelle sont persistés. Les échecs réessaient avec backoff, jusqu’à cinq tentatives. Une nouvelle demande peut être déclenchée depuis `/admin/bot`.
8. Les requêtes interrompues sont reprises par le prochain détenteur du lease. Une requête dont la finalisation a échoué peut aussi être reprise après deux minutes par le worker courant.

`isEnabled: false` retire réellement la commande de Discord. `isMaintenance: true` la conserve et provoque une réponse de maintenance centralisée. La maintenance et les permissions ne se recopient pas dans les commandes.

Toute erreur de chargement bloque le déploiement entier et préserve le registre distant. Un scan réussi d’un répertoire vide retire aussi la dernière commande supprimée. Un répertoire manquant ou illisible est un échec de chargement : aucun effacement n’est effectué. Le build vérifie le répertoire source et conserve le répertoire compilé même lorsqu’il ne contient plus de commande. Ne pas modifier les modules pendant une compilation : déployer un artefact complet, puis redémarrer ou demander une synchronisation. En développement `tsx watch` redémarre sur les modules importés ; l’ajout d’un fichier est découvert à la prochaine synchronisation, sans registre central à modifier.

Référence : [registre des commandes Discord](https://docs.discord.com/developers/interactions/application-commands).

## 6. Communication et état réel

La file PostgreSQL remplace une API HTTP entre les processus. Elle est protégée par RLS et des RPC aux droits minimaux. Le navigateur ne reçoit jamais la clé serveur, le token Discord ou le lease. Le web n’écrit jamais dans l’API Discord.

Le dashboard affiche les données de `bot_runtime` pour **l’application et le scope configurés**. Le bot est considéré en ligne uniquement si le heartbeat date de moins de 45 secondes et que Discord est connecté ; jusqu’à 90 secondes il est potentiellement indisponible, puis hors ligne. Un ancien booléen de connexion ne suffit pas. L’écran s’actualise toutes les 20 secondes.

Les deux backends utilisent les types et services du package `@nagi/database`. Les mutations du catalogue web vérifient le rôle global dans la session avant d’utiliser le client serveur. Les lectures de Découvrir passent par les politiques de visibilité ordinaires, y compris pour un administrateur. L’aperçu des brouillons est disponible depuis l’administration.

## 7. Vérifications

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm db:types:check
pnpm build
```

Les tests couvrent le chargement récursif, les modules invalides, les doublons, les commandes désactivées/en maintenance, les suppressions Discord, l’idempotence, les scopes, la perte du lease, les permissions, les redirections, les services partagés et le vieillissement du heartbeat. Toutes les migrations sont exécutées dans PostgreSQL embarqué : contraintes, RLS, usurpation de métadonnées, synchronisation différentielle et révocation des propriétaires, et reprise de la file sont testées sans déploiement externe.

Les erreurs serveur incluent le message et la chaîne des causes, notamment le code SQLSTATE ou PostgREST. Les secrets configurés sont masqués ; les stacks, en-têtes HTTP et détails SQL complets ne sont pas sérialisés. Les tests vérifient aussi cette protection des journaux.

Les vérifications locales ne valident pas une autorisation OAuth réelle ni la connexion d’un token Discord réel. Après configuration de vos identifiants, suivre [la recette d’intégration](docs/INTEGRATION.md).

## 8. Build et déploiement indépendant

```sh
pnpm --filter @nagi/web build
pnpm --filter @nagi/web start

pnpm --filter @nagi/bot build
pnpm --filter @nagi/bot start
```

Le bot compile **tous les modules de commandes** vers `apps/bot/dist/commands`. Livrer tout `dist`, ses chunks et ses dépendances de production. Le web ne démarre jamais le bot dans une route Next.js.

Pour un hébergement Node, conserver le workspace et le lockfile, installer avec `pnpm install --frozen-lockfile`, compiler le service choisi et injecter son environnement serveur. Pour Vercel, définir `apps/web` comme répertoire racine et autoriser l’accès aux packages du monorepo ; renseigner les variables du web et les URLs OAuth de production. Le bot doit être hébergé sur un processus Node persistant (VM, conteneur ou worker longue durée), pas une fonction serverless.

Un exemple de service systemd est fourni dans `docs/deployment/nagi-bot.service`. Il relance le bot après erreur et envoie SIGTERM lors de l’arrêt ; le worker annule le travail puis libère son lease. Garder une seule instance active par application/scope ; le lease protège aussi contre un chevauchement temporaire de déploiement. Utiliser HTTPS en production et des fichiers d’environnement non versionnés et lisibles uniquement par le compte de service.

Les clés nécessaires au web sont les variables publiques, la clé serveur, Application ID, scope/Guild ID, liste de propriétaires, token du bot, secret OAuth Discord et clé de chiffrement. Le bot n’utilise ni la clé publique Supabase, ni le secret OAuth, ni la clé de chiffrement.

## Périmètre

Découvrir réutilise les pays, villes et quartiers du catalogue mondial. Les catégories, les fiches détaillées et leurs relations sont administrées depuis le web et partagées entre les espaces Discord.

## Phase 2 — Espaces Discord et voyages

Appliquer les migrations dans l’ordre, jusqu’à `202611170003_discord_spaces.sql`. Elles ajoutent les espaces, préférences, voyages, journées et références aux fiches ; aucune table du catalogue ni donnée existante n’est remplacée. Après mise à jour du `.env`, redémarrer `pnpm dev` et reconnecter Discord pour autoriser le scope `guilds`. Une ancienne session Supabase peut rester valide tout en nécessitant cette nouvelle autorisation Discord.

Générer `NAGI_TOKEN_ENCRYPTION_KEY` une seule fois avec `openssl rand -base64 32`. Conserver cette clé dans le gestionnaire de secrets et la réutiliser sur chaque instance web. Les grants Discord sont chiffrés en AES-256-GCM, liés au compte par des données authentifiées et stockés dans le schéma `private`, inaccessible à PostgREST. Changer ou perdre la clé impose de reconnecter les comptes concernés. Le callback retire les tokens fournisseur des cookies, y compris les sessions fragmentées ; seuls les tokens de session Supabase restent dans le cookie HttpOnly. Aucun client Supabase navigateur n’est nécessaire.

`@nagi/discord` sépare l’API, les profils, les guildes, le coffre et les vérifications d’appartenance. La véritable expiration Discord vient de `/oauth2/@me`. Un verrou PostgreSQL avec version protège le renouvellement et la rotation des refresh tokens entre plusieurs requêtes/instances. Supabase renouvelle sa propre session, pas le grant Discord. Une révocation impose une reconnexion ; une panne temporaire conserve les credentials. Voir les documentations [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2) et [Supabase social login](https://supabase.com/docs/guides/auth/social-login/auth-discord).

Les inventaires utilisateur et bot sont paginés par 200 et croisés par Guild ID. Le token bot est vérifié contre `DISCORD_APPLICATION_ID`. Le cache privé d’appartenance dure 30 secondes, les attestations RLS expirent après 60 secondes et la présence du bot après 120 secondes sans vérification. Les actions sensibles forcent une vérification Discord. Le bot réconcilie son inventaire au démarrage puis chaque minute et traite `guildCreate`, `guildDelete` et `guildUpdate`. Un retrait invalide les accès et les préférences sans supprimer les voyages. Une panne temporaire Discord.js (`guildUnavailable`) n’est pas traitée comme un retrait.

- `/select-server` : choix initial, recherche au-delà de huit serveurs, véritables icônes, navigation clavier, sons discrets au survol et à la sélection avec bouton muet mémorisé sur cet appareil. L’espace favori et les liens survolés, focalisés ou touchés sont préchargés. Une transition visuelle accompagne la navigation directe ; la mémorisation du dernier espace avec vérification Discord s’effectue après l’arrivée, sans bloquer l’ouverture. Les animations respectent les préférences de mouvement. Installation du bot et actualisation restent disponibles.
- `/app` : favori valide ou sélection explicite. Un changement d’espace conserve le favori ; l’action dédiée dans les paramètres le modifie.
- `/app/[guildId]` : accueil et voyages réellement enregistrés.
- `/app/[guildId]/trips` et `/trips/[tripId]` : création, consultation partagée, auteur, dates facultatives et état explicatif du futur sélecteur de lieux.
- `/app/[guildId]/discover` : catalogue global en lecture, sans création de fiches par les membres.
- `/app/[guildId]/settings` : préférence personnelle et permission locale de création de voyages.

Les permissions locales proviennent du propriétaire Discord ou des bits `Administrator` / `ManageGuild`. Elles permettent de gérer les paramètres du serveur. Les données des voyages sont lues avec le client Supabase de la session et les politiques d’appartenance au serveur. `trip_items.entry_id` référence une fiche globale réutilisable. Sa journée appartient au même voyage.

Les tests exécutent toutes les migrations dans PostgreSQL embarqué et vérifient les scénarios de retrait/réintégration, préférences obsolètes, isolation, rôles locaux/globaux, privilèges SQL, contraintes des dates/journées, références partagées, chiffrement, refresh concurrent et absence des tokens Discord dans les cookies du vrai client SSR Supabase. La connexion OAuth réelle exige toujours la validation de l’utilisateur dans Discord.

## Catalogue géographique

Appliquer `202611170004_destination_catalog.sql` avec les autres migrations Supabase avant de déployer le web. La migration conserve les identifiants et la visibilité des destinations existantes. Les nouvelles destinations commencent en brouillon. La dépublication d’un parent masque ses descendants dans Découvrir et conserve leur propre statut.

Les administrateurs Nagi gèrent les pays, villes et quartiers dans `/admin`. Pour retirer le mode quartiers d’une ville, réaffecter d’abord les fiches concernées et déplacer ou supprimer les quartiers depuis leurs fiches. Si une ville possède déjà des fiches rattachées directement, leur réorganisation doit précéder l’activation du mode quartiers. Les changements de mode et les suppressions sont bloqués tant que les relations sont incompatibles.

Pour migrer des fiches à l’intérieur de la même ville, une transaction SQL peut différer `public.check_city_neighborhoods`, changer le mode, créer ou déplacer les quartiers et réaffecter explicitement chaque fiche. Vérifier les contraintes avant le commit avec `SET CONSTRAINTS public.check_city_neighborhoods IMMEDIATE`. Cette opération conserve les identifiants de fiches utilisés par les voyages.

Le bucket privé `destination-covers` est créé par la migration. Les couvertures sont réencodées en WebP côté serveur. `NAGI_COVER_MAX_MIB` permet de limiter la taille du fichier envoyé entre 1 et 8 Mio. La valeur par défaut est de 8 Mio.

## Catalogue mondial

Appliquer `202611170005_global_catalog.sql` avant de lancer la version web correspondante. Cette migration conserve les identifiants de fiches et le lien `trip_items.entry_id`. Le schéma continue d’utiliser `categories.position` pour l’ordre et `entries.published` pour l’état de publication.

- **Catégories** dans `/admin/categories`. Modifier les catégories globales et leurs champs, puis glisser les lignes ou utiliser les boutons Monter et Descendre pour enregistrer un nouvel ordre. Une réaffectation conserve les valeurs lorsque les définitions cibles ont les mêmes clés et types et acceptent les valeurs existantes.
- **Champs personnalisés** : l’ajout, la modification et la confirmation de suppression se font en modale. Le type **Boutons** permet de renseigner sur chaque fiche jusqu’à 12 liens ordonnés, chacun avec un libellé de 80 caractères et une URL HTTP(S) de 2 048 caractères au maximum. Les boutons s’affichent dans l’aperçu et sur la fiche. Appliquer `202611180001_category_buttons.sql` après les migrations précédentes pour activer ce type. Les valeurs existantes et les règles de publication sont conservées.
- **Icônes des champs** : le sélecteur propose la bibliothèque Lucide complète, avec recherche et pagination. Le choix est facultatif et s’affiche dans l’éditeur de fiche, ses informations et ses boutons. Les SVG individuels sont générés automatiquement avant `dev` et `build`, puis chargés à l’usage avec un cache versionné. Le sélecteur et sa recherche se chargent uniquement à son ouverture ; aucun registre d’imports de toutes les icônes n’entre dans la compilation Next. Après une mise à jour de Lucide, `pnpm icons:generate` actualise le catalogue versionné et les SVG locaux ignorés par Git ; `pnpm icons:check` vérifie ce catalogue. Appliquer `202611180002_field_icons.sql` pour enregistrer le choix. La suppression d’une catégorie s’ouvre en modale et conserve la réaffectation des fiches vers une catégorie compatible.
- **Fiches** dans `/admin/entries`. Enregistrer la fiche avant d’ajouter sa galerie ou ses relations. Les champs obligatoires s’appliquent à la publication. L’aperçu permet de consulter un brouillon depuis l’administration.
- **Types de relation** dans `/admin/relations`. Les deux extrémités partagent une seule relation et chaque sens peut avoir son propre libellé.
- **Médias** dans le bucket privé `entry-media`. Le serveur valide et redimensionne chaque image puis la convertit en WebP. Le premier élément sert de couverture automatique. Les suppressions de fichiers sont enregistrées en base et retentées lors des opérations suivantes si Storage est indisponible.

La [recette d’intégration](docs/INTEGRATION.md) couvre la connexion Discord et le parcours catalogue avec deux rôles.

## Phase 4 — Planificateur de voyages

Appliquer `202611170006_trip_planner.sql` après `202611170005_global_catalog.sql`, puis lancer la version web correspondante. La migration conserve les voyages, les journées et les références du catalogue existants. Elle initialise le créateur comme organisateur et le mode de collaboration à « tous les membres ».

- **Voyages** permet de chercher, filtrer et créer un voyage avec une destination, des dates et une couverture facultatives. Le calendrier conserve les dates locales et les horaires utilisent le fuseau du voyage. Les journées hors de la nouvelle période restent visibles dans l’itinéraire.
- **Itinéraire** permet d’ajouter des fiches depuis la recherche, depuis leurs pages et depuis les suggestions issues de leurs relations. Les étapes se déplacent à la souris, au toucher ou avec les boutons et menus. La suppression d’une journée conserve ses étapes dans la destination choisie.
- **Calendrier** permet de planifier, déplacer et redimensionner les visites et représente les chevauchements. **Carte** utilise les coordonnées des fiches et charge Leaflet à l’ouverture de la vue. Les repères sont numérotés par journée. Le fond OpenStreetMap et son attribution sont centralisés dans `apps/web/src/features/trips/map-config.ts`. [Politique des tuiles OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)
- **Les organisateurs** gèrent les réglages, la liste des organisateurs et la suppression. Les écritures de planification utilisent une transaction et une version du voyage. La synchronisation reçoit des notifications Supabase Realtime privées côté serveur et revérifie périodiquement la version. Le bucket de couvertures `trip-covers` est privé. [Autorisation Realtime](https://supabase.com/docs/guides/realtime/authorization)

## Phase 4.5 — Profils sociaux

Appliquer `202611180003_social_profiles.sql` avant de déployer le web. Les personnalisations sont séparées de l’identité Discord et préservées lors des reconnexions. Aucune variable d’environnement supplémentaire n’est nécessaire.

- **Mon profil** ouvre `/app/profile/@username` ; les anciens pseudos sont conservés comme alias, avec priorité aux pseudos actuellement utilisés. Les paramètres techniques restent dans `/app/settings`. Les noms des créateurs, organisateurs et auteurs d’étapes utilisent un composant de lien réutilisable, sans préchargement de chaque profil.
- **Modifier le profil** ouvre un éditeur avec aperçu local, titre de 40 caractères, biographie de 280 caractères, palette, destination publiée et bannière. Les textes sont échappés, sans rendu Markdown ni liens automatiques. Une validation partagée bloque les liens, domaines, invitations, URI, HTML, Markdown et mentions interactives côté client puis dans le service serveur. La réinitialisation demande confirmation ; les erreurs conservent la saisie et les conflits entre onglets sont signalés.
- **Confidentialité** : la lecture d’un autre profil vérifie les appartenances Discord des deux comptes avec le cache existant, puis une RPC serveur contrôle à nouveau les attestations non expirées et la présence du bot. Le DTO exclut les données techniques du compte. Les voyages et compteurs sont filtrés par serveur commun autorisé. Aucun profil privé n’est mis en cache publiquement. Le retrait du dernier serveur commun révoque l’accès selon les mêmes délais que les espaces : cache de découverte 30 s, attestations 60 s et présence du bot 120 s maximum sans nouvelle vérification.
- **Bannières** : JPEG, PNG et WebP statiques de 5 Mio maximum, décodés réellement avec Sharp (36 mégapixels maximum), réorientés, réduits à 1 600 px et réencodés en WebP. Le bucket `profile-banners` est privé et inaccessible directement au navigateur. La route `/app/profile-banner/[userId]/[version]` revérifie l’autorisation à chaque lecture et sert l’image avec `private, no-store`, avec une URL Storage signée de 30 secondes utilisée uniquement côté serveur. Le positionnement horizontal et vertical est conservé séparément pour permettre un nouveau recadrage. Les anciennes versions et envois abandonnés sont placés dans une file de nettoyage dédiée, retentée lors des enregistrements suivants.
- **Voyages organisés** : seule une association explicite dans `trip_organizers` est comptabilisée. Les cartes sont chargées à l’ouverture de l’onglet, par pages de 12. Les statistiques de participation, pays, villes et lieux visités ainsi que l’onglet Destinations restent masqués : le modèle actuel ne confirme pas les présences ni les visites. Une étape planifiée n’est jamais présentée comme une visite.

Les tests couvrent les contrôles de lecture et d’écriture SQL, l’expiration des accès, la confidentialité des voyages, les alias de pseudos, la conservation des personnalisations, la propriété des bannières, les conflits d’édition et les contournements courants de validation. La recette avec de vrais comptes reste décrite dans [INTEGRATION.md](docs/INTEGRATION.md).

## Relations sémantiques bidirectionnelles

Appliquer `20261119140000_semantic_relations.sql` avant de déployer le web correspondant. Cette migration étend les tables existantes, conserve les identifiants, extrémités, dates et clés des anciennes associations et n’effectue aucune fusion ambiguë. Avant un éventuel nettoyage de données historiques, sauvegarder `relation_types` et `entry_relations` ; les paires orientées opposées ne représentent pas nécessairement des doublons.

- Dans **Relations** (`/admin/relations`, également accessible via `/admin/relation-types`), l’ajout et la modification d’un type se font en modale : deux libellés, description, icône Lucide chargée à la demande, statut et comportement hiérarchique. La prévisualisation montre les deux lectures. Un type symétrique utilise automatiquement le même libellé. Sa clé technique est permanente ; les comportements structurels restent verrouillés lorsqu’il est utilisé. Les flèches réorganisent les types.
- Dans une fiche, **Ajouter une relation** compose une phrase verticale et compacte : fiche actuelle → relation → fiche associée. Le sélecteur de type propose les deux orientations de chaque type asymétrique et une seule pour un type symétrique, avec recherche locale. L’aperçu de l’inverse apparaît seulement lorsque les deux choix sont renseignés. La même modale sert à la modification et devient un panneau inférieur sur mobile.
- Le sélecteur de fiche ne charge ses résultats qu’à l’ouverture. Il propose jusqu’à six fiches réelles, en privilégiant le même quartier puis la même ville, avec les fiches les plus récemment modifiées en complément. Aucun historique de consultation n’est disponible actuellement. La recherche porte sur tout le catalogue, par pages de 12, avec saisie différée, annulation des requêtes obsolètes et filtres secondaires par catégorie, pays, ville et quartier. On peut choisir un brouillon ou une autre destination. Les lectures de `/admin/relations/search` vérifient les droits d’administration et utilisent la session et les RLS ordinaires, sans cache public.
- La modification permet de changer le type, d’inverser le sens ou de remplacer la fiche associée depuis n’importe quelle extrémité. Une seule ligne est conservée. Les suppressions demandent confirmation et ne retirent aucune fiche. Les versions `updated_at` détectent les modifications concurrentes.
- La désactivation d’un type empêche les nouvelles associations mais conserve l’affichage des relations existantes. La suppression d’un type utilisé nécessite une réaffectation explicite vers un type actif de mêmes comportements. La transaction conserve les identifiants des liens et annule l’opération entière si elle créerait un doublon ou un cycle.
- Les libellés et regroupements sont résolus dans `@nagi/shared`, puis réutilisés par `@nagi/database`, l’administration, les pages du catalogue et les suggestions des voyages. Les types ne sont jamais codés dans les composants. Le champ historique `bidirectional` reflète la symétrie pour les contraintes SQL : toutes les associations disposent toujours de deux sens de lecture.
- Les écritures passent par des RPC transactionnelles vérifiant les droits d’administrateur global. Les contraintes SQL normalisent les paires symétriques, refusent les doublons et les autorelations et sérialisent les contrôles de cycles. Les index existants couvrent la source, la cible et le type. Les lectures du catalogue restent soumises aux RLS des deux fiches, de leurs catégories et de leurs destinations.
- Après une modification, les caches de contenu des anciennes et nouvelles extrémités sont invalidés par leurs tags individuels. Un changement de type invalide les contenus utilisant les types. Les fiches non visibles ne produisent aucune section vide côté utilisateur.

## Phase 4.6 — Espace de planification

Appliquer `20261119160000_travel_workspace.sql` avant de lancer cette version. Elle conserve les voyages, identifiants, notes et associations existants. Elle complète les dates manquantes des voyages datés, ajoute un index de recherche insensible aux accents, un index géographique et le statut « Archivé ». Aucun service ou secret supplémentaire n’est nécessaire.

- Le voyage utilise un en-tête compact et trois vues partageant la journée et l’étape sélectionnées. `vue`, `jour`, `etape` et `mode` conservent le contexte dans l’URL. Les journées forment une navigation latérale rétractable sur desktop et une bande horizontale sur mobile. **À organiser** n’occupe une vue que lorsqu’on l’ouvre.
- La timeline trie automatiquement les étapes par heure de début dans chaque journée, avec les visites sans horaire à la fin. L’ordre manuel départage les étapes ayant la même heure et les visites sans horaire. La carte reprend cet ordre. Les horaires et la journée se modifient par popover ; les notes et informations du catalogue sont disponibles dans le panneau de détails. Le glisser-déposer accepte les journées de la navigation, avec des menus et champs équivalents au clavier. Les relations entre lieux déjà prévus sont indiquées sans modifier les visites.
- **Ajouter un lieu** conserve la journée et l’éventuel créneau choisis. Le sélecteur reste ouvert pour plusieurs ajouts, propose une annulation du dernier ajout et distingue une visite déjà prévue dans la journée des autres visites. La répétition est explicite. L’explorateur et les aperçus restent dans le voyage. Les suggestions utilisent les relations réelles, la ville des étapes et le pays du voyage, complétées par des fiches récemment mises à jour ; aucun historique de consultation n’est disponible actuellement.
- Le calendrier propose une journée, une semaine ou une vue du séjour. Les étapes sans heure restent sans horaire. Les déplacements de date et d’heure sont atomiques (`schedule_item`) et vérifient les versions du voyage et de l’étape. La durée se redimensionne à la souris ou avec les flèches du clavier. Sur mobile, une vue agenda remplace la grille hebdomadaire.
- **Explorer les alentours** interroge uniquement la zone visible, avec au plus 80 résultats. Les requêtes de recherche sont limitées, différées et annulables. `/app/[guildId]/trips/[tripId]/places` vérifie l’accès Discord et le voyage dans ce serveur avant toute lecture du catalogue public soumis aux RLS, avec `private, no-store`. Les lieux peuvent être ajoutés depuis leurs repères. Aucun trajet ni durée de déplacement n’est estimé sans fournisseur de routage.
- Le mode consultation masque les outils d’édition. Les avatars de l’en-tête représentent les organisateurs connus, sans inventer de participants physiques. Les permissions et la synchronisation privée existantes restent communes à toutes les vues. Un changement des dates complète les journées sans supprimer celles devenues hors période ni déplacer leurs étapes.
- Les paramètres regroupent Général, Couverture et Collaboration dans trois rubriques accessibles au clavier et par lien direct. Le brouillon et l’enregistrement restent disponibles d’une rubrique à l’autre. La couverture dispose d’un aperçu, d’une validation du fichier et d’un retour à celle du pays. Les changements d’organisateurs sont immédiats et conservent le brouillon des autres réglages ; la suppression passe par une confirmation en modale.

## Activités avec arrêts internes

La migration `20261119202426_trip_activity_stops.sql` ajoute un niveau d’arrêts à l’intérieur des activités. Depuis le menu d’une étape, **Ajouter un arrêt** ouvre le catalogue en privilégiant les fiches liées à cette visite. L’action se retrouve à la fin des arrêts lorsque l’activité est dépliée. Chaque arrêt possède ses propres notes et une durée facultative, et peut être réordonné ou sorti de l’activité pour devenir une étape autonome.

Avant application de cette migration, les voyages existants restent consultables et modifiables avec leur fonctionnement précédent ; les commandes d’arrêts internes restent masquées.

La migration `20261119205211_trip_activity_drag_nesting.sql` permet ensuite de glisser une étape existante sur le centre d’une autre carte pour en faire un arrêt. Les bords et les espaces entre les cartes conservent le réordonnancement. L’option **Intégrer à une activité…** propose le même geste depuis le menu. La conversion conserve l’ID, la fiche, les notes, la durée et l’auteur en une transaction ; le jour et l’horaire suivent alors l’activité choisie. Les groupes déjà pourvus d’arrêts et les doublons sont refusés. Activités et arrêts partagent le même visuel, avec les horaires à gauche et la photo du lieu.

La migration `20261119211338_trip_stop_drag_movement.sql` ajoute le déplacement des arrêts entre activités et leur sortie vers une journée ou À organiser. Un clic bref ouvre la fiche ; un appui maintenu sur la carte, sa photo ou ses notes lance le glisser-déposer (180 ms à la souris, 250 ms au toucher). Les boutons d’horaire et de menu restent utilisables, et le défilement tactile reste possible. Déposer un arrêt entre les activités le rend autonome ; le déposer sur une autre activité ou dans sa liste le transfère ou le réordonne. Notes, durée, auteur et identité sont conservés ; une sortie garde l’horaire indicatif connu. La conversion et le transfert s’effectuent en une transaction protégée par les mêmes droits et versions que le reste du voyage.

La journée et les horaires viennent de l’activité principale. Une visite PARCO de deux heures contenant trois arrêts de quarante minutes reste un seul bloc de deux heures dans le calendrier et les totaux. Le résumé indique le nombre d’arrêts et leur durée incluse ; son explication reste disponible à la demande. Le repliage est conservé entre les vues, journées et panneaux tant que le voyage reste ouvert. Les horaires calculés sont précédés de **≈** et identifiés comme indicatifs ; après une durée libre, aucune heure suivante n’est inventée. Le dépassement n’allonge jamais automatiquement le parent : une action explicite permet d’ajuster sa durée. La suppression du groupe annonce aussi le retrait de ses arrêts.

Les durées utilisent un format partagé (`1 h`, `1 h 30`) dans la timeline, le calendrier et les éditeurs. Les journées vides restent compactes et comptent les étapes indépendantes séparément des arrêts. La carte montre les coordonnées propres des étapes et des arrêts (`1`, `1.1`, `1.2`) ; plusieurs visites au même emplacement partagent un repère ouvrant leurs choix. Une fiche sans coordonnées reste dans la liste dédiée, sans hériter de celles de son activité.

Les opérations d’arrêts utilisent la transaction existante du planificateur, son verrou de voyage, ses contrôles d’appartenance Discord, son mode de collaboration et ses versions. Les lectures restent protégées par RLS. Les anciennes opérations sont conservées dans une fonction privée, sans droit d’exécution direct pour les comptes de l’application.

## Interactions et couleurs du calendrier

Appliquer `20261120120000_calendar_colors.sql` avant de lancer cette version. La migration ajoute une couleur facultative aux occurrences et une palette privée par compte, sans modifier les fiches du catalogue ni leurs catégories. Aucun secret supplémentaire n’est nécessaire.

- Le bloc entier se déplace après 6 px à la souris ; au toucher, un appui de 250 ms distingue le déplacement du défilement. Le dépôt peut changer le jour et l’heure, avec un pas de 15 minutes et une durée conservée. L’aperçu indique le créneau cible ; seule la fin du geste enregistre une modification.
- Les bordures supérieure et inférieure permettent de redimensionner sans poignée permanente. Elles conservent respectivement l’heure de fin et l’heure de début, avec les flèches du clavier comme alternative. Échap annule le geste. Les arrêts gardent leurs durées et décalages relatifs ; un dépassement reste signalé sans correction silencieuse.
- Le clic droit ou **Maj + F10** ouvre les couleurs : bleu Nagi `#73A6DF`, vert, orange et violet, puis les couleurs personnelles. L’action **Couleur du calendrier** du panneau de détails donne le même accès sur mobile. Les blocs courts privilégient le titre et conservent leur hauteur réelle.
- La palette personnelle est chargée à la première ouverture du menu, limitée à 32 couleurs HEX uniques et persistée dans Supabase avec RLS. Le sélecteur visuel reste local jusqu’à **Ajouter**, qui enregistre puis applique la couleur. **Gérer mes couleurs** retire seulement une pastille ; les activités déjà colorées la conservent, y compris lors d’une intégration dans un groupe puis d’une sortie.
- La couleur d’une occurrence passe par la transaction et les versions existantes du voyage. Elle se synchronise avec les membres autorisés et revient à sa valeur précédente en cas d’échec. La palette personnelle n’est jamais ajoutée à celle des autres comptes. Les rendus clair et sombre utilisent les couleurs du thème pour garder le texte lisible.

## Performances et synchronisation des voyages

Appliquer `20261120150000_trip_mutation_sync.sql` puis `20261120153000_trip_sync_replay_limit.sql` et `20261120154000_trip_structure_guards.sql` avant de lancer cette version. Ces migrations ajoutent un journal privé de deltas et des reçus d’idempotence, en conservant les anciennes RPC et toutes leurs permissions.

Le planificateur partage un état confirmé et une file d’intentions entre Itinéraire, Calendrier et Carte. Les ajouts, retraits, horaires, couleurs, notes, journées et réorganisations apparaissent immédiatement. Jusqu’à trois requêtes indépendantes s’enregistrent en parallèle ; les opérations dépendantes gardent leur ordre et les patches successifs non envoyés peuvent se regrouper. Les sauvegardes restent actives pendant la navigation dans `/app`, avec une isolation par compte, serveur et voyage.

Les mutations courantes passent par un Route Handler JSON, avec vérification de session, appartenance Discord vérifiée de courte durée et contrôle SQL des droits. Elles ne relancent pas le rendu complet du voyage. Le serveur compare les anciennes valeurs des propriétés modifiées : des modifications compatibles peuvent se combiner, tandis qu’un conflit réel est signalé et réconcilié. Les identifiants de mutation restent stables lors des reprises ; les reçus conservés pendant la vie du voyage évitent une nouvelle écriture après une réponse perdue.

Le flux SSE utilise les canaux Supabase privés existants comme signaux, puis lit les deltas confirmés en SQL. Un Broadcast client n’est jamais une preuve de sauvegarde. Les versions dédupliquent les événements et récupèrent les révisions manquantes ; un snapshot autorisé ne sert que si le journal, limité à environ 1 000 révisions, ne suffit plus. Les palettes personnelles restent privées.

L’indicateur discret du voyage reflète les confirmations réelles, avec apparition différée de l’état d’enregistrement. Une interruption courte conserve la file en mémoire, réessaie au plus trois fois avec backoff et propose Réessayer. Une révocation d’accès nettoie les intentions locales et ferme la synchronisation. La fermeture/recharge complète de l’onglet reste protégée par l’avertissement natif lorsque des écritures sont en attente ; cette version n’enregistre pas de notes privées dans IndexedDB et ne constitue pas un mode hors ligne durable.

Le [rapport avant/après](docs/TRIP_PERFORMANCE.md) détaille les mesures, les limites et les plans SQL. Les [scénarios reproductibles](scripts/qa/trips/README.md) utilisent exclusivement des comptes et voyages de démonstration.

## Phase 4.7 — Catalogue multisource

Appliquer `20261120171143_universal_place_discovery.sql`, puis `20261120171937_google_place_identifiers.sql`, après `20261120160000_catalog_visit_insertion.sql`, avant de déployer le web. Les étapes et arrêts existants deviennent explicitement `nagi`, sans changer leurs identifiants, horaires, notes, couleurs ni associations. Les sources `google` et `custom` ne nécessitent aucune destination présente dans le catalogue. Elles partagent les transactions, occurrences, déplacements, arrêts, contrôles de versions, file optimiste et deltas privés existants. Plusieurs ajouts volontaires créent plusieurs occurrences ; une reprise technique conserve son identité.

L’explorateur conserve **Nagi | Google Maps**, une recherche commune et des filtres séparés. Nagi est sélectionné au départ. Dans Google, Autocomplete (New) fournit des références après 250 ms sans frappe, à partir du seuil configuré (3 caractères par défaut). Entrée lance Text Search (New) ; les deux méthodes ne partent pas simultanément à chaque frappe. Les requêtes obsolètes sont annulées et leurs réponses ignorées. Aucun appel Google n’est déclenché par un résultat Nagi vide. La destination est une préférence désactivable, indépendante des pays présents dans Nagi ; aucune position réelle n’est demandée.

Chaque résultat Google est directement une carte glissable dans l’enveloppe du catalogue Nagi, avec un contenu officiel compact et une provenance explicite. Aucune carte anonyme intermédiaire n’est créée. Le clic ouvre le panneau de détails existant, ou ajoute directement dans la modale d’un créneau déjà choisi. Les flèches naviguent entre les résultats et le menu propose l’ajout au clavier. Timeline, journées, À organiser, calendrier et arrêts partagent toujours le même mécanisme d’insertion. Les occurrences restent indépendantes et les étapes personnalisées conservent leur édition.

### Choix pour la facturation France / EEE

Les noms, photos, adresses et horaires Google sont affichés uniquement par **Places UI Kit**, sans extraction ni modification de son Shadow DOM. Les attributions restent visibles. Leaflet utilise seulement les identifiants et coordonnées de **Places API (New)**. Ce choix tient compte des [conditions EEE, sections 15 et 16](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms) et du [guide Google EEE](https://developers.google.com/maps/comms/eea/places) ; vérifier aussi l’accord propre au compte avant production.

Les blocs Google assez grands affichent leur nom et leur attribution dans un composant officiel sans photo. Les semaines contenant des lieux Google gardent des colonnes d’au moins 188 px, avec défilement horizontal commun aux en-têtes et aux événements si nécessaire, pour conserver les noms visibles. La hauteur réelle du composant officiel est mesurée : les créneaux courts et les étapes qui se chevauchent dans une colonne trop étroite affichent un accès compact à la fiche officielle préchargée au survol ou au focus, avec ouverture des détails par le clic existant. La grille et les durées gardent leur taille exacte. Cette alternative évite de tronquer l’attribution ou de copier un nom REST dans un contexte lié à une carte. Places UI Kit reste signalé expérimental dans sa [documentation](https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview).

### Phase 4.8 — Finitions du calendrier

Les vues Jour, Semaine et Séjour conservent le moteur de planification existant et l’échelle de 56 px par heure. Une seule zone de défilement aligne les dates, la bande sans horaire et les colonnes ; les en-têtes et l’axe des heures restent visibles pendant le défilement. La bande sans horaire se réduit lorsqu’elle est vide. Les événements adaptent leur contenu à leur hauteur réelle, sans modifier les horaires ou les durées incluses des arrêts. La sélection et les états de sauvegarde sont signalés sur l’étape concernée ; les rejets continuent d’utiliser le rollback ciblé de la file existante. Le menu conserve les couleurs et donne accès à la modification et à la confirmation de suppression.

La date du jour et la ligne d’heure actuelle utilisent explicitement `plan.timezone`, avec une mise à jour par minute suspendue lorsque l’onglet est masqué. La distinction entre aujourd’hui et le jour sélectionné reste indépendante. Les styles respectent le thème sombre et la réduction des animations. Aucune migration ni modification du fournisseur de lieux n’est nécessaire. La recette `scripts/qa/trips/calendar.py` complète les tests de calcul, la recette Google simulée et la synchronisation entre deux comptes sur la base locale isolée.

### Configuration Google Cloud

1. Créer ou sélectionner un projet Cloud et lui associer le compte de facturation France / EEE. Activer **Places UI Kit** (placewidgets.googleapis.com) et **Maps JavaScript API** (maps-backend.googleapis.com) pour le chargeur navigateur, puis **Places API (New)** (places.googleapis.com) pour les vérifications et coordonnées serveur. Le chargeur JavaScript officiel utilise seulement la bibliothèque `places`, sans carte Google ; suivre les prérequis du [démarrage UI Kit](https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started). Ne pas activer Routes, Geocoding, les API Legacy ou Autocomplete pour cette implémentation.
2. Créer une clé **serveur** distincte, restreinte à Places API (New), et aux IP sortantes si l’hébergement fournit des adresses stables. La placer dans `GOOGLE_PLACES_API_KEY` exclusivement côté serveur. Une restriction par référent navigateur ne convient pas à cette clé.
3. Créer une clé **navigateur**, restreinte par référents HTTP aux domaines autorisés et uniquement aux services Maps JavaScript API et Places UI Kit utilisés par le navigateur. Ajouter explicitement les origines de développement avec leurs ports, sans joker global. La placer dans `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`. Cette clé est publique par conception ; ses restrictions sont indispensables. Ne jamais réutiliser la clé serveur. Voir les [bonnes pratiques Google](https://developers.google.com/maps/api-security-best-practices).
4. Configurer les quotas Cloud pour les services/SKU utilisés ainsi que les budgets et alertes. Une alerte budgétaire ne coupe pas automatiquement les dépenses. Une clé navigateur publique peut appeler Google directement : les autorisations Nagi ne constituent pas un plafond de facturation du fournisseur.
5. Définir `GOOGLE_PLACES_ENABLED=true`, les deux clés et les limites de `.env.example`. Reconstruire puis redémarrer le web après un changement de clé `NEXT_PUBLIC_`. Les variables `NEXT_PUBLIC_*` et `GOOGLE_*` sont transmises par Turborepo et participent au calcul du cache pour éviter de réutiliser une compilation avec une ancienne configuration. Sans configuration, Nagi démarre normalement et les étapes libres fonctionnent ; Google signale son indisponibilité. Ne jamais placer les clés dans les commits ou les échanges de support.
6. Renseigner `NAGI_SERVICE_OPERATOR` et `NAGI_PRIVACY_CONTACT`. Les pages publiques `/terms` et `/privacy` décrivent cette intégration et renvoient aux conditions/confidentialité Google. Compléter et faire valider les informations propres à l’exploitation avant publication.
7. Dans `/admin/settings/integrations`, contrôler les clés configurées, la disponibilité globale, les compteurs et les erreurs. Le badge décrit la configuration et ne valide pas les clés auprès de Google. Effectuer ensuite la [recette d’intégration](docs/INTEGRATION.md#catalogue-multisource--google-places).

### Données, coût et limites

Les données durables comprennent les Place IDs, leurs métadonnées techniques de vérification et les informations de planification saisies par les membres. Aucun nom, photo, adresse, avis ou contenu de réponse Google n’est importé dans les fiches, destinations, catégories, Supabase Storage ou le journal collaboratif. `entries.google_place_id` prépare une association éditoriale facultative future, sans fusion ni import automatique.

Les coordonnées sont demandées seulement pour la carte, dédupliquées par Place ID et conservées dix minutes au plus en mémoire de session. Elles sont retirées à expiration sans rafraîchissement payant automatique ; une action explicite les recharge. Elles ne passent pas dans Next Data Cache, un cache HTTP, IndexedDB, un service worker ou les tables du voyage. Les vérifications d’ID sont réutilisées pendant 24 heures ; les demandes simultanées sont dédupliquées par membre et ID dans un processus serveur. Les anciennes références, y compris au-delà de douze mois, sont revérifiées à la prochaine résolution serveur. Les changements d’ID sont suivis avec une limite de sauts ; un échec conserve l’occurrence et ses notes.

Le REST utilise les masques `suggestions.placePrediction.placeId` pour Autocomplete, `places.id` pour Text Search, `id,movedPlaceId` pour les vérifications et `id,location,movedPlaceId` pour la carte. Les noms, types, photographies et informations détaillées sont rendus par UI Kit dans les contextes reliés à la carte ; ils ne sont pas copiés depuis son DOM. Les tokens Autocomplete sont temporaires et renouvelés après sélection, abandon ou expiration ; leur terminaison IDs Only reste facturée par requête Autocomplete selon les règles Google, sans promesse de remise de session. Les photos restent sous le contrôle du composant officiel et ne sont pas téléchargées dans Nagi.

Les quotas Nagi sont atomiques : membre/minute, membre/jour et total/jour UTC. L’administration mesure des **autorisations de composants UI Kit** et des **tentatives REST**, pas la facture Google ni le nombre exact de requêtes internes des widgets. UI Kit facture ses instanciations ; plusieurs occurrences simultanées peuvent nécessiter plusieurs composants officiels. Les instances d’une occurrence sont réutilisées tant que le voyage reste ouvert et créées seulement près de la zone visible. Les compteurs expirent après 35 jours lors des appels suivants. Les erreurs Google et quotas ne déclenchent aucune reprise payante automatique et ne bloquent pas les autres modifications.

Les restrictions de clés, quotas Cloud et informations légales restent à contrôler pour chaque déploiement. Cette intégration a été testée avec les clés existantes dans un profil isolé ; les mesures et limites de cette recette sont décrites dans le rapport de la phase 4.7.1.

La migration complémentaire des identifiants conserve les Place IDs longs et utilise des index par empreinte avec comparaison intégrale et refus des collisions. Aucune référence n’est tronquée. La validation HTTP garde une limite de taille de requête et accepte jusqu’à 8 192 caractères par identifiant ; cette borne de protection Nagi ne représente pas une limite annoncée par Google. Voir la [documentation des Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id).

## Phase 4.7.1 — Recherche Google intégrée

Appliquer `20261120180308_google_search_quotas.sql` après les migrations 4.7. Cette migration conserve les tables et les données et distingue les tentatives Autocomplete et Text Search des autorisations UI Kit dans les compteurs existants. Les deux clés déjà configurées restent utilisées, sans OAuth Google supplémentaire.

Le [rapport de mise en œuvre](docs/GOOGLE_NATIVE_EXPERIENCE.md) décrit l’architecture hybride retenue pour l’EEE, les mesures réelles et simulées, les limitations du calendrier et le diagnostic des erreurs console.
