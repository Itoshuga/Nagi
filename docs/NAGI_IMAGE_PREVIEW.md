# Prévisualisation photographique — phase 4.7.5.1

La recherche utilise maintenant le [mode économique : dix images et un seul appel initial par lieu](./NAGI_IMAGE_ECONOMY.md). Les anciennes galeries restent disponibles sans nouvelle indexation.

Livré le 24 novembre 2026. Le mode de développement permet aux administrateurs de voir et choisir les références Serper techniquement disponibles, indépendamment de leurs droits renseignés. Il réutilise le résolveur, la galerie, les caches et les composants existants.

## Activation

Le `.env` racine contient maintenant :

```env
NAGI_IMAGE_PREVIEW_UNVERIFIED=true
```

Redémarrer `pnpm dev` s’il était déjà lancé : les variables racine sont chargées au démarrage par le script existant. `.env.example` documente le flag avec une valeur par défaut `false`.

Le serveur exige simultanément `NODE_ENV=development`, ce flag à `true` et le rôle administrateur Nagi. En production et en test, le mode est refusé même si le flag vaut `true`. Aucun paramètre d’URL, corps de requête, en-tête ou variable navigateur ne remplace ces contrôles.

## Utilisation

1. Ouvrir les paramètres ou les détails d’un lieu, puis **Modifier la photo**.
2. Parcourir et filtrer les références enregistrées. La pagination monte toujours 24 miniatures à la fois.
3. Cliquer une image pour l’agrandir. Une licence absente, un auteur absent et un statut `unknown` ne désactivent plus **Choisir** dans cet aperçu.
4. Confirmer pour afficher la couverture de développement. Le choix est enregistré pour cet administrateur et cette ressource ou occurrence, et retrouvé au prochain chargement.
5. **Couverture publiée** rétablit l’affichage de la couverture officielle sans modifier sa sélection. **Choix automatique** et **Utiliser le pictogramme** restent disponibles dans le contexte privé.

Le formulaire de vérification des droits n’est pas nécessaire dans ce mode. La source, les droits réellement renseignés et les crédits restent consultables. Une image n’est pas présentée comme CC0 ou autorisée parce qu’elle a été prévisualisée.

Une couverture importée ou choisie officiellement garde la priorité sur les suggestions automatiques. Un choix explicite d’aperçu peut la remplacer uniquement dans l’affichage privé de l’administrateur. Une sélection privée manuelle conserve sa priorité sur de nouvelles suggestions.

## Persistance et séparation de la publication

Aucune nouvelle table. La table privée existante `image_galleries` reçoit une colonne `development_previews` JSONB. Chaque choix est indexé par administrateur et occurrence éventuelle et contient `mode`, identifiant de photographie, `revision`, `selected_by` et `selected_at`.

Les URL et métadonnées restent dans `image_candidates`. Les images libres déjà présentes en fallback peuvent aussi être choisies en aperçu, si elles sont associées à cette même galerie. Un identifiant de photo d’un autre lieu n’est pas accepté.

La RPC `set_image_preview` est exécutable uniquement par `service_role`. La route vérifie d’abord le mode, l’administrateur et l’accès au lieu ou au voyage ; la fonction SQL vérifie à nouveau le rôle de l’acteur, l’appartenance de l’image à la galerie et la révision. Les conflits entre onglets rafraîchissent la sélection privée.

Une sélection d’aperçu ne crée aucune ligne dans `external_images` ou `place_image_assignments`, ne change aucun droit dans `image_candidates` et n’effectue aucune mutation du planning. Les choix publics et leurs synchronisations existantes sont conservés. Le changement de compte recrée les sessions d’images de l’espace et de l’administration ; les aperçus en mémoire ne sont pas partagés entre comptes.

En production, les lectures ignorent ces choix privés et les références non vérifiées restent exclues des couvertures publiques. Les contrôles de publication et les RLS existants ne sont pas assouplis. Désactiver le flag retrouve également le comportement habituel sans supprimer les choix de développement.

## Affichage et disponibilité

- La découverte Serper et les caches existants sont réutilisés. Une galerie enregistrée ne relance pas Serper pour une ouverture, un filtre, une page ou un changement de couverture.
- L’aperçu automatique consulte jusqu’à six candidates déjà en cache. Il ne filtre pas selon une licence, une attribution ou une date de vérification absente. Une exclusion explicite est respectée pour les suggestions automatiques ; les références restent consultables dans la galerie.
- En développement administrateur, l’indexation ne bloque pas sur la vérification Commons avant de rendre ses résultats.
- La grille charge les miniatures. Seul l’aperçu agrandi ou le détail sélectionné utilise l’original ; son échec déclenche la miniature, puis une autre candidate disponible dans les cards ou le pictogramme. Un original défaillant dont la miniature fonctionne n’est pas marqué globalement indisponible.
- Les nouveaux aperçus conservent le type explicite `development-preview` et le statut de droits réel. Ils ne deviennent pas des photographies publiables.
- Les tailles, ratios et styles des cards sont conservés. Aucun proxy d’image arbitraire, aucune wildcard de domaine Next Image, aucun téléchargement de fichiers originaux dans Storage.
- Les fallbacks restent Wikidata, Wikimedia Commons, Openverse et le pictogramme Nagi. Aucun appel photographique Mapbox, Foursquare, Pexels ou Unsplash n’est ajouté.

## Migrations appliquées avec le CLI

Projet Nagi lié : `ynstekndjombxnvjtznt`.

- `20261124140000_development_image_previews.sql` : colonne privée et RPC de sélection d’aperçu.
- `20261124141000_development_preview_fallbacks.sql` : prise en charge des photographies libres déjà associées à la galerie dans la même sélection privée.

Application via `npx --yes supabase@latest db push --remote --yes`. Les snapshots avant/après confirment la conservation de toutes les lignes et valeurs des 12 tables vérifiées, dont les voyages, activités, arrêts, médias, images externes et sélections publiques. Les rapports privés se trouvent dans `artifacts/serper-migration/preview-*.json`, ignorés par Git.

## Vérifications

- **613 tests passent dans 44 fichiers**, dont les cas de Kamakura, Tokyo, Kyoto, Shibuya, Sensō-ji, Shibuya Parco et Pokémon Center SHIBUYA sans licence ni date de vérification.
- Tests PostgreSQL : choix inconnu conservé sans publication, lecture directe interdite, RPC refusée aux utilisateurs et aux administrateurs authentifiés sans rôle serveur, contrôle de galerie, choix par administrateur/occurrence, conflits de révision, fallback libre associé à la galerie.
- Tests de session : aperçu optimiste avec sa propre mutation, restauration après rechargement de la session, retour arrière sur refus, aucune opération d’indexation ou de sélection publique.
- Tests serveur : refus en production et en test malgré le flag, refus aux non-administrateurs, photographie Serper inconnue prioritaire sur un fallback automatique, couverture importée conservée tant qu’aucun aperçu manuel n’est choisi.
- Navigateur réel, données et fournisseurs simulés : galerie de 80 références, pagination et filtre, choix sans vérification, original réellement défaillant remplacé par sa miniature, crédits avec statut réel, retour à la couverture publiée et absence de mutation publique/planning. Le parcours normal conserve son refus de publication sans vérification. Les parcours carte, calendrier, glisser-déposer et les captures mobiles restent vérifiés.
- Contrôle réel Supabase : les **100 références Tokyo** existantes sont réutilisées, 24 retournées par page de galerie et six candidates proposées en aperçu. Les images inconnues sont disponibles en développement administrateur ; le mode est refusé en production et au non-administrateur. Aucune sélection réelle n’a été changée par ce contrôle.
- **Zéro nouvel appel Serper et zéro crédit supplémentaire** pour cette phase de validation réelle. Les recherches réelles de la phase précédente sont réutilisées, sans prétendre avoir relancé une recherche pour chaque lieu.
- TypeScript, ESLint, formatage, types SQL et build de production vérifiés avec le flag local activé. Sortie de build isolée dans `.next/preview-images-qa`, sans arrêter le serveur de développement.

Le contrôle de cache réel peut être reproduit sans requête Serper :

```sh
NAGI_IMAGE_LIVE_QA=1 node scripts/qa/images/serper.mjs --preview-cached
```

Le parcours navigateur privé s’exécute avec `NAGI_PREVIEW_UI_QA=1` sur le harness existant. Les images des captures sont synthétiques ; les contrôles réseau Supabase portent sur les références réelles enregistrées.

## Fichiers concernés

`features/images/{config,model,preview,server,discovery,route,session,components,gallery}`, le composant partagé `features/media/image.tsx`, son utilisation dans `features/integrations/mapbox/place-image.tsx`, les providers de session des layouts application/administration, les deux migrations, les types PostgreSQL générés, `.env.example`, les tests image/base/navigateur et le script d’audit Serper.

Les services géographiques Mapbox, le calendrier et le modèle du planificateur ne sont pas modifiés par cette phase.
