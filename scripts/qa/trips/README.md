# Recette locale du planificateur

Ce banc utilise le vrai build Next, les migrations PostgreSQL, les RPC et leurs contrôles RLS dans PGlite. Les identités Discord, Auth et Storage sont fictives. Un adaptateur Phoenix simule uniquement le transport Supabase Realtime : le serveur SSE lit toujours le journal SQL autorisé. Les appels vers un domaine non prévu échouent ; aucune donnée de production n’est modifiée.

Prérequis : dépendances du dépôt, Python avec Playwright et son Chromium (`python3 -m pip install playwright`, puis `python3 -m playwright install chromium`).

```sh
pnpm build
NAGI_QA_OUTPUT=/tmp/nagi-trip-qa node scripts/qa/trips/server.mjs
```

Dans un deuxième terminal :

```sh
python3 scripts/qa/trips/benchmark.py --output /tmp/nagi-trip-qa
```

Le benchmark mesure 20 actions après un échauffement par interaction, avec 500 ms injectées avant la RPC. Des observateurs du DOM horodatent séparément le changement visuel et sa confirmation. Il compte les appels serveur, les réponses `fetch` du navigateur, leurs octets UTF-8 décodés et les relectures complètes du voyage. Les connexions SSE et le polling sont désactivés seulement pour isoler ce coût. Le fichier `benchmark.json` contient les observations et les médianes/p95.

Pour comparer un ancien commit, compiler une copie indépendante de ce commit, puis fournir sa racine au même serveur :

```sh
NAGI_QA_SOURCE_ROOT=/chemin/vers/la/copie NAGI_QA_PORT=3107 NAGI_QA_OUTPUT=/tmp/nagi-trip-before node scripts/qa/trips/server.mjs
python3 scripts/qa/trips/benchmark.py --url http://localhost:3107 --output /tmp/nagi-trip-before --legacy
```

Après un benchmark, redémarrer le serveur pour réinitialiser les données avant chaque recette fonctionnelle :

```sh
python3 scripts/qa/trips/collaboration.py --output /tmp/nagi-trip-qa
```

`python3 scripts/qa/trips/synchronization.py --output /tmp/nagi-trip-qa` mesure séparément 20 délais de propagation après commit SQL. `--legacy` permet de mesurer la version précédente.

`python3 scripts/qa/trips/crud.py --output /tmp/nagi-trip-qa` vérifie les ajouts, journées et retraits optimistes avec 2 s de latence et les écrans mobiles. Redémarrer le serveur avant cette recette également.

Cette recette utilise deux comptes distincts et le vrai flux HTTP/SSE. Elle vérifie la propagation de 20 couleurs, la fusion de propriétés différentes, le refus d’une écriture concurrente sur la même propriété, une coupure réseau suivie de sa reprise, un rollback ciblé et une navigation pendant la sauvegarde. Les tests unitaires couvrent en complément l’idempotence après perte de réponse, les événements désordonnés, les doublons, la confidentialité et la révocation.

Pour le scénario volumineux, lancer un autre serveur :

```sh
NAGI_QA_PORT=3108 NAGI_QA_SIZE=500 NAGI_QA_OUTPUT=/tmp/nagi-trip-large node scripts/qa/trips/server.mjs
python3 scripts/qa/trips/large.py --url http://localhost:3108 --output /tmp/nagi-trip-large
```

Le scénario contient 500 activités réparties sur 14 jours. Il enchaîne dix modifications avec 2 s de latence, teste un véritable déplacement annulé et relève les intervalles `requestAnimationFrame`. `query-plan.json` contient également un `EXPLAIN (ANALYZE, BUFFERS)` réel sur la base de test. Ces intervalles de frames ne remplacent pas un profil React DevTools ni une mesure du réseau Supabase en production.

Les sorties restent dans le répertoire demandé. `config.json` accepte `delay` (ms), `fail` (panne temporaire), `invalidIds` (refus définitif ciblé) et `realtimeDown` pour des essais manuels. Arrêter le serveur avec Ctrl+C.

La recette `catalog.py` vérifie la composition par glisser-déposer, les visites répétées, les arrêts explicites, les dépôts invalides, le calendrier, la synchronisation entre comptes et l’alternative mobile/clavier. Voir [le comportement et la procédure](../../../docs/TRIP_CATALOG_DRAG.md). Démarrer une base fraîche avec `NAGI_QA_OUTPUT=/tmp/nagi-catalog-qa node scripts/qa/trips/server.mjs`, puis lancer `python3 scripts/qa/trips/catalog.py --output /tmp/nagi-catalog-qa`.
