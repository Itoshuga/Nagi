# Firebase et administration — étapes 05 et 06

La gestion géographique est désormais opérationnelle. Voir [GEOGRAPHY.md](GEOGRAPHY.md) pour ses formulaires, la migration et la bascule contrôlée du site public.

## Audit et périmètre

Le projet utilise Next.js 16.4.0 (App Router), React 19.3, TypeScript 5.9 et
Tailwind 4.3. Les guides livrés dans `node_modules/next/dist/docs/` ont été
consultés pour les Route Handlers, les cookies asynchrones, l’authentification,
les variables d’environnement et les frontières client / serveur.

Les pages publiques utilisent toujours `src/data/geography.ts`,
`src/data/catalogue/*` et leurs fonctions dans `src/lib/`. Les identifiants,
slugs, relations et styles publics sont conservés. Le proxy existant continue
à traiter uniquement les URL géographiques. La géographie peut être importée et administrée selon la procédure de l’étape 06 ; sa source publique reste explicitement sélectionnée. Les quatre univers restent locaux.

Les SDK ajoutés sont Firebase Web (Auth, Firestore, Storage) et Firebase Admin.
Le SDK Admin actuel nécessite **Node.js 22 ou plus** ; Node.js 24 LTS est
conseillé. Le CLI Firebase et ses tests sont des dépendances de développement.

## Configurer le projet Firebase

1. Ouvrir le projet `nagi-travelapp` dans la console Firebase. Pour un autre
   environnement, créer un projet distinct et une application Web.
2. Dans **Authentication → Sign-in method**, activer **Email/Password**.
   Ne pas activer la connexion par lien email pour cette étape.
3. Dans **Authentication → Settings → Authorized domains**, vérifier les
   domaines utilisés, notamment `localhost` pour le développement et le domaine
   réel pour le déploiement. Les nouveaux projets ne l’ajoutent pas toujours.
4. Dans **Firestore Database**, créer la base **(default)** en mode production,
   choisir sa région avant création et déployer les règles de ce dépôt.
5. Pour Storage, provisionner le bucket si nécessaire selon les conditions du
   projet, puis déployer `storage.rules`. Aucun accès aux médias n’est ouvert.
6. Dans **Project settings → General → Your apps**, recopier la configuration
   Web dans les variables `NEXT_PUBLIC_FIREBASE_*`.
7. Dans **Project settings → Service accounts**, générer une clé de compte de
   service adaptée à l’environnement serveur. Reporter uniquement le project ID,
   l’email du compte et la clé privée dans les variables serveur. Conserver le
   JSON hors du dépôt et du répertoire `public/`.

La configuration reçue a été placée dans `.env` local, avec des permissions
`600`. Le fichier est ignoré par Git. `.env.example` contient uniquement des
noms de variables et des commentaires. Les identifiants de clé, client ID et
URL OAuth du JSON de compte de service ne sont pas nécessaires au SDK Admin.

Une clé privée partagée dans une conversation doit être remplacée avant la mise
en production : générer une nouvelle clé, mettre à jour le secret sur le serveur,
puis supprimer l’ancienne dans les clés du compte de service Google Cloud.

### Variables

Copier `.env.example` vers `.env` pour une nouvelle installation. Next.js charge
ces fichiers à la racine ; un éventuel `.env.local` a priorité sur `.env`.

| Variable | Usage |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | URL publique et métadonnées |
| `ADMIN_APP_ORIGIN` | Origine exacte du navigateur autorisée pour les mutations de session |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Configuration Web Firebase, publique |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Domaine Firebase Auth |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Projet de l’application Web |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Bucket Storage |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Configuration Web Firebase |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Identifiant de l’application Web |
| `FIREBASE_ADMIN_PROJECT_ID` | Projet serveur, doit correspondre au projet Web |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Compte de service, serveur uniquement |
| `FIREBASE_ADMIN_PRIVATE_KEY` | PEM privé, serveur uniquement |
| `NEXT_PUBLIC_FIREBASE_USE_EMULATORS` | `false` pour le vrai projet ; `true` uniquement en développement local |

La clé PEM peut être multiligne entre guillemets ou utiliser `\n` entre les
lignes. Elle ne doit jamais recevoir de préfixe `NEXT_PUBLIC_`. Les variables
publiques sont figées au build : reconstruire l’application après modification.

`ADMIN_APP_ORIGIN=http://localhost:3000` suppose une navigation à cette adresse.
Pour naviguer via `127.0.0.1` ou un autre port, adapter la valeur puis redémarrer.
En production, renseigner l’origine **HTTPS**, sans chemin, par exemple l’origine
du domaine réellement déployé. Ne pas dériver cette autorisation d’un en-tête
transmis librement par le navigateur. Le proxy d’hébergement doit transmettre
correctement les cookies et ne pas mettre en cache les routes administratives.

## Créer le premier administrateur

1. Dans **Authentication → Users → Add user**, créer l’utilisateur avec un email
   et un mot de passe fort. Aucun compte ni mot de passe de production n’est créé
   par le code. Il n’existe pas de page d’inscription publique.
2. Copier son **UID** depuis Firebase Authentication.
3. Depuis un poste de confiance ayant les variables serveur :

   ```sh
   npm run admin:role -- UID_EXISTANT grant
   ```

4. Aller sur `/admin/login` et se connecter. Le script conserve les autres
   custom claims et révoque les anciennes sessions. Une nouvelle connexion est
   nécessaire après tout changement de rôle.

Retirer l’autorisation ou révoquer toutes les sessions d’un utilisateur :

```sh
npm run admin:role -- UID_EXISTANT revoke
npm run admin:role -- UID_EXISTANT revoke-sessions
```

Ces commandes modifient le projet défini dans `.env` : vérifier le projet avant
exécution. Elles ne sont exposées par aucune route HTTP. Le SDK Admin est protégé
par `server-only` ; la condition Node `react-server` du script permet son usage
hors de Next.js. Ne pas supprimer cette frontière pour faciliter un import client.

L’absence d’inscription dans l’interface n’est pas une autorisation : tout compte
Firebase ordinaire reste refusé. Seul `admin: true` attribué par le serveur accorde
un accès. Aucun email ni domaine email ne tient lieu de rôle.

## Sessions et autorisations

- Le navigateur utilise une persistance Firebase **en mémoire**, échange un ID
  token contre une session serveur, puis ferme sa session SDK, y compris en cas
  d’échec. Aucun token n’est stocké dans `localStorage` par Nagi.
- `GET /api/admin/csrf` émet un jeton aléatoire et un cookie HttpOnly. Les demandes
  `POST` et `DELETE /api/admin/session` exigent sa valeur dans `X-CSRF-Token`,
  le cookie correspondant et une origine exacte autorisée. `Sec-Fetch-Site`
  est contrôlé lorsqu’il est présent. Les réponses ne sont pas mises en cache.
- La création vérifie le token et sa révocation, une authentification de moins de
  cinq minutes, le claim `admin: true` du token et le rôle actuel dans Auth.
- Le cookie Firebase dure **8 heures**, est `HttpOnly`, `SameSite=Strict`,
  `Secure` en production, sans domaine, sur `/`. Son nom utilise le préfixe
  `__Host-` en production. Le cookie n’est pas renouvelé automatiquement.
- `requireAdmin()` est appelé dans le layout protégé **et dans chaque page**
  (`/admin`, `/admin/settings`), ainsi que dans le point d’accès aux données.
  Il vérifie `verifySessionCookie(cookie, true)` puis le rôle actuel de
  l’utilisateur. Le cache React ne déduplique que les appels d’un rendu serveur.
- Toute future Route Handler sensible devra contrôler l’autorisation elle-même,
  répondre avec `401/403` selon le cas et vérifier le CSRF pour les mutations.
  Le layout et le proxy ne suffisent pas à protéger une API.
- Une session absente, expirée ou révoquée redirige vers la connexion. Un compte
  sans rôle reçoit un refus explicite, sans contenu du tableau de bord. Un incident
  Firebase échoue de manière fermée avec un message de service indisponible.
- La déconnexion efface les cookies locaux, même si Firebase est indisponible.
  Elle ne révoque pas les sessions des autres appareils. Utiliser
  `revoke-sessions` pour invalider globalement un cookie qui aurait été copié.
- Les mutations et pages Firebase Admin utilisent le runtime Node.js.

L’interface charge le SDK Web seulement lors d’une tentative de connexion. Le
SDK Admin et les accès Firestore serveur sont marqués `server-only`. La lecture
des secrets et l’initialisation du SDK sont différées : les pages publiques et
le build fonctionnent même sans configuration Firebase. Les messages affichés
n’incluent pas les détails du compte de service.

## Règles et déploiement

Les lectures des pays, villes et quartiers vérifient `status == 'published'`,
`visibility == 'public'`, `archivedAt == null` et la visibilité des parents. Leurs
écritures passent uniquement par le serveur autorisé : même un client avec le
claim admin ne peut pas modifier directement ces collections ni les réservations
privées `geographySlugs`. Le serveur applique Zod, les relations et les transactions.
Les quatre collections de contenus conservent leurs règles préparatoires de l’étape 05.
Les collections inconnues, sous-collections et Storage restent fermés.
Le SDK Admin contourne les règles : les gardes serveur restent obligatoires.
Voir [GEOGRAPHY.md](GEOGRAPHY.md) pour les invariants et la migration.

```sh
npx firebase login
npx firebase deploy --project nagi-travelapp --only firestore:rules,firestore:indexes,storage
```

Le déploiement est une opération manuelle sur le projet réel. Il n’a pas été
exécuté dans cette étape. Les règles Storage peuvent être déployées une fois
le bucket provisionné. Les index sont vides tant que les requêtes métier finales
ne sont pas connues.

## Développement local

```sh
npm ci
npm run dev
```

Pour les émulateurs, installer un JDK **21 ou supérieur**, puis :

```sh
npm run firebase:emulators
```

La suite utilise le projet isolé `demo-nagi` et écoute uniquement sur la boucle
locale : Auth `9099`, Firestore `8080`, Storage `9199`, interface `4000`.
Pour y connecter Nagi, créer un `.env.local` ignoré par Git contenant :

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-nagi.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-nagi
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-nagi.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=demo
NEXT_PUBLIC_FIREBASE_APP_ID=demo-app
NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true
FIREBASE_ADMIN_PROJECT_ID=demo-nagi
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
```

Ces identifiants sont exclusivement ceux d’un projet **demo d’émulation**, pas des
clés de production. Créer un utilisateur dans l’interface Auth locale et attribuer
son rôle via `admin:role`. Redémarrer Next.js après changement d’environnement.
Retirer `.env.local` pour revenir à `.env`. Ne jamais déployer ces variables.
Le code refuse les émulateurs en production, un projet réel avec émulation,
des hôtes inattendus ou des variables d’émulateurs sans activation explicite.

## Tests reproductibles

```sh
npm run typecheck
npm run lint
npm test
npm run test:firebase-rules
npm run test:admin-auth
npm run test:geography
npm run build
# Sur un serveur local ouvert :
npm run test:routes -- http://localhost:3000
npm run test:contrast
```

Lancer les commandes d’émulateurs **séquentiellement**, sans autre suite
Firebase ouverte : elles partagent les ports du hub. Le test d’authentification (Auth et Firestore, Java 21+)
crée et supprime ses utilisateurs uniquement dans `demo-nagi`. Il copie les
sources dans un répertoire temporaire, démarre un Next.js indépendant sur `3105`,
puis ferme ce serveur et nettoie le répertoire. Le serveur de développement
principal et `.env` ne sont pas modifiés. Il couvre la création du cookie,
les routes, le refus des comptes ordinaires, le retrait du rôle, la révocation,
les requêtes invalides et la déconnexion protégée par CSRF.

Les tests de règles vérifient les sept collections, trois profils, les requêtes
publiques filtrées, les écritures, les sous-collections et Storage. Les tests
unitaires vérifient aussi le rôle booléen, l’origine et la fraîcheur des tokens.
Ces contrôles locaux ne constituent pas une connexion réelle au projet Firebase.

Références officielles : [sessions Firebase](https://firebase.google.com/docs/auth/admin/manage-cookies),
[custom claims](https://firebase.google.com/docs/auth/admin/custom-claims),
[émulateur Auth](https://firebase.google.com/docs/emulator-suite/connect_auth),
[tests de règles](https://firebase.google.com/docs/rules/unit-tests).
