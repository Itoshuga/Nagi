# Validation automatique des photos Serper

Depuis le 25 novembre 2026, les photos Serper sont directement utilisables dans Nagi. Elles portent le statut **Validée automatiquement** (`auto_approved`). Aucun formulaire de vérification n’est nécessaire pour les sélectionner.

La migration `20261125130000_automatic_serper_approval.sql` rend utilisables les références déjà stockées et installe un déclencheur pour les prochaines découvertes. Les sources, auteurs et licences renseignés sont conservés. Les licences ouvertes et autorisations déjà documentées gardent leur statut. Une validation automatique est un choix de fonctionnement du projet ; elle ne crée aucune licence ni preuve d’autorisation fictive. Les crédits indiquent « Non renseignée par la source » lorsque la licence est inconnue.

Les photos explicitement exclues ou dont l’URL est indisponible restent non sélectionnables. Leurs références sont conservées. Les couvertures choisies et les données des voyages ne sont pas modifiées.

La bibliothèque reste limitée à dix choix, issus d’une seule requête Serper par lieu. La migration et la réouverture d’une galerie utilisent uniquement la base de données. Aucun rechargement payant n’est ajouté. La vérification Commons après découverte est supprimée ; les sources déjà documentées restent conservées.

L’ancien aperçu privé de développement reste disponible pour des cas explicitement non approuvés. `NAGI_IMAGE_PREVIEW_UNVERIFIED=false` dans le `.env` courant permet aux sélections de porter sur les vraies couvertures. Les règles d’accès administrateur, voyage et occurrence restent inchangées.

## Application et validation

Migration appliquée au projet Supabase lié avec la CLI : **1 497 références validées automatiquement**, trois statuts de licence ouverte conservés. Les 1 500 références restent présentes. Les trois couvertures choisies, les voyages, les galeries et leurs compteurs de crédits sont identiques avant/après. Aucun appel Serper n’a été effectué. Les sauvegardes et le rapport de comparaison sont conservés dans `artifacts/serper-auto-approval/`, ignoré par Git.

Les **666 tests** passent, ainsi que TypeScript, ESLint, la conformité des types PostgreSQL et le build. Les tests couvrent la migration des anciennes références, les exclusions, les URL indisponibles, les sources identiques dans plusieurs galeries, les autorisations documentées conservées et la sélection immédiate sans formulaire. Le parcours navigateur confirme également la limite de dix choix et la réouverture sans recherche payante.

Le `.env` racine étant chargé au démarrage par `dotenv-cli`, redémarrer `pnpm dev` pour désactiver l’ancien aperçu privé dans les processus déjà ouverts.
