# Composer un voyage depuis le catalogue

Depuis la phase 4.9, un seul bouton `[Compass] Ajouter une étape` ouvre directement le panneau existant « Explorer le catalogue ». La boussole indépendante et le sélecteur modal d’étapes sont retirés. Les boutons de journée ouvrent ce même panneau sur leur journée ; le bouton global utilise la journée active. Sans journée active, le sélecteur intégré « Ajouter à » permet de choisir une journée ou « À organiser ».

Le panneau « Explorer le catalogue » conserve sa recherche, ses filtres et ses suggestions. Sur ordinateur, la carte entière se saisit après 6 px de déplacement. Un clic ouvre toujours l’aperçu. La carte originale reste dans la liste ; l’aperçu flottant est rendu dans le document, au-dessus des conteneurs défilants.

Sur chaque carte Nagi ou Mapbox, le bouton `+` ajoute directement une occurrence à la destination indiquée dans le panneau, sans formulaire intermédiaire. Une coche confirme brièvement l’ajout ; l’étape apparaît immédiatement et reçoit une légère mise en évidence. Le panneau reste ouvert pour les ajouts suivants, avec la recherche et les filtres conservés, y compris lors d’un changement de journée. Une nouvelle occurrence garde ses horaires, notes et couleurs indépendants, même pour un lieu déjà présent.

Le dépôt crée une visite indépendante :

- Dans la timeline : journée et position explicites, sans horaire inventé. Les visites programmées restent chronologiques ; les visites sans horaire conservent leur position avant la prochaine visite programmée.
- Sur une journée de la sidebar : ajout en fin de journée, sans changer la sélection. « À organiser » est une destination facultative.
- Dans la section des arrêts : ajout imbriqué, uniquement sur une destination explicite. Un survol de 550 ms peut ouvrir temporairement les arrêts repliés. La durée du parent ne change pas.
- Dans la grille du calendrier : heure sous le pointeur, arrondie à 15 minutes. L’aperçu affiche le début et la fin. Les chevauchements existants restent possibles.
- Dans le calendrier Séjour ou une vue sans grille : association à la journée, sans horaire.

La durée initiale d’un créneau glissé dans le calendrier utilise un champ du catalogue qui indique explicitement une durée de visite avec une unité exploitable : par exemple `duree-visite` contenant `1 h 30`, ou `visit-duration-minutes` contenant un nombre de minutes. Les plages horaires, fourchettes et nombres sans unité ne sont pas interprétés. Sans cette information, le défaut de glisser-déposer est de 30 minutes. La préférence se règle dans les filtres du catalogue et reste locale au navigateur ; elle ne représente pas une durée officielle. À la fin de la journée, seule la nouvelle visite est raccourcie pour rester dans la journée. Un ajout rapide par clic conserve une durée inconnue à `null` et ne crée pas d’horaire, sauf si le point d’insertion fournit déjà une heure. Les détails restent modifiables depuis l’étape.

Sur mobile et au clavier, le bouton `+` est également disponible. Entrée depuis la recherche Nagi ajoute le résultat actif à la destination du panneau ; Entrée dans la recherche Mapbox conserve la recherche géographique explicite. Le menu facultatif `…`, le clic droit ou Maj+F10 permettent de choisir une autre journée, un horaire ou une activité parent. Le défilement tactile est conservé ; le glissement tactile nécessite un maintien de 250 ms. La mention de découverte disparaît après le premier dépôt accepté. Le bouton global conserve son libellé sur mobile, référence le panneau par `aria-controls` et reflète son état avec `aria-expanded`. L’ouverture place le focus dans la recherche ; Échap ou la fermeture le rendent au déclencheur.

## Mutations, sécurité et modèle

`catalogVisitChange` centralise les créations depuis le panneau. Chaque geste génère un UUID d’occurrence. La file optimiste existante conserve cet UUID et l’identifiant de mutation lors des reprises réseau. Une visite existante conserve son identité lorsqu’on la déplace. Aucune écriture n’a lieu pendant le glissement ; les résultats du catalogue ne sont pas rechargés après une création.

Les ajouts rapides et les arrêts utilisent cette même file et les mêmes contrôles, sans nouvelle persistance ni migration SQL. Le mode consultation garde le catalogue accessible sans bouton d’ajout ni glisser-déposer. Les autres formulaires utiles, notamment l’édition d’étape et les ajouts depuis une fiche hors du planificateur, restent disponibles.

Les commandes `add_item` et `add_stop` acceptent une ancre `before` facultative. L’insertion et la position sont sauvegardées dans la même transaction et le même événement différentiel. Le paramètre historique `repeat` reste accepté pour les anciens clients, mais ne conditionne plus la création. Il n’existe aucune unicité par fiche/journée ou fiche/voyage. Les contrôles de serveur Discord, permissions, portée du voyage, visibilité du catalogue, topologie et reçus d’idempotence restent actifs.

La migration `20261120160000_catalog_visit_insertion.sql` remplace seulement les branches concernées des fonctions existantes, avec vérification préalable de leur définition. Elle ne réécrit ni ne supprime les voyages ou visites existants. Les répétitions sont également autorisées dans les arrêts et lors du déplacement d’une occurrence dans une activité contenant déjà la même référence ; l’auto-imbrication d’une occurrence reste interdite.

Les destinations sont filtrées par la surface réellement visible sous le pointeur. La position native au relâchement évite de réutiliser une ancienne destination après un mouvement rapide hors de la zone. Les changements de hauteur des destinations d’arrêt déclenchent un recalcul des rectangles via `ResizeObserver`, uniquement pendant un glissement depuis le catalogue.

## Vérification reproductible

Les tests Vitest couvrent les positions exactes, les répétitions indépendantes, les durées, la file non bloquante, les reçus rejoués après suppression et les permissions SQL. La recette navigateur utilise des comptes fictifs, les vrais handlers HTTP/SSE et une base PostgreSQL locale avec toutes les migrations ; seul le transport Phoenix est simulé.

```sh
pnpm build
NAGI_QA_OUTPUT=/tmp/nagi-catalog-qa node scripts/qa/trips/server.mjs
```

Dans un autre terminal, après démarrage du serveur :

```sh
python3 scripts/qa/trips/catalog.py --output /tmp/nagi-catalog-qa
```

Redémarrer le serveur avant chaque nouvelle exécution pour réinitialiser les données de test. Les captures et résultats sont écrits dans le répertoire de sortie, sans utiliser les comptes ou voyages réels.

### Validation de la phase 4.9 — 25 novembre 2026

- 661 tests dans 50 fichiers, TypeScript, ESLint, formatage et build web validés. Le build isolé utilise `.next/catalog-unified-qa`.
- `catalog.py` : 16 scénarios avec PostgreSQL/RPC/RLS réels et deux comptes fictifs, dont insertion précise, occurrences répétées, journée cible, filtres conservés, arrêts, calendrier, consultation et focus mobile. Ajout rapide mesuré à 5 ms avant une sauvegarde retardée de 1 500 ms.
- `crud.py` : création affichée en 14 ms avec 2 000 ms de latence de sauvegarde, puis édition persistée des notes et horaires, suppression et affichage mobile, sans erreur navigateur.
- `mapbox-places.mjs` : composants réels et transport Mapbox simulé, parcours standard et aperçu privé sous React StrictMode, sans erreur d’exécution. Aucun appel fournisseur payant n’est nécessaire à ces scénarios.
