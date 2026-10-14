# Vérification de livraison — 9 octobre 2026

## Étape 01 — Commandes réellement exécutées

| Vérification | Résultat |
| --- | --- |
| `npm run dev -- --hostname 127.0.0.1` | Démarrage réussi, accueil HTTP 200 |
| `npm run lint` | Réussi, zéro erreur et zéro avertissement |
| `npm run typecheck` | Réussi, génération des types puis compilation TypeScript stricte |
| `npm run build` | Réussi, page `/` prérendue statiquement |
| `npm run start -- --hostname 127.0.0.1 --port 3001` | Démarrage de production réussi, accueil HTTP 200 |
| `npm audit --omit=dev` | Zéro vulnérabilité signalée |

L’audit complet conserve l’alerte transitive de l’outillage ESLint décrite dans le README. Aucun audit de sécurité applicatif exhaustif n’est revendiqué.

## Contrôles dans le navigateur

Contrôles réalisés dans le navigateur Chromium intégré, avec adaptation explicite du viewport :

- **1440 × 900** : hero en trois zones, inspection de l’ensemble de la page.
- **768 × 1024** : hero en deux colonnes, destinations en composition éditoriale et univers en deux colonnes.
- **390 × 844** : disposition mobile, photographie en ouverture et titre accompagné des vignettes.
- **320 × 740** : inspection de toute la page au format étroit.

Aucun débordement horizontal constaté dans ces formats. Les captures sont enregistrées dans `.qa/` (dossier de vérification local ignoré par Git).

Interactions contrôlées :

- Sélection de Kyoto, Tokyo et Fujiyoshida depuis les vignettes ; synchronisation de la légende et du sélecteur latéral.
- Activation d’une vignette avec Entrée.
- Ouverture et fermeture du menu ; fermeture par Échap et restitution du focus.
- Boucle de focus : Maj+Tab du bouton de fermeture vers le dernier lien, puis Tab vers le bouton de fermeture.
- Navigation vers les destinations, les univers et l’esprit Nagi ; retour en haut de la page.
- Lien d’évitement : Entrée place le focus sur le contenu principal.
- Ouverture et fermeture des crédits dans le footer.

Ressources et structure :

- Les cinq fichiers photographiques, les crédits et l’icône répondent en HTTP 200.
- Les photographies optimisées se chargent dans le navigateur ; la photo éditoriale est contrôlée après navigation vers sa section.
- Les tailles de chargement des photos horizontales prennent en compte leur recadrage dans les cadres verticaux.
- Toutes les ancres internes pointent vers un élément présent.
- Un seul `h1`, `lang="fr"`, titre SEO et description présents.
- Polices locales chargées ; aucune requête Google Fonts requise.
- Aucune erreur ou alerte de console de production observée pendant les contrôles, notamment aucune erreur d’hydratation.

## Accessibilité et limites

Les rapports de contraste calculés pour les couleurs du texte sont de **4,68:1** (texte secondaire sur fond vert-gris) à **13,40:1** (texte principal sur papier). Les deux couleurs de texte dépassent 4,5:1 sur les deux fonds.

La règle CSS `prefers-reduced-motion: reduce` supprime les transitions et le défilement animé ; elle a été vérifiée dans le code, sans modification des préférences système.

Ces vérifications couvrent le navigateur intégré et les dimensions indiquées. Aucun test sur appareil physique, Safari ou Firefox, aucun audit avec lecteur d’écran ni mesure Lighthouse chiffrée n’a été effectué.

Les serveurs de vérification sont arrêtés après contrôle. Utiliser `npm run dev` pour rouvrir le projet.

## Correctif du hero

Le hero utilise désormais la hauteur dynamique de la fenêtre (`100dvh`), sans plafond à 1 080 px. La photographie est resserrée et sa largeur est limitée pour conserver un format portrait. Sur mobile, le cadre suit un ratio de 2:3 et le hero conserve une hauteur minimale égale à l’écran, tout en laissant le contenu se développer.

La compilation de production a été vérifiée après ce correctif. Les contrôles visuels ci-dessus concernent la version initiale : l’accès à l’aperçu ouvert sur localhost a été bloqué par la politique du navigateur intégré lors du correctif, donc le nouveau rendu n’a pas pu être recontrôlé visuellement.

## Étape 02 — Destinations et navigation géographique

### Vérifications techniques

| Vérification | Résultat |
| --- | --- |
| `npm run lint` | Réussi, zéro erreur et zéro avertissement |
| `npm run typecheck` | Réussi, types Next.js et TypeScript strict |
| `npm test` | Six tests réussis sur les données et les relations |
| `npm run build` | Réussi, accueil et onze pages destinations prérendus |
| `npm run start -- --hostname 127.0.0.1 --port 3002` | Serveur de production démarré |
| `npm run test:routes -- http://127.0.0.1:3002` | Douze pages HTTP 200, 205 liens internes, onze variantes d’images et sept pages 404 vérifiés |

Les tests du modèle vérifient l’unicité des identifiants, la validité des parents, les slugs uniques au sein d’un parent, les quatre villes du Japon, les cinq quartiers de Tokyo, Fujiyoshida sans quartier, la résolution des chemins et des paramètres statiques, ainsi que l’existence des photos locales et de leurs textes alternatifs.

Le contrôle HTTP porte sur le HTML réellement servi en production : un seul `h1`, `main` et `header` par page, langue française, titre et description SEO, absence de `noindex` sur les pages valides, quatre univers sur chaque ville et quartier. Il vérifie aussi le CTA depuis l’accueil, les liens du Japon vers les quatre villes, ceux de Tokyo vers ses cinq quartiers, et l’absence de section quartiers à Fujiyoshida. Tous les liens internes correspondent à une route connue et leurs ancres existent. Les images optimisées présentes dans le HTML répondent avec un contenu image.

Les sept URLs invalides couvrent pays, ville ou quartier inconnu, quartier sous une mauvaise ville, mauvais pays et catégorie détaillée hors périmètre. Elles renvoient un statut HTTP 404, le message français de récupération et `noindex`.

### Revue des contenus et limites de validation

Les six nouvelles photographies ont été inspectées individuellement ; leurs sources, auteurs, licences et localisations sont consignés dans `public/images/CREDITS.md`. Les descriptions restent éditoriales, sans horaires, prix ni promesses pratiques. Les repères de Tokyo et de Dōtonbori ont été recoupés avec [GO TOKYO](https://www.gotokyo.org/fr/see-and-do/index.html) et [Osaka Info](https://www.osaka-info.jp/en/spot/dotonbori/).

Le responsive, les textes alternatifs, les liens de retour, le fil d’Ariane et l’application des styles `prefers-reduced-motion` ont été revus dans le code. Les sections pays et quartiers passent à une seule colonne sur mobile ; les univers conservent la grille adaptée de l’accueil.

**Aucune nouvelle validation visuelle ou interactive dans le navigateur n’est revendiquée pour l’étape 02** : la politique d’accès du navigateur intégré bloque l’aperçu localhost. Les captures et contrôles de viewport de l’étape 01 ne valident pas ces nouvelles pages. Le parcours HTTP valide les destinations des liens, mais ne remplace pas un contrôle du rendu, de l’hydratation, du clavier et des interactions dans le navigateur.

Aucune dépendance n’a été ajoutée ou modifiée pendant cette étape. L’audit npm mentionné plus haut date de l’initialisation ; il n’a pas été relancé. Le serveur de production temporaire utilisé pour les contrôles est arrêté après vérification.

## Étape 03 — Les quatre univers et leurs fiches

### Résultats techniques

| Vérification | Résultat |
| --- | --- |
| `npm run lint` | Réussi, zéro erreur et zéro avertissement |
| `npm run typecheck` | Réussi, types Next.js et TypeScript strict |
| `npm test` | 17 tests réussis, dont 11 pour le catalogue |
| `npm run build` | Réussi ; 68 pages éditoriales prérendues, dont 36 catégories et 20 fiches |
| `npm run start -- --hostname 127.0.0.1 --port 3002` | Démarrage de production réussi |
| `npm run test:routes -- http://127.0.0.1:3002` | 68 pages HTTP 200, 1 460 liens internes, 23 variantes d’images et 13 pages 404 vérifiés |

Le build indique 71 sorties en comptant les sorties techniques de Next.js, les pages 404 et l’icône. Les 68 pages éditoriales sont toutes accessibles depuis l’accueil dans le parcours HTTP.

### Cas métier vérifiés

- Identifiants uniques, slugs uniques dans chaque univers, parents valides, photos locales présentes et sources HTTPS.
- Tokyo réunit ses contenus directs et ceux de ses quartiers, sans doublon de tonkatsu.
- Asakusa n’hérite ni de Maisen Aoyama ni des contenus d’autres quartiers.
- Une référence géographique nationale ne descend pas automatiquement dans toutes les villes ou tous les quartiers.
- L’okonomiyaki est une seule fiche canonique présente à Osaka et à Asakusa, donc également dans la liste de Tokyo.
- Le tonkatsu renvoie à Ginza Bairin et Maisen Aoyama ; les deux établissements renvoient à cette même spécialité.
- Kamiya est associé au monjayaki et à l’okonomiyaki ; Creo-Ru est associé au takoyaki et à l’okonomiyaki.
- L’activité autonome de croquis et le parc d’Ueno se retrouvent dans les deux sens.
- Fujiyoshida possède Honchō-dōri sans quartier et une catégorie Adresses réellement vide.
- Les brouillons sont exclus des listes, fiches, relations et paramètres de génération.
- La recherche pure ignore les accents, combine mots et tags, traite l’absence de résultat et revient à la sélection complète après remise à zéro.
- Les données facultatives sont absentes plutôt qu’inventées : Maisen n’a ni photographie, ni galerie, ni horaires ou attente renseignés. Son fallback est présent dans le HTML. Le taiyaki présente un état honnête sans adresse associée.
- Les URLs invalides et les incohérences de hiérarchie renvoient de vraies réponses 404 avec un message de récupération et `noindex`.

### SEO, ressources et performances

Les contrôles HTTP examinent le HTML de production : un `h1` et un `main` par page, un en-tête de site, des titres SEO distincts, une description, `lang="fr"`, des ancres présentes et des images optimisées répondant en HTTP 200. Les pages de catégories et les fiches ont une URL canonique sans paramètres ; deux variantes de contexte ont été demandées pour vérifier l’absence de duplication canonique.

Les douze nouveaux JPEG occupent **3 640 733 octets au total**, avec un maximum de **581 244 octets** par fichier source. Ils ont été inspectés individuellement ; les crédits et licences sont dans `public/images/discoveries/CREDITS.md`, le footer et les fiches. Les photographies de plats illustrent la spécialité ; les photographies de quartiers utilisées pour des adresses sont signalées comme des vues d’ambiance. Aucun faux visuel de restaurant n’est présenté comme sa photographie.

Les images de tête des fiches sont prioritaires. Les cartes, galeries secondaires et relations utilisent le chargement différé de `next/image` et des attributs `sizes` adaptés au cadre. Les composants de recherche reçoivent leur seule sélection de cartes ; le contenu éditorial reste rendu au build. Aucun service de recherche, bibliothèque de galerie ou autre dépendance n’a été ajouté. Aucune mesure Lighthouse ni mesure de performance sur téléphone réel n’est revendiquée.

### Limites de validation visuelle et interactive

La politique du navigateur intégré ayant bloqué l’aperçu localhost, **aucune nouvelle vérification du rendu ou des interactions dans le navigateur n’a été effectuée**. Le responsive mobile/tablette/ordinateur et la prise en compte de `prefers-reduced-motion` ont été revus dans le code. Le texte du fallback utilise le charbon pour préserver le contraste sur son fond dégradé.

Les tests purs couvrent la logique de recherche et de filtrage ; le parcours HTTP couvre les destinations des liens. Ils ne remplacent pas une vérification de la saisie, du sélecteur, du retour contextuel après hydratation, du clavier ou de la réaction à une panne d’image dans le navigateur. Les liens canoniques de repli et le fallback de photographie absente sont, eux, présents dans le HTML contrôlé. Les captures de l’étape 01 ne représentent pas les nouvelles pages.

Le serveur temporaire de vérification est arrêté en fin de contrôle. L’audit npm n’a pas été relancé, les dépendances étant inchangées.

## Ajustement UX — Onglets Ville et Quartier — 10 octobre 2026

Les catégories distinctes de l’étape 03 sont remplacées par quatre onglets intégrés. Les 36 anciens chemins existent uniquement pour rediriger vers la destination avec `?onglet=…#univers`. Il reste 32 pages éditoriales, dont neuf pages géographiques rendues à la requête pour servir directement l’onglet demandé dans le HTML.

| Vérification | Résultat |
| --- | --- |
| `npm run lint` | Réussi, sans erreur ni avertissement |
| `npm run typecheck` | Réussi |
| `npm test` | 23 tests réussis |
| `npm run build` | Réussi, fiches prérendues, villes/quartiers rendus à la requête, anciennes catégories redirigées |
| `npm run test:routes -- http://127.0.0.1:3002` | 32 pages et 36 variantes d’onglets HTTP 200, 1 474 liens internes, 23 variantes d’images, 36 redirections 308 et 13 pages 404 vérifiés |

Contrôles supplémentaires réellement réalisés :

- Les 36 liens directs ouvrent l’onglet attendu dès la réponse HTML, avec la même URL canonique géographique.
- Quatre onglets et quatre panneaux par page, un seul `aria-selected="true"`, un seul onglet dans l’ordre de tabulation, trois panneaux masqués et des références `aria-controls`/`aria-labelledby` cohérentes.
- Valeur d’onglet absente, inconnue, vide ou répétée : Tourisme par défaut.
- Redirections permanentes des 36 anciens chemins vers le bon onglet et l’ancre ; aucun lien interne ne cible encore `/explorer/`.
- Tokyo agrège toujours ville et quartiers sans doublon ; Asakusa reste limité à son périmètre ; Fujiyoshida ne présente pas de section quartiers vide.
- Relations entre fiches, recherche existante, affichage des informations facultatives, fallback d’image, états vides et canoniques toujours contrôlés.
- Tests purs des flèches avec boucle, Début/Fin, préservation du défilement haut/bas, modification de l’URL et relecture simulée des entrées précédente/suivante.
- Les chemins géographiques invalides sont contrôlés avant le rendu par le proxy. La 404 répond avec son HTML complet, son statut 404 et `noindex`. Ce contrôle corrige le document d’erreur sans contenu HTML rencontré lors du passage au rendu dynamique.

La conception clavier suit le [modèle WAI-ARIA Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). La barre mobile défilante, la hauteur minimale du panneau, les focus visibles et les transitions de 150 ms supprimées avec `prefers-reduced-motion` ont été revus dans le code.

**Limite inchangée :** l’accès à localhost par le navigateur intégré ayant été bloqué, aucun contrôle visuel de viewport, clic réel, focus réel, geste tactile ou parcours Précédent/Suivant après hydratation n’est revendiqué. Le test d’historique est une simulation de la logique d’URL, pas un test dans un navigateur. Le test HTTP valide le rendu initial et la navigation des liens, sans exécuter JavaScript.

Aucune dépendance ni donnée éditoriale n’a été ajoutée. Le serveur temporaire est arrêté après les vérifications ; le serveur de travail éventuel sur le port 3000 n’est pas modifié.

## Étape 04 — Modernisation UX/UI — 10 octobre 2026

Audit des composants et des trois feuilles de style ; inspection des anciennes captures d’accueil ordinateur/mobile. Les constats et décisions sont décrits dans [DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md). Ces captures restent celles de l’étape 01, pas des preuves du nouveau rendu.

Améliorations livrées : tokens sémantiques, corps courant à 16 px, informations secondaires à 13–14 px, navigation visible, menu sans-serif, boutons partagés, onglets et champs plus confortables, grilles régulières, titres de cartes à 20 px, repères pratiques dans une colonne dédiée puis avant le récit sur mobile. Les spécialités disposent d’un portrait culinaire distinct. L’accès aux onglets précède désormais les quartiers sur les pages Ville ; le retour contextuel est présent en haut et en bas des fiches.

| Vérification exécutée | Résultat |
| --- | --- |
| `npm run lint` | Réussi sans erreur ni avertissement, après les dernières modifications de composants |
| `npm run typecheck` | Réussi après autorisation d’exécution hors du bac à sable Windows |
| `npm test` | 23 tests réussis : géographie, catalogue, relations, filtres, routes et logique de navigation |
| `npm run test:contrast` | 26 paires vérifiées ; minimum texte 4,68:1, minimum focus/contours de contrôles 3,17:1 |
| `npm run build` | Réussi après les corrections de contraste et de noms accessibles ; TypeScript validé également pendant le build |
| `npm run test:routes -- http://127.0.0.1:3002` | 32 pages et 36 variantes d’onglets HTTP 200 ; 1 588 liens internes, 23 variantes d’images, 36 redirections 308 et 13 pages 404 |

Le premier contrôle de contraste a détecté 2,81:1 pour la bordure de contrôle sur le fond principal. Le token a été assombri, puis les 26 paires ont été revérifiées avec succès. Le test calcule les luminances sRGB depuis les valeurs hexadécimales des tokens. Il distingue texte à 4,5:1 et contrôles à 3:1 ; il ne constitue pas une certification de conformité WCAG complète.

Le parcours HTTP vérifie toujours les quatre onglets et leurs attributs ARIA, la sélection initiale selon l’URL, les liens partageables, les retours canoniques, les relations entre fiches, les ancres — notamment les nouveaux accès aux repères — et les états vides. Les nouvelles descriptions accessibles des liens de cartes conservent leur titre visible. Aucun changement du modèle de données ou des relations, aucune dépendance ajoutée.

**Limite de contrôle :** aucune nouvelle capture ou interaction réelle dans un navigateur, l’accès au site local par l’outil ayant été bloqué. Responsive, ordre de lecture mobile, focus, cibles tactiles et réduction des mouvements ont été examinés dans le code ; débordement réel, zoom, clic, saisie, retour de focus du menu, navigation clavier et historique après hydratation restent à vérifier visuellement. Les tests purs de touches et d’URL ne remplacent pas ces essais. Une matrice de revue manuelle est incluse dans le document de design.

Les erreurs initiales de résolution de chemin Next.js et de connexion HTTP étaient dues au bac à sable Windows ; les commandes autorisées hors de ce bac à sable ont abouti. Le serveur temporaire du port 3002 est arrêté après vérification, sans toucher au serveur de travail du port 3000. Aucun audit npm ou score Lighthouse supplémentaire n’est revendiqué.

## Ajustement — Fiches compactes sur un écran

Les vingt fiches des quatre univers utilisent une seule composition : informations essentielles à gauche, photographie à droite. Les longs récits, galeries, cartes de recommandations et pied de page sont retirés de l’affichage des fiches. Les relations utiles sont des liens dans la colonne de gauche ; les données détaillées restent intactes dans le catalogue. Le retour vers l’onglet d’origine, les liens officiels, les crédits et les légendes signalant une photographie d’illustration sont conservés.

- `npm run lint`, `npm run typecheck`, `npm test` (23 tests) et `npm run build` : réussis.
- Parcours HTTP final : 32 pages et 36 variantes d’onglets, 1 289 liens internes, 23 variantes d’images, 36 redirections 308 et 13 pages 404 vérifiés.
- Le parcours contrôle désormais qu’aucune fiche ne comporte de footer ni plus d’une image. Les fiches sans relation ne montrent pas de rubrique vide. Les liens tonkatsu ↔ restaurants et activité ↔ lieu continuent de passer les contrôles existants.
- Le cadre photographique est calculé sur la hauteur disponible après l’en-tête et les marges ; les espacements diminuent sur ordinateur sous 761 px de hauteur. Le texte peut s’étendre naturellement sur une fenêtre très basse ou avec un zoom important, sans être coupé ni enfermé dans un défilement interne.
- La composition mobile s’empile : informations puis photo. Aucun contrôle visuel réel du nombre de pixels défilables n’est revendiqué, car l’accès au site local par l’outil navigateur reste bloqué. Le cadrage et l’ajustement exact au viewport devront être confirmés dans un navigateur autorisé.

Le serveur temporaire sur 3002 a été arrêté après les contrôles. Aucun changement de dépendances, de routes ou de données.

## Correctif — Accents et macrons dans les polices

Les anciennes fontes locales contenaient les accents français courants, mais pas `Ÿ`, `ō`, `ū`, `Ō` et `Ū`. Les trois fichiers WOFF2 ont été remplacés par des sous-ensembles latins étendus issus des mêmes familles : Cormorant Garamond romain et italique, Manrope. Les caractères précédemment disponibles et les axes variables sont conservés. Les sources et la méthode de conversion figurent dans `src/app/fonts/README.md`.

- Couverture vérifiée dans chaque fichier : les 69 caractères latins distincts présents dans les sources du site disposent tous d’un glyphe.
- Composition de titres vérifiée sans glyphe manquant : Sensō-ji, Honchō-dōri, Dōtonbori, Échappée, À découvrir, Activités, Crème brûlée, Œuvre, ainsi que les macrons et `Ÿ`. Contrôle sur les caractères précomposés (NFC), utilisés dans le contenu actuel ; rapport local `.qa/font-coverage.json`.
- `npm run lint` et `npm run build` : réussis, TypeScript inclus dans le build.
- Aucune dépendance applicative ajoutée. Les outils de conversion restent dans le dossier temporaire ignoré `.qa/` ; ils ne sont requis ni au build ni lors d’une visite.
- Vérification des fichiers et de la compilation ; aucune nouvelle vérification visuelle dans le navigateur.

## Ajustement — Explorer les villes par quartier

Une ville possédant des quartiers affiche leur liste après son introduction, sans catalogue ni onglets. Son bouton principal mène à `#quartiers`. Les quartiers et les villes sans subdivision conservent les quatre univers. Les anciennes URL d’onglets et catégories des villes subdivisées redirigent vers les quartiers. Les retours des fiches et le fil d’Ariane restent cohérents avec cette hiérarchie, sans modifier les rattachements géographiques du catalogue.

- `npm run lint`, `npm test` (24 tests) et `npm run build` : réussis, TypeScript inclus.
- Parcours HTTP : 32 pages et 32 variantes d’onglets, 1 269 liens internes, 23 variantes d’images, 43 redirections 308 et 13 pages 404 vérifiés.
- Vérification explicite de l’absence d’onglets et de liens directs aux fiches sur Tokyo, de l’accès aux cinq quartiers, du maintien des catalogues de quartier et de ville sans subdivision, et de l’absence de liens internes vers l’ancien catalogue de Tokyo.
- Les vingt fiches restent atteignables depuis l’accueil ; les retours du tonkatsu vers Shinjuku et de Maisen Aoyama vers les quartiers de Tokyo sont vérifiés.
- Contrôles du HTML serveur et des liens, sans nouvelle interaction visuelle dans un navigateur. Le serveur temporaire sur 3002 a été arrêté après les vérifications.

## Proposition — Page Destinations en atlas — 11 octobre 2026

La page Destinations associe une photographie de pays, cliquable vers son carnet, à une liste illustrée des villes avec accès direct. Les cinq quartiers de Tokyo sont annoncés dans sa ligne. Les descriptions longues ont été remplacées par des libellés courts ; le fil d’Ariane et le pied de page sont conservés. Les styles de cette composition sont propres à la page d’index.

- `npm run build` : réussi, TypeScript inclus.
- Page `/destinations` servie sur le serveur de travail du port 3000 : HTTP 200, nouvelle composition présente dans le HTML.
- `npm run test:routes -- http://127.0.0.1:3000` : 32 pages et 32 variantes d’onglets, 1 270 liens internes, 23 variantes d’images, 43 redirections 308 et 13 pages 404 vérifiés.
- Contraste calculé du texte ivoire sur la photographie : minimum 9,05:1 pour le voile à 84 % sur une image entièrement blanche. Les autres couleurs emploient les tokens existants.
- Grille de villes sur deux colonnes sous 961 px, puis une seule sous 601 px ; chaque ligne est un lien entier, avec focus visible et mouvements soumis à la préférence de réduction des animations. Ces comportements sont définis et examinés dans le code, sans nouveau contrôle visuel dans un navigateur.
- Aucun ajout de dépendance, de photographie ni de JavaScript client. Une copie locale de la page et de sa feuille de style précédentes est conservée dans `.qa/destinations-before-atlas/`.
## Étape 05 — Firebase et administration — 14 octobre 2026

### Modifications

- Firebase Web 13.0.0 et Admin 14.5.0, initialisation différée et frontières
  `client-only` / `server-only`. Node.js minimum relevé à 22 pour Admin.
- Configuration fournie placée dans `.env`, permissions `600`, fichier ignoré
  et non suivi par Git. `.env.example` documente les variables sans secrets.
- Connexion `/admin/login`, pages `/admin` et `/admin/settings` protégées côté
  serveur, interface responsive, navigation future explicitement indisponible.
- Sessions Firebase de 8 heures : HttpOnly, SameSite Strict, Secure et préfixe
  `__Host-` en production, CSRF, contrôle des révocations et du rôle courant.
- Script sécurisé d’attribution / retrait du rôle et révocation globale.
- Règles Firestore et Storage, configuration des émulateurs, proposition de
  schéma et accès serveur préparatoires sans migration des données publiques.

### Vérifications réellement effectuées

- `npm run typecheck` : réussi.
- `npm run lint` : réussi, aucun avertissement.
- `npm test` : 27 tests réussis, dont les nouvelles politiques d’autorisation,
  de fraîcheur d’authentification et de contrôle d’origine.
- `npm run test:firebase-rules` : 3 groupes réussis sur les émulateurs Firestore
  et Storage, JDK 21. Les sept collections, documents publics, brouillons,
  documents privés, champs de publication absents, requêtes filtrées, écritures,
  sous-collections et collections inconnues ont été contrôlés pour visiteurs,
  comptes ordinaires et administrateurs. Storage est fermé à tous.
- `npm run test:admin-auth` : réussi sur Auth Emulator et Next.js isolé. Script
  d’attribution du rôle, connexion, création de cookie, garde des deux pages,
  absence de contenu administratif pour les visiteurs, refus des comptes ordinaires,
  token forgé, CSRF invalide, origine étrangère, JSON invalide, corps trop volumineux,
  retrait immédiat du rôle, révocation et déconnexion locale vérifiés.
- Le même test redémarre sans configuration : formulaire désactivé, création
  de session en erreur 503 et accueil / destinations / Tokyo toujours HTTP 200.
- Garde de configuration contrôlée séparément : émulateurs refusés en production,
  refus d’un projet réel en mode émulation, hôtes non activés et secrets absents.
- `npm run build` : compilation de production réussie après les derniers
  ajustements ; les routes d’administration sont dynamiques, 64 pages générées.
- `npm run test:routes -- http://127.0.0.1:3106` sur un build de production :
  32 pages, 32 variantes d’onglets, 1 270 liens internes, 23 variantes d’images,
  43 redirections 308 et 13 pages 404 contrôlés.
- `npm run test:contrast` : 26 contrastes sémantiques existants contrôlés,
  minimum texte 4,68:1 ; contours et focus 3,17:1. Ce script concerne les
  tokens publics ; il ne constitue pas un audit complet des couleurs admin.
- Cookie CSRF du serveur de production : `Secure`, `HttpOnly`, `SameSite=Strict`,
  préfixe `__Host-` constatés. Aucun PEM privé, email de compte de service ou
  variable de clé Admin dans les fichiers JavaScript des bundles navigateur.
- Contrôle du PEM fourni : clé RSA correctement analysée localement, sans
  afficher son contenu. Cela ne vérifie pas sa validité auprès de Google Cloud.
- Revue réelle dans le navigateur avec un utilisateur d’émulation : connexion,
  erreur de mot de passe, soumission par Entrée, déconnexion et message de succès,
  ouverture du menu mobile, fermeture par Échap avec restitution du focus et
  navigation vers Paramètres. Tableau de bord revu sur ordinateur, tablette
  768 px et mobiles 390 / 320 px ; aucun débordement horizontal sur ces largeurs.
  Aperçu local conservé dans `.qa/admin-dashboard-step05.jpg` (ignoré par Git).

Les serveurs et utilisateurs temporaires de vérification ont été arrêtés et
nettoyés. Le serveur de développement déjà ouvert sur le projet a été conservé.

### Audit des dépendances et limites

L’audit initial signalait une dépendance gRPC ancienne embarquée par le SDK
Firestore Web pour Node.js. Un override ciblé vers `@grpc/grpc-js ^1.14.6`
la remplace ; les tests d’émulateurs ont été rejoués après ce changement.
`npm audit --omit=dev` : **0 vulnérabilité**. L’audit complet conserve
**15 alertes dans l’outillage de développement** (11 élevées, 4 modérées),
notamment dans les dépendances transitives du CLI Firebase et d’ESLint.
Les rétrogradations majeures proposées par `npm audit fix --force` n’ont pas
été appliquées. Les rapports sont conservés localement dans `.qa/`.

Aucune connexion réelle d’un utilisateur de `nagi-travelapp`, écriture de donnée,
création d’administrateur de production ou publication de règles n’a été faite.
Activer Email/Password, créer le premier compte, attribuer son rôle, vérifier les
domaines autorisés et déployer les règles restent des actions Firebase manuelles.
La clé privée communiquée doit être remplacée avant déploiement. Le guide complet
est dans [docs/FIREBASE.md](docs/FIREBASE.md), le schéma dans
[docs/FIRESTORE-SCHEMA.md](docs/FIRESTORE-SCHEMA.md).

## Étape 06 — Administration géographique — 14 octobre 2026

### Fonctionnalités livrées

- Pays, villes et quartiers administrables avec formulaires Zod, choix des images
  existantes, recherche, tri, statuts, visibilité et archives réversibles.
- Parcours hiérarchique, fil d’Ariane et parents présélectionnés ; quartiers
  facultatifs. Les villes conservent leurs quatre univers avec ou sans quartiers.
- Vérification serveur des sessions et rôles avant chaque mutation, CSRF, corps
  de requête borné, parents valides et immuables, contrôle des révisions.
- Réservations de slugs transactionnelles par périmètre. Concurrence des créations
  gérée ; URL protégées après première publication, même après dépublication.
- Source publique exclusive `static` ou `firestore`, rendu serveur dynamique,
  projection publique et visibilité héritée ; invalidation des chemins concernés.
- Import des dix destinations historiques, simulation, garde de projet et double
  paramètre volontaire pour appliquer. Les documents existants restent intacts.
- Règles refusant toute écriture géographique par le SDK client, même administrateur,
  et vérifiant les parents pour les lectures publiques. Storage reste fermé.

### Vérifications réellement effectuées

- `npm run typecheck` et `npm run lint` : réussis, sans avertissement ESLint.
- `npm test` : **32 tests réussis**. Cinq nouveaux groupes couvrent la fidélité de
  l’import, la visibilité héritée, les villes sans quartiers, la projection publique,
  les périmètres de slugs et la validation des entrées.
- `npm run test:geography` : réussi sur `demo-nagi`, Auth + Firestore et Next.js
  temporaire sur `3107`. Les six scénarios demandés ont été vérifiés par requêtes
  réelles : pays en brouillon puis publié, ville ajoutée au Japon et ses quatre
  onglets sans quartier, quartier ajouté à Tokyo, modifications visibles, masquage
  des descendants et des fiches associées après dépublication du pays, refus des
  requêtes sans session / sans rôle / d’origine étrangère et de la suppression.
- Ce test vérifie également les conflits simultanés de slugs (**une création réussit,
  l’autre reçoit 409**), les éditions concurrentes, les URLs gelées, les références
  d’images non autorisées, parents inexistants, déplacements refusés, archivage et
  restauration, réservations conservées, catalogue Firestore vide sans repli local,
  séparation du mode statique, simulation sans écriture, confirmation obligatoire,
  mauvais projet refusé, IDs préservés et réimport conservant les modifications.
- `npm run test:firebase-rules` : **4 groupes réussis**. Publications privées et
  brouillons, requêtes filtrées, écritures, réservations, sous-collections, héritage
  du pays et Storage vérifiés pour visiteurs, comptes ordinaires et administrateurs.
- `npm run test:admin-auth` : réussi après raccordement de l’émulateur Firestore.
  Connexion, refus non-admin, CSRF, cookies, garde des routes, révocation, retrait
  du rôle, déconnexion et absence de configuration restent contrôlés.
- `npm run build` : réussi avec Turbopack. Les routes de géographie, d’administration
  et les fiches liées sont maintenant dynamiques pour intégrer les modifications.
- `npm run test:routes -- http://127.0.0.1:3106` sur le build de production :
  **32 pages, 36 variantes d’onglets, 1 397 liens internes, 23 variantes d’images,
  36 redirections 308 et 13 pages 404** contrôlés. Les anciens tests imposant
  l’absence d’univers dans une ville avec quartiers ont été adaptés à la demande
  de cette étape ; ces villes possèdent désormais leurs propres onglets.
- `npm run test:contrast` : 26 contrastes des tokens existants vérifiés ; minimum
  texte 4,68:1 et contours / focus 3,17:1. Pas d’audit automatique exhaustif des
  nouvelles surfaces d’administration.
- Audit des dépendances de production : **0 vulnérabilité**. Zod est explicitement
  une dépendance de production. Les limites de l’outillage de développement de
  l’étape 05 restent consignées dans ce document.
- Contrôle des bundles JavaScript : aucun PEM privé, email de compte de service ou
  variable de clé privée Admin dans les ressources navigateur.

### Revue dans le navigateur

Parcours effectué sur un serveur isolé avec un compte d’émulation :

- Création complète d’un pays depuis un affichage 390 px, validation des champs
  vides avec focus sur le premier champ, proposition automatique du slug, sélection
  d’une image et sauvegarde avec confirmation.
- Création d’une ville, puis d’un quartier sans ressaisir le parent ; noms et
  contextes hiérarchiques conservés après chaque sauvegarde.
- Publication des enfants sous un pays encore en brouillon : indication explicite
  du masquage. Publication du pays puis consultation réelle des nouvelles pages
  publiques avec quartier et quatre onglets.
- Dialogue d’archivage indiquant les deux destinations enfants, fermeture par
  Échap et restitution du focus ; dialogue recentré après revue mobile.
- Listes et navigation contrôlées sur ordinateur, tablette 768 px, mobiles 390 et
  320 px. Aucun débordement horizontal sur ces cas. Menu mobile ouvert et fermé
  au clavier. Ce contrôle ne constitue pas une certification d’accessibilité complète.

Aperçus locaux ignorés par Git : `.qa/geography-japan-desktop.jpg` et
`.qa/geography-archive-mobile.jpg`. Les données de revue sont restées dans
l’émulateur. Les serveurs, comptes et copies temporaires de test ont été nettoyés ;
le serveur de développement déjà ouvert sur le projet a été conservé.

### Mise en service du projet réel

Aucune écriture, importation, modification de rôle ou publication de règles n’a
été effectuée sur `nagi-travelapp`. Une connexion utilisateur réelle Firebase n’est
pas revendiquée. `.env` conserve **`NAGI_GEOGRAPHY_SOURCE=static`** afin de maintenir
le carnet public existant jusqu’à validation explicite de la migration.

Pour activer le catalogue administré : vérifier la base Firestore (default), les
accès administrateurs et l’origine de session, simuler puis appliquer l’import
volontairement, contrôler les dix destinations, déployer les nouvelles règles,
puis définir `NAGI_GEOGRAPHY_SOURCE=firestore` et redémarrer le serveur. La procédure
complète et les conséquences d’un retour au mode statique sont documentées dans
[docs/GEOGRAPHY.md](docs/GEOGRAPHY.md).

## Correctif — lecture des destinations Firestore historiques

Le message d’indisponibilité sur Pays et Villes & Quartiers provenait du format
des trois documents déjà présents, et non d’un refus de connexion Firebase :
absence de `kind` et des métadonnées du nouveau modèle, images sous forme de
chemins, champs pays vides sur les enfants et pays en brouillon sans présentation.

- Lecture du projet réel `nagi-travelapp` avant et après le correctif : le lecteur
  commun à l’administration retourne désormais Japon, Tokyo et Shinjuku. Le Japon
  reste en brouillon et ses enfants publiés restent masqués par héritage.
- Aucune écriture sur le projet réel, aucune modification de rôle, de règles ou
  de variable d’environnement ; adaptation des anciens documents en mémoire.
- `npm test` : **35 tests réussis**, dont la lecture historique sans mutation,
  la conservation des relations et images, le brouillon incomplet et le refus
  des documents invalides ou versions inconnues.
- `npm run test:geography` : réussi sur les émulateurs. Régression reproduite avec
  l’ancien format sur les pages Pays, Villes, détail de ville et édition de pays ;
  affichage sans écriture, édition au format courant, archivage, héritage de
  visibilité et refus de modifier une adresse publiée vérifiés.
- `npm run typecheck`, `npm run lint` et `npm run build` : réussis.
- Les formats non reconnus indiquent maintenant le document concerné dans
  l’administration. Aucun message brut du SDK Firebase n’est renvoyé au client.
