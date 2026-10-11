# Nagi — Fondations UX/UI

## Audit avant modification — 10 octobre 2026

L’audit a porté sur les composants, les feuilles de styles, l’arborescence complète et les anciennes captures locales de l’accueil (`.qa/nagi-desktop.jpg`, `.qa/nagi-mobile.jpg`). Ces captures concernent l’étape 01 et ne constituent pas un aperçu des pages intérieures ni de la présente étape.

| Surface | Problème identifié dans l’existant | Réponse implémentée |
| --- | --- | --- |
| Accueil | Descriptions à 11–12 px, légendes à 8–9 px, vignettes de 30–35 px sur petit écran | Corps 16 px, métadonnées 13 px, vignettes mobiles de 56 × 72 px ; photo portrait et compositions décalées conservées |
| Navigation | Accès aux destinations caché sur mobile, menu presque exclusivement éditorial | Lien Destinations toujours visible, menu sans-serif, lien Accueil explicite, zones tactiles de 44 px |
| Pays et destinations | Introductions petites, grandes variations de taille, fil d’Ariane à 9–10 px | Titres éditoriaux 40–64 px, paragraphes 16 px, fil d’Ariane 13 px avec liens de 44 px de haut |
| Villes | Clarifier le niveau géographique de la sélection | Villes subdivisées : introduction puis choix des quartiers ; quatre univers dans les quartiers et les villes sans subdivision |
| Villes et quartiers | Onglets fins, état actif peu marqué, libellés à 11–12 px | Surface légère, indicateur de 3 px, cibles de 52 px, nombres de fiches et défilement horizontal local |
| Collections | Décalage systématique d’une colonne, titres de fiches à 30–44 px, descriptions à 12 px | Grilles régulières, images 3:2, titres sans-serif à 20 px, description à 16 px et invitation « Voir la fiche » |
| Recherche et filtres | Champs réduits à une ligne, texte à 12 px | Fonds identifiables, contour contrasté, hauteur de 48 px, saisie 16 px, focus groupé et filtre « Filtrer par thème » |
| Fiches | Grande marge vide à gauche ; repères après tout le récit ; retour seulement en bas | Colonne pratique indépendante, repères avant le récit sur mobile, raccourci depuis l’introduction, retour contextuel haut et bas |
| Gastronomie | Portrait culinaire peu différencié des autres repères | Bloc « La spécialité en bref » avec origine, nom original, ingrédients et variantes ; titre éditorial conservé |
| États secondaires | Étiquettes, crédits, sources et états vides excessivement petits | Informations secondaires 13–14 px, tags sur surface discrète, état vide lisible, bouton de remise à zéro |

Les principes recherchés sont la hiérarchie, la cohérence des composants, des actions explicites et une lecture confortable. Les [Human Interface Guidelines — Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) et [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) sont les références proposées par le brief. Leurs pages publiques nécessitaient JavaScript lors de la consultation ; ce travail ne revendique pas un audit de conformité Apple.

## Tokens et conventions

Source unique : `src/app/tokens.css`. Les polices locales sont déclarées dans `src/app/layout.tsx` via `next/font/local` ; aucune police distante ni nouveau kit UI.

| Rôle | Token / convention |
| --- | --- |
| Texte principal / secondaire / discret | `--color-text-primary`, `--color-text-secondary`, `--color-text-subtle` |
| Fonds et surfaces | `--color-background-primary`, `--color-background-secondary`, `--color-surface`, `--color-surface-hover` |
| Bordures | `--color-border` pour les séparateurs ; `--color-control-border` pour les contrôles |
| Actions et clavier | `--color-accent`, `--color-accent-hover`, `--color-on-accent`, `--color-focus` |
| Corps / informations | `--text-body` 1 rem ; `--text-secondary` .875 rem ; `--text-small` .8125 rem |
| Titres | `--text-card` 1.25 rem ; `--text-section` 22–28 px ; `--text-page` 30–40 px ; `--text-editorial` 40–64 px à la taille de texte standard |
| Espaces | `--space-1` à `--space-9` : 4, 8, 12, 16, 24, 32, 48, 64, 80 px ; `--section-space` fluide |
| Largeurs | `--width-page` 1450 px ; `--width-reading` 672 px ; `--page-gutter` responsive |
| Forme | Rayons de 4 et 8 px ; ombre légère réservée au menu |
| Retour visuel | 160 / 240 ms pour les contrôles ; agrandissement photographique discret au survol |

Les aliases historiques `--paper`, `--background`, `--ink`, `--muted`, `--line`, `--accent` pointent vers les tokens sémantiques. Ils permettent aux compositions existantes de suivre la même palette.

### Primitives

- `.section-shell` : marge commune et largeur maximale, sans ajouter de composant React vide.
- `.section-heading` : titre de section, avec présentation éditoriale sur l’accueil et fonctionnelle dans les pages intérieures.
- `.button.button-primary` : action principale, fond vert profond et texte ivoire.
- `.button.button-secondary` : action pratique ou remise à zéro, contour visible.
- `.button.button-quiet` : variante textuelle disponible ; `TextLink` conserve la signature du lien souligné avec flèche.
- `.discovery-tags` : informations non interactives ; ne pas leur donner de comportement de bouton.
- `PracticalInformation` : trois repères remplis au maximum, présentés dans une liste compacte de libellés et valeurs.

Un bouton déclenche une action ; un lien possède une destination réelle. Garder les sémantiques natives et ne pas transformer les cartes en `div` cliquables. Les liens de fiches ont un nom accessible court contenant le titre visible. Les variantes de bouton comportent des états de survol, focus et désactivation ; aucun bouton désactivé artificiel n’a été ajouté.

## Ajustement : fiches sur un écran

La demande de simplification qui suit l’étape 04 remplace la présentation longue des fiches décrite dans l’audit ci-dessus. Les quatre univers utilisent désormais `discovery-sheet` : résumé et informations essentielles à gauche, une seule photographie à droite. Aucun contenu ni pied de page ne suit cette composition.

Le retour contextuel, le titre, la localisation, un paragraphe court et trois repères au maximum suffisent à présenter la découverte. Les associations (spécialités, restaurants, lieu d’une activité) restent accessibles sous forme de liens. Les variantes culinaires, récits, galeries, recommandations et listes de sources ne sont plus affichés. Les contenus complets restent dans le catalogue ; une source externe reste accessible. Les crédits de la photo et les précisions signalant une image d’illustration restent dans la colonne de droite.

Sur ordinateur, le cadre photographique utilise la hauteur du viewport moins l’en-tête et les marges. Les espacements sont réduits sur les fenêtres de moins de 761 px de haut. Aucun contenu textuel n’est coupé et aucun défilement interne n’est imposé : une fenêtre très basse ou un texte agrandi peut donc laisser défiler légèrement la page. Sur mobile, informations puis photo s’empilent naturellement. Le rendu réel de ces dimensions reste à vérifier dans un navigateur autorisé.

## Responsive et interactions

Les composants intérieurs passent à une colonne sous 761 px. Les fiches compactes placent toutes les informations avant la photographie dans le DOM et sur mobile. La barre d’onglets possède son propre défilement horizontal et conserve flèches gauche/droite, Début/Fin, Espace/Entrée, liens partageables et historique existants. Les compteurs ne remplacent pas le libellé des onglets.

L’accueil garde une hauteur minimale de 100dvh ; sa hauteur reste libre lorsque le contenu ou une fenêtre basse exige davantage de place. Le portrait mobile reste en 2:3. La galerie suit le titre et la description sur mobile, au lieu de comprimer ces textes dans une colonne à côté de trois petites vignettes. Les quatre univers de l’accueil passent en une colonne lisible sur téléphone.

Les focus sont visibles ; les interactions principales visent 44 px ou plus. Les crédits et liens inclus dans des paragraphes gardent leur forme textuelle. `prefers-reduced-motion` supprime animations et transitions. Le menu utilise toujours le dialogue natif, le retour de focus et la fermeture par Échap existants.

## Vérification et limites

`npm run test:contrast` calcule le contraste de 26 combinaisons réellement utilisées dans les surfaces fonctionnelles : au moins **4,68:1 pour le texte**, **3,17:1 pour le focus et les contours de contrôles**. Il ne s’agit pas d’une certification WCAG de l’application entière ; les bordures purement décoratives ne sont pas soumises à ce seuil de contrôle.

Les tests TypeScript, ESLint, unitaires, build et parcours HTTP sont consignés dans `VALIDATION.md`. Les données, relations, routes, redirections et synchronisation des onglets sont conservées.

L’accès au site local par l’outil navigateur ayant été bloqué, aucune capture après modification ni mesure réelle des débordements, du zoom à 200 %, du focus ou de l’historique après hydratation n’est revendiquée. Une revue manuelle autorisée doit couvrir accueil, Japon, Tokyo, Asakusa, Fujiyoshida, tonkatsu et une adresse, aux largeurs 320, 390, 768 et 1440 px, ainsi que le menu, la recherche, les quatre onglets, les retours et la préférence de mouvement réduit.
