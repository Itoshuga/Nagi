# Recette après configuration des services

Ces étapes utilisent de vrais comptes et services. Elles restent à exécuter avec les identifiants du propriétaire du projet.

1. Appliquer la migration, activer uniquement Discord dans Supabase Auth et renseigner `.env`.
2. Lancer `pnpm dev:web`, en laissant le bot arrêté. Vérifier dans SQL Editor qu’une demande `web-startup` est `pending`.
3. Ouvrir `/app` et `/admin` sans session : les deux doivent rediriger vers la connexion. Se connecter via Discord ; vérifier le retour à `/app`, le profil et l’ID Discord numérique enregistré.
4. Avec un compte `user`, ouvrir `/admin/categories` : retour à `/app` avec le message d’accès réservé. Tenter un update de rôle depuis le client Supabase public doit être refusé.
5. Configurer l’ID du propriétaire dans les deux environnements, redémarrer les processus et se reconnecter. Vérifier `/admin` et ses indicateurs réels.
6. Lancer `pnpm dev:bot`. La demande en attente doit passer à `succeeded` et le heartbeat apparaître. Exécuter `/ping`, `/help`, `/status` avec le propriétaire ; `/status` doit être refusé pour un compte Nagi standard.
7. Ajouter une catégorie depuis `/admin/categories`. Vérifier la ligne dans Supabase ; une lecture via `listCategories` côté bot utilise les mêmes données.
8. Ajouter un module de commande valide ; demander une synchronisation. Vérifier sa présence Discord. Modifier ses options puis resynchroniser. Une nouvelle synchronisation sans changement doit journaliser `changed: false`.
9. Passer cette commande en maintenance : elle reste déployée et renvoie l’embed éphémère de maintenance. La désactiver : elle disparaît du registre distant. Supprimer son fichier : elle ne doit pas réapparaître.
10. Introduire une commande invalide ou un nom en double : la synchronisation échoue et le registre distant reste intact. Corriger, puis demander une nouvelle synchronisation.
11. Démarrer un second bot avec le même scope : il doit attendre le lease et ne pas se connecter. Arrêter le premier ; le second doit reprendre le travail.
12. Arrêter le bot. Après 45 secondes, le dashboard ne doit plus afficher « En ligne » ; après 90 secondes, il doit afficher « Hors ligne ». Demander une synchronisation, redémarrer le bot et vérifier le traitement de la demande conservée.
13. Vérifier la déconnexion, le rafraîchissement de session, le refus d’une URL `next` externe et les rendus mobile/clavier avec le compte connecté.

Aucune de ces étapes ne demande de coller des secrets dans un fichier versionné, une issue ou les journaux.

## Catalogue mondial

1. Se connecter via Discord comme administrateur global. Créer un pays, une ville sans quartiers, une ville avec quartiers et un quartier. Les publier depuis l’administration.
2. Dans Catégories, modifier Gastronomie, ajouter un champ à choix multiple et modifier l’ordre des catégories avec le clavier puis par glisser-déposer.
3. Créer une fiche Tonkatsu dans le quartier, puis une adresse dans la ville sans quartiers. Vérifier le résumé, la prévisualisation du texte enrichi et le formulaire propre à chaque catégorie.
4. Ajouter deux photos, modifier leurs textes alternatifs, déplacer la seconde en première position, puis tester la couverture explicite, le remplacement et le retrait.
5. Relier les fiches avec « Servi chez », les publier et ouvrir Découvrir avec un compte ordinaire. Rechercher Tonkatsu par titre et suivre le lien dans les deux sens. Changer de serveur Discord et vérifier que le catalogue mondial est identique et que le nouveau serveur est conservé dans les liens.
6. Dépublier l’adresse et vérifier que le compte ordinaire ne voit plus sa page, sa couverture ni sa recommandation. Désactiver Gastronomie et vérifier le même comportement pour Tonkatsu. Vérifier que l’administrateur peut toujours consulter le brouillon et que l’accès direct au bucket reste refusé pour un compte ordinaire.
7. Réaffecter une catégorie à une catégorie dont les champs sont compatibles. Vérifier que la fiche garde son identifiant, ses images et ses relations. Contrôler ensuite qu’un voyage existant référencé continue de s’ouvrir.

## Planificateur de voyages

1. Appliquer la migration `202611170006_trip_planner.sql` puis ouvrir le même serveur avec deux comptes Discord autorisés. Préparer un troisième compte sur un autre serveur pour les vérifications d’accès.
2. Créer un voyage au Japon sur trois jours avec une couverture JPEG. Vérifier la suggestion `Asia/Tokyo`, les trois journées et le chargement de la couverture. Créer aussi un voyage sans dates et réordonner deux journées numérotées.
3. Ouvrir une fiche publiée du catalogue et l’ajouter au premier jour. Ajouter une deuxième fiche dans **À organiser** depuis l’itinéraire. Essayer un doublon sur le même jour, vérifier l’avertissement et confirmer une répétition volontaire.
4. Déplacer une étape au toucher ou à la souris, puis utiliser **Déplacer vers** et les boutons clavier. Renseigner les notes, les heures et une durée. Vérifier que l’autre compte reçoit les changements sans rechargement manuel. Modifier la même étape dans deux onglets et vérifier le conflit.
5. Réduire les dates du séjour. Ouvrir la journée devenue hors période, puis la supprimer en déplaçant ses étapes vers **À organiser**. Vérifier la conservation des notes et horaires.
6. Afficher le calendrier avec deux horaires qui se chevauchent. Sur la carte, vérifier les lieux de plusieurs villes, le filtre de journée et la liste des étapes sans coordonnées.
7. Passer le voyage en mode organisateurs uniquement. Contrôler l’accès en lecture pour l’autre membre et le refus des écritures. Vérifier que le troisième compte ne peut ouvrir ni le voyage ni sa couverture en utilisant directement leurs URL.

## Profils sociaux — Phase 4.5

1. Appliquer `202611180003_social_profiles.sql`. Vérifier le bucket privé `profile-banners`, sans politique globale autorisant sa lecture. Utiliser deux comptes partageant un serveur où Nagi est présent et un troisième compte sans serveur commun.
2. Ouvrir **Mon profil** depuis le menu : l’URL doit être `/app/profile/@username`. Vérifier l’identité Discord, la date réelle d’inscription Nagi et le header global. Les paramètres du compte doivent ouvrir une page distincte.
3. Modifier le titre et la biographie, y compris emojis et sauts de ligne. Vérifier le feedback et le refus de `https://example.com`, `www.example.com`, `example.fr`, `discord.gg/test`, `mailto:test@example.fr`, HTML, Markdown et mentions `<@123456789012345678>`. Une requête directe vers le service ne doit pas contourner la validation.
4. Importer un JPEG, PNG ou WebP, puis ajuster les deux axes de recadrage. Remplacer la bannière, l’enregistrer et la retirer. Vérifier le rendu desktop/mobile et l’aperçu avant enregistrement. Un fichier déguisé, animé ou dépassant 5 Mio doit être refusé. L’ancienne version ne doit plus être servie par la route privée.
5. Choisir une couleur puis un pays ou une ville publiés. Dépublier ensuite la destination depuis l’administration : son nom et sa couverture ne doivent plus être affichés sur le profil. Annuler une édition ne doit rien enregistrer. Couper le réseau pendant une sauvegarde : la modale et ses saisies restent ouvertes. Deux onglets concurrents doivent produire un conflit lisible.
6. Vérifier les liens de profils du créateur, des organisateurs et des auteurs d’ajouts dans les voyages. Le deuxième compte doit pouvoir ouvrir le profil et voir uniquement les serveurs communs et voyages dont il est autorisé à lire le contenu. Le troisième compte doit obtenir un refus, y compris sur une URL de bannière connue. Vérifier aussi le refus sans connexion.
7. Avec un compte simplement membre du serveur, vérifier qu’aucun voyage organisé par un autre membre n’est attribué à son profil. Les pays/villes/lieux visités ne doivent pas être inventés à partir de l’itinéraire. L’onglet Voyages charge au plus 12 cartes par page.
8. Renommer le compte dans Discord ; après actualisation de l’identité (au plus toutes les cinq minutes sur un profil consulté), vérifier le nouveau lien et la redirection de l’ancien. Se reconnecter via Discord et vérifier que titre, bio, couleur, bannière et destination sont conservés.
9. Quitter le dernier serveur commun ou retirer le bot, puis actualiser le profil et sa bannière après expiration des attestations. L’accès du visiteur doit être refusé ; l’utilisateur conserve l’accès à son propre profil même en cas de panne Discord.
10. Vérifier l’éditeur au clavier, le focus des modales, la confirmation de réinitialisation, les dimensions 320/390 px et desktop, le mode sombre et `prefers-reduced-motion`.

## Relations sémantiques

1. Sauvegarder les types et associations existants puis appliquer `20261119140000_semantic_relations.sql`. Vérifier la conservation de leurs IDs, clés et métadonnées. Ne pas fusionner automatiquement des liens orientés opposés de signification ambiguë.
2. Dans **Relations**, créer un type « Se situe dans / Abrite », hiérarchique. Vérifier les deux lectures dans la modale, puis essayer un type symétrique, une description et une icône. Modifier les libellés et l’ordre ; la clé reste permanente.
3. Depuis Pokémon Center SHIBUYA, ouvrir **Ajouter une relation**, choisir « Se situe dans », chercher Shibuya PARCO et lire les deux prévisualisations. Créer le lien puis vérifier « Abrite » sur PARCO, dans l’administration et côté utilisateur.
4. Depuis PARCO, essayer de créer « Abrite » vers Pokémon Center : le doublon doit être refusé. Vérifier qu’un autre type entre les mêmes fiches reste possible et qu’une relation symétrique n’est proposée qu’une fois.
5. Modifier le lien depuis PARCO, inverser le sens et remplacer la fiche associée. Vérifier que l’ID est conservé et que l’ancienne fiche n’affiche plus le lien, y compris après avoir préalablement consulté sa page mise en cache. Supprimer depuis l’une puis depuis l’autre extrémité dans deux essais distincts.
6. Rechercher des fiches d’une autre catégorie et d’un autre pays. Vérifier les pages de 12 résultats, les filtres et la sélection au clavier. La fiche actuelle ne doit jamais apparaître. Un brouillon peut être sélectionné dans l’administration.
7. Désactiver un type utilisé : ses liens existants restent lisibles et les nouvelles créations sont refusées, y compris via un appel direct. Ouvrir sa suppression : les dépendances et types compatibles doivent être affichés. Essayer une réaffectation valide, puis une qui produirait un doublon ou un cycle ; cette dernière doit tout annuler.
8. Tester A → B → C → A pour un type hiérarchique : refus. La même boucle avec un type non hiérarchique doit être autorisée. Tester une autorelation, une référence inexistante et deux modifications concurrentes du même lien.
9. Dépublier une fiche associée, sa destination ou désactiver sa catégorie. Un membre ordinaire ne doit voir ni cette carte ni une section vide ; l’administration conserve la relation. Les comptes non administrateurs ne peuvent pas créer, modifier ou supprimer des liens ou leurs types.
10. Vérifier les modales à 320/390 px et sur desktop, en clair/sombre, au clavier et avec réduction des animations. Une erreur conserve la sélection et laisse la modale ouverte ; les boutons restent accessibles pendant le défilement.
