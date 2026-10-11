# nagi.

Nagi est un carnet de découverte culturelle, entièrement en français. La landing page se prolonge par une exploration géographique : le Japon, quatre villes et cinq quartiers de Tokyo. Quatre univers donnent accès à vingt fiches reliées entre elles : Tourisme, Activités, Gastronomie et Adresses.

## Lancer le projet

Prérequis : Node.js **20.9 minimum**, de préférence une version LTS récente (développement vérifié sous Node.js 24), et npm.

```bash
npm ci
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000). Aucune variable d’environnement, clé API ou configuration de service externe n’est nécessaire.

Pour préparer une publication, définir `NEXT_PUBLIC_SITE_URL` avec l’origine réelle du site avant le build, comme indiqué dans `.env.example`. Cette variable sert aux URL canoniques ; sa valeur locale par défaut est `http://localhost:3000`.

```bash
npm run lint       # ESLint, aucun avertissement accepté
npm run typecheck  # Génération des types Next.js puis TypeScript strict
npm test           # Intégrité des données, relations et paramètres de routes
npm run test:contrast # Contrastes des couleurs sémantiques (texte et contrôles)
npm run build     # Compilation et prérendu de production
npm run start     # Sert le build de production
```

Une fois le serveur démarré, `npm run test:routes` vérifie les réponses HTTP, les liens, les images, les métadonnées et les pages 404. Pour un autre port : `npm run test:routes -- http://127.0.0.1:3002`.

## Choix techniques

- Next.js **16.4.0**, version stable du canal npm `latest` vérifiée à l’initialisation, avec App Router ; React **19.3.0**.
- TypeScript strict et Tailwind CSS **4.3.3**, via PostCSS. Les tokens sont exposés dans `@theme inline` ; les compositions éditoriales sont décrites dans la feuille globale.
- Pages et sections éditoriales en Server Components. Les onglets, le menu, la galerie d’accueil, la recherche locale, le fallback d’image et la conservation du contexte de navigation utilisent des Client Components ciblés.
- Lucide React pour les quelques icônes. Aucun kit de composants supplémentaire.
- Cormorant Garamond et Manrope, hébergées localement en WOFF2 et gérées par `next/font/local`. Le build n’a pas besoin de télécharger de polices.
- Photographies locales, optimisées par `next/image`. Le premier visuel est chargé immédiatement avec priorité haute ; les autres grands visuels de la galerie ne sont montés qu’à leur première sélection. La transition attend le chargement de la photo.
- Versions exactes et `package-lock.json` pour des installations reproductibles.

## Organisation

```text
src/
  app/
    fonts/                   Polices WOFF2 et licences SIL OFL
    destinations/
      page.tsx               Liste des pays
      [country]/page.tsx     Présentation du pays et de ses villes
      [country]/[city]/page.tsx
      [country]/[city]/[district]/page.tsx
      [country]/[city]/explorer/[universe]/page.tsx  Redirection des anciens liens
      [country]/[city]/[district]/explorer/[universe]/page.tsx  Même compatibilité
      layout.tsx             En-tête et pied de page partagés
      destinations.css       Compositions et responsive des pages intérieures
    decouvertes/
      [universe]/[slug]/page.tsx  Fiche canonique commune aux destinations
      discoveries.css        Catalogue et articles des quatre univers
    tokens.css               Couleurs, échelle typographique, espaces, rayons et mouvement
    globals.css              Accueil, navigation, boutons et styles partagés
    icon.svg                 Icône Nagi
    layout.tsx               Polices, langue, métadonnées et lien d’évitement
    page.tsx                 Composition de la page d’accueil
    not-found.tsx            Page 404 et liens pour reprendre l’exploration
  components/
    landing/
      hero.tsx               Galerie et sélection de destination
      discover.tsx           Trois escales dans une composition décalée
      universes.tsx          Les quatre univers
      spirit.tsx             Texte éditorial
    destinations/            Fil d’Ariane, hero, collection, univers et retour
    discoveries/             Recherche, cartes, articles, informations, relations
      destination-tabs.tsx   Onglets géographiques, clavier et historique
    site-header.tsx          Menu modal accessible
    site-footer.tsx          Navigation, crédits dépliables, retour en haut
    text-link.tsx            Lien discret partagé
    universe-grid.tsx        Présentation commune des quatre univers
  data/fr.ts                 Textes partagés et sélection de l’accueil
  data/geography.ts          Pays, villes et quartiers, reliés par identifiants
  data/destination-photographs.ts  Photos des nouvelles destinations et crédits
  data/catalogue/            Lieux, expériences, spécialités et établissements
  data/discoveries.ts        Collection typée réunissant les quatre univers
  data/discovery-photographs.ts  Photographies et licences du catalogue
  data/universes.ts          Présentation et états vides des quatre univers
  lib/destinations.ts        Recherches, relations, chemins et paramètres statiques
  lib/destination-pages.ts   Résolution des routes et notFound()
  lib/destination-metadata.ts  Métadonnées des destinations
  lib/discoveries.ts         Requêtes de lecture et relations entre fiches
  lib/discovery-geography.ts Résolution des périmètres et règles géographiques
  lib/discovery-filter.ts    Recherche et filtrage purs, sans service externe
  lib/universe-navigation.ts Sélection d’onglet, URL et navigation au clavier
  lib/geographic-routing.ts Validation des chemins géographiques
  proxy.ts                  Page 404 complète pour les chemins invalides
  lib/format.ts              Numérotation éditoriale
  types/content.ts           Contrats des contenus
  types/destinations.ts      Country, City, District et vues avec leurs enfants
  types/discoveries.ts       Union discriminée des quatre types de contenus
public/images/               Vingt-trois photos locales et fichiers de crédits
tests/                       Tests des destinations, du catalogue et des filtres
scripts/check-routes.mjs      Vérification HTTP d’un serveur local
scripts/check-contrast.mjs    Vérification de 26 paires de couleurs sémantiques
```

`src/data/fr.ts` regroupe les contenus éditoriaux pour permettre l’ajout futur de dictionnaires de langues. Aucun routage multilingue ou service de traduction n’est installé à cette étape. Quelques libellés d’interface sont encore proches des composants qui les utilisent.

`AGENTS.md` est généré par Next.js et renvoie à la documentation embarquée correspondant à la version installée.

## Fondations visuelles

L’accueil conserve ses photographies asymétriques, son hero d’au moins une hauteur d’écran et ses titres en Cormorant Garamond. Les pages d’exploration emploient Manrope pour les cartes, les onglets, la navigation et les informations pratiques. Le corps courant est à 16 px, les informations secondaires à 13–14 px, les titres de cartes à 20 px. Les tailles sont exprimées en rem dans les tokens.

`src/app/tokens.css` centralise les couleurs sémantiques, l’échelle de texte, les espacements, les rayons, les transitions et les largeurs. `.section-shell`, `.section-heading`, `.button` avec les variantes `button-primary`, `button-secondary`, `button-quiet`, et le composant `TextLink` forment les primitives partagées. Les surfaces fonctionnelles restent réservées aux filtres, onglets, états vides et repères pratiques.

Les villes subdivisées présentent leurs quartiers, avec un accès direct depuis l’introduction. Les quatre onglets apparaissent dans chaque quartier et dans les villes sans subdivision. Les fiches détaillées sont volontairement courtes : informations à gauche, une photographie à droite, sans galerie, long récit, recommandations ni pied de page en dessous. Le cadre photographique suit la hauteur disponible de l’écran. Sur mobile, les deux colonnes s’empilent. La fiche conserve le retour à la sélection, un résumé, trois repères au maximum, les relations utiles sous forme de liens et un lien vers la source. Les textes longs restent disponibles dans les données du catalogue.

La page `/destinations` adopte une composition d’atlas : une grande photographie ouvre le carnet du pays, et une liste de villes illustrées permet un accès direct à chaque escale. Tokyo annonce ses cinq quartiers. Les villes passent sous la photographie sur tablette, puis sur une seule colonne sur mobile. La page est rendue sur le serveur, sans interaction JavaScript supplémentaire ; les pays, villes et nombres de quartiers proviennent du catalogue géographique.

Voir [l’audit et les conventions du design system](docs/DESIGN-SYSTEM.md) et [les vérifications réellement effectuées](VALIDATION.md). La validation visuelle après cette modernisation reste à effectuer dans un navigateur autorisé.

## Architecture géographique

| Route | Contenu initial |
| --- | --- |
| `/destinations` | Liste des pays disponibles |
| `/destinations/japon` | Japon et ses quatre villes |
| `/destinations/japon/tokyo` | Tokyo, ses cinq quartiers et ses propres univers |
| `/destinations/japon/kyoto` | Kyoto et ses univers |
| `/destinations/japon/osaka` | Osaka et ses univers |
| `/destinations/japon/fujiyoshida` | Fujiyoshida et ses univers, sans section quartiers |
| `/destinations/japon/tokyo/[district]` | `shinjuku`, `ueno`, `asakusa`, `shibuya`, `ginza` |

Les trois collections de `src/data/geography.ts` sont normalisées. Chaque ville référence son pays par `countryId` ; chaque quartier référence sa ville par `cityId`. Les identifiants sont indépendants des slugs et les slugs sont uniques au sein de leur parent. Les listes de villes et de quartiers sont dérivées, sans tableaux inverses à maintenir.

`getCountryBySlug()` renvoie un `CountryWithCities`. `getCityBySlug(countryId, slug)` renvoie un `CityWithDistricts`, dont la liste peut être vide. `getDistrictBySlug(cityId, slug)` recherche exclusivement sous sa ville parente. Les fonctions `getCitiesByCountry()` et `getDistrictsByCity()` permettent aussi de consulter ces relations séparément. Les pages passent par `requireCountry`, `requireCity` et `requireDistrict` : chaque segment est validé, puis `notFound()` est appelé si la chaîne est incohérente.

Les composants de présentation reçoivent des données typées ; ils ne connaissent aucune base de données. Une future intégration Firestore pourra remplacer la couche de lecture de `src/lib/destinations.ts`, rendre ses appels asynchrones et adapter la stratégie de rendu, sans réécrire les compositions visuelles. Aucun SDK ni service distant n’est installé.

Les univers d’une ville sont affichés indépendamment de ses quartiers. Tokyo présente ses quartiers puis quatre onglets de contenu ; Fujiyoshida passe directement aux onglets. Les pages Quartier utilisent le même composant, avec leurs seuls contenus associés.

L’accueil, les pays et les fiches détaillées restent prérendus. Les pages Ville et Quartier sont rendues à la requête pour afficher dès le HTML initial l’onglet demandé dans l’URL. Chaque page à paramètres fournit ses métadonnées avec `generateMetadata`. Les anciens chemins de catégories sont des redirections permanentes prégénérées ; ils ne contiennent plus de catalogue distinct.

`src/proxy.ts` valide les chemins Ville/Quartier et les anciennes catégories avec les mêmes données géographiques. Les chemins invalides servent la page 404 statique existante avec un statut 404 et sans changer l’URL, pour éviter le document d’erreur sans contenu HTML observé sur ces routes dynamiques avec Next.js 16.4.

## Catalogue et relations

Le catalogue compte **6 lieux, 4 idées d’expériences, 6 spécialités et 4 établissements réels**. Ses types, règles de filtrage et conventions sont détaillés dans [docs/CATALOGUE.md](docs/CATALOGUE.md).

Exemples de parcours :

- `/destinations/japon/tokyo/asakusa?onglet=tourisme` → `/decouvertes/tourisme/senso-ji`.
- `/destinations/japon/tokyo/shinjuku?onglet=gastronomie` → `/decouvertes/gastronomie/tonkatsu` → Ginza Bairin ou Maisen Aoyama → retour au tonkatsu.
- `/destinations/japon/fujiyoshida?onglet=tourisme` → Honchō-dōri, sans passer par un quartier.
- `/destinations/japon/fujiyoshida?onglet=adresses` → état vide avec les trois autres onglets toujours accessibles.

Les villes ayant des quartiers, comme Tokyo, présentent uniquement le choix des quartiers après leur introduction. Les villes sans quartier conservent leur catalogue. Une page de quartier contient seulement les associations explicites à ce quartier. La couche de lecture conserve l’agrégation des contenus par ville, sans l’afficher sur les villes subdivisées. Les établissements portent les identifiants des spécialités qu’ils proposent ; les activités portent l’identifiant de leur lieu éventuel. Les relations inverses sont calculées.

Les quatre onglets sont sur les pages Quartier et les pages Ville sans subdivision. `?onglet=gastronomie` sélectionne Gastronomie ; une valeur absente, invalide ou répétée sélectionne Tourisme. Un changement utilise `history.pushState` et `useSearchParams`, sans rechargement ni nouvelle page. Précédent/Suivant relisent l’URL. Les flèches gauche/droite, Début/Fin et Entrée/Espace sont pris en charge ; les onglets peuvent défiler horizontalement sur petit écran. Le contenu des panneaux inactifs n’est pas monté, et leurs images ne sont donc pas chargées.

Les 36 anciens chemins `/explorer/[universe]` renvoient un statut 308 vers la destination avec `?onglet=…#univers`, ou vers `#quartiers` pour une ville subdivisée. Les anciennes URL `?onglet=…` de ces villes rejoignent également la liste des quartiers. Les liens du site utilisent directement la bonne destination. Les paramètres ne modifient pas la canonique de la ville ou du quartier.

La recherche apparaît à partir de quatre résultats dans l’onglet, avec un filtre de thème lorsque celui-ci permet de distinguer les contenus. Elle combine les mots saisis, ignore les accents et reste entièrement locale. Les petites sélections restent directement lisibles. Changer d’onglet réinitialise la recherche et le filtre de la sélection.

Les fiches conservent la destination et l’univers d’origine dans les paramètres `depuis` et `univers`, y compris lors des liens entre contenus. Le lien de retour rejoint le bon onglet et l’ancre `#univers`, ou les quartiers si le contexte désigne une ville subdivisée. Sans contexte, une association permettant d’accéder au catalogue est privilégiée : par exemple Shinjuku pour le tonkatsu. Le fil d’Ariane reste présent. Leur URL canonique reste indépendante de ce contexte. Sans JavaScript, les liens canoniques, les liens d’onglets avec rechargement et le retour vers la destination principale restent disponibles.

## Direction artistique et interactions

Le hero reprend les principes de la référence : photographie verticale dominante, marge éditoriale à gauche et texte serif accompagné de vignettes à droite. L’identité, les photographies et les contenus sont propres à Nagi.

La palette associe l’ivoire vert `#DFE1DA`, le papier `#F5F4EF`, le charbon `#252925` et les séparateurs `#B8BDB4`. Le texte secondaire est volontairement assombri en `#59645B` pour préserver son contraste. Les espacements et les cadres photographiques remplacent les cartes arrondies et les ombres.

- Les trois vignettes et les trois liens de sélection latéraux pilotent la même photographie et sa légende, sans changement automatique.
- Le menu utilise un `<dialog>` modal natif, une boucle de focus, la fermeture par Échap et le retour du focus sur son bouton d’ouverture.
- « Explorer les destinations » ouvre `/destinations`. Les trois escales de l’accueil ouvrent leur page ville et le lien éditorial ouvre le Japon.
- En-tête, pied de page, quatre univers et styles typographiques sont partagés. Les pages intérieures ajoutent un fil d’Ariane, des liens de retour et des compositions photographiques décalées.
- Les liens « Univers » et « Esprit Nagi » rejoignent les sections de l’accueil depuis toutes les pages.
- Les crédits photographiques se déplient dans le footer et renvoient aux photographes et à la licence.
- Mobile : photo en ouverture, titre et vignettes côte à côte, destinations décalées, univers en deux colonnes. Tablette : hero en deux colonnes. Ordinateur : composition en trois zones.
- Lien d’évitement, hiérarchie des titres, textes alternatifs, états de sélection annoncés, focus visible et prise en compte de `prefers-reduced-motion`.

## Images et licences

Les onze photographies des destinations proviennent d’Unsplash ; leurs crédits figurent dans [public/images/CREDITS.md](public/images/CREDITS.md). Le catalogue ajoute douze JPEG locaux, documentés dans [public/images/discoveries/CREDITS.md](public/images/discoveries/CREDITS.md), et réutilise certains visuels lorsque le sujet correspond exactement. Dix nouveaux clichés sont sous licence Unsplash ; deux sont sous licences CC BY 3.0 et CC BY-SA 4.0. Auteur, source, licence et transformations sont indiqués dans les crédits accessibles et sur les fiches.

Les photos d’activités illustrent une pratique ; elles ne représentent pas un atelier commercial disponible. Les visuels d’ambiance de Ginza et Dōtonbori sont identifiés comme des vues de quartier. Maisen et Kamiya ont un fallback graphique explicite, sans fausse photographie d’établissement. Ce fallback s’affiche aussi lorsqu’une image échoue à se charger. Les photos principales des fiches sont prioritaires ; les cartes, galeries secondaires et contenus associés sont chargés progressivement via `next/image`.

Les licences des typographies figurent dans [src/app/fonts](src/app/fonts).

## Périmètre

Trente-deux pages : l’accueil, onze pages de destinations et vingt fiches détaillées. Les quatre univers sont intégrés aux pages Ville et Quartier. Le contenu est local ; seules ces neuf pages sont rendues à la requête. Aucun compte, authentification, administration, base de données, carte interactive, système de réservation, favoris, itinéraire ou fonction communautaire. Aucune nouvelle dépendance n’a été nécessaire.

Les métadonnées incluent titre, description, Open Graph et Twitter. Les pages Ville/Quartier et les fiches possèdent une URL canonique indépendante des paramètres d’onglet et de contexte. Le domaine public doit être configuré avant un déploiement ; aucune image sociale spécifique n’est encore générée.

## Vérification

Les résultats de la livraison sont consignés dans [VALIDATION.md](VALIDATION.md).

L’audit npm des dépendances de production ne signale aucune vulnérabilité au 9 octobre 2026. L’audit complet remonte une vulnérabilité transitive `braces` (épuisement de pile sur des motifs profondément imbriqués), propagée dans cinq paquets de la chaîne ESLint. Le registre ne propose pas encore de version corrigée compatible de `braces` ; la rétrogradation majeure suggérée par `npm audit fix --force` n’a pas été appliquée. ESLint 9 est conservé pour respecter les peer dependencies des plugins React. Cette limite concerne l’outillage de développement et devra être réévaluée lors de sa prochaine mise à jour.
