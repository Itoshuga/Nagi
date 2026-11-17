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
