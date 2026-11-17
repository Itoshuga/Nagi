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
