# Une photo de couverture par fiche

Les formulaires Pays, Villes, Quartiers, Tourisme, Activités, Gastronomie et
Adresses utilisent le même composant `CoverUpload`.

1. « Upload une photo » ouvre le sélecteur de fichiers de l’appareil.
2. La photo choisie apparaît immédiatement dans le formulaire, via une URL Blob
   locale. Cette sélection ne déclenche aucune requête d’upload.
3. « Enregistrer » valide d’abord les champs du formulaire, puis envoie la photo
   dans Firebase Storage. Une progression et un indicateur de chargement sont
   affichés pendant cette sauvegarde.
4. Après validation du fichier par le serveur, la référence `coverPhoto` est
   enregistrée avec la fiche dans Firestore. Elle devient sa couverture publique.

Le même bouton remplace une couverture. Il n’y a ni galerie, ni bibliothèque,
ni recadrage, ni champs de description photographique, ni gestion de fichiers.
Les éventuels tags éditoriaux des découvertes restent indépendants des photos.

## Formats et sauvegarde

Seuls JPEG, PNG et WebP fixes sont acceptés, avec vérification du format réel
côté serveur. AVIF, GIF, SVG, PDF et fichiers corrompus sont refusés. La limite
`NAGI_PHOTO_MAX_BYTES`, uniquement serveur, vaut **5 000 000 octets** par défaut.
Elle est définie dans `.env` et illustrée dans `.env.example`.

Le traitement existant corrige l’orientation, retire les métadonnées EXIF et
produit une seule image WebP, sans miniature supplémentaire. Le côté maximal
est de 2 400 pixels. Ce traitement technique n’expose aucun éditeur d’image.

La fiche n’est modifiée qu’après réussite de l’envoi et de la transaction
Firestore. Une erreur de transfert, de validation ou un conflit de version
conserve l’ancienne couverture. Si le transfert a réussi mais que la sauvegarde
échoue, le formulaire réutilise son résultat au prochain essai pour éviter un
nouvel envoi du même fichier.

`coverPhoto` est la seule nouvelle référence modifiable. Les anciens champs
`coverImage`, `photos`, `images` et leurs métadonnées restent conservés pour
éviter une migration destructive. Les anciennes couvertures locales et Storage
continuent à fonctionner, y compris leur position historique. Les anciennes
listes d’images ne sont plus affichées ni éditables et l’API refuse leur ajout.
Un nouvel upload utilise une position centrée, sans réglage de cadrage.

## Firebase et affichage public

La session serveur existante, le rôle administrateur actuel, l’origine et le
jeton CSRF sont vérifiés avant chaque opération. Le serveur émet au moment de
la sauvegarde un formulaire POST signé limité au fichier temporaire, au format,
à la taille et à dix minutes. Le binaire va directement dans Storage, sans
Server Action ni limite du corps Vercel. L’émulateur utilise un PUT local protégé.

Les images sont affichées avec `next/image`. Les images Storage déjà optimisées
passent par une route serveur sans cache, qui vérifie la publication de la
fiche et de ses parents. Les brouillons restent privés. Aucun jeton Firebase
persistant de téléchargement n’est créé. L’optimiseur Next reste utilisé pour
les fichiers locaux et refuse les URL des couvertures protégées.

Le registre interne des fichiers et le nettoyage existant protègent les anciens
fichiers pendant la sauvegarde et récupèrent les envois échoués. Aucun écran
n’expose ce mécanisme. Les fichiers retirés sont conservés pendant 24 heures,
puis le nettoyage vérifie leurs références avant de les supprimer. Les anciennes
références historiques ne sont pas purgées automatiquement.

Avant un déploiement réel :

- Utiliser le bon bucket privé, sans accès IAM public, et les droits objets du
  compte serveur. La configuration Firebase serveur reste dans l’environnement.
- Adapter les domaines de `storage.cors.example.json` aux origines exactes de
  l’administration, puis appliquer CORS au bucket.
- Déployer les règles et index de `firebase.json`. Les SDK clients n’ont aucun
  accès direct aux fichiers ou au registre interne.
- Fusionner `storage.lifecycle.json` avec les éventuelles règles existantes :
  cette règle supprime seulement les originaux `temporary/` après deux jours.
- Conserver la configuration existante du nettoyage quotidien Vercel et son
  `CRON_SECRET` serveur. Le CLI `photos:cleanup` propose toujours une simulation
  par défaut, avec `--apply --confirm-project=...` pour effectuer un nettoyage.
- Activer `NAGI_GEOGRAPHY_SOURCE=firestore` et `NAGI_CONTENT_SOURCE=firestore`
  après validation des imports pour que le site présente les fiches administrées.
  En mode `static`, le carnet public de démonstration reste affiché.

Aucun réglage distant ni déploiement Firebase n’est effectué par les tests.

## Vérifications

`npm run test:photos` vérifie les sept types, la publication, les remplacements,
la conservation de l’ancienne couverture en cas d’échec ou de conflit, les
anciens formats, les permissions, les trois formats admis, le rejet d’AVIF,
les tailles, le refus des galeries/cadrages dans les nouvelles écritures et la
reprise d’un traitement interrompu. Cette suite ne contacte que `demo-nagi` et
les émulateurs. Le POST signé est vérifié hors ligne avec une clé de test jetable.
Le transfert et CORS du bucket réel restent à vérifier après sa configuration.

Les autres vérifications sont `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`, `npm run test:geography`, `npm run test:contents` et
`npm run test:firebase-rules`. La vérification navigateur contrôle notamment
que la sélection reste locale jusqu’à l’enregistrement.
