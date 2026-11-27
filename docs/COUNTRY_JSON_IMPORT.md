# Import JSON des pays

Dans **Administration → Pays → Importer un JSON**, sélectionner un fichier puis vérifier l’aperçu avant de cliquer sur **Importer en brouillon**. Un modèle est téléchargeable dans la modale.

Le fichier accepte un objet unique ou une liste :

```json
[
  { "displayOrder": 1, "name": "Japon", "iso": "JP" },
  { "displayOrder": 2, "name": "Côte d’Ivoire", "iso": "CI" }
]
```

- `displayOrder` : entier entre 0 et 2 147 483 647, enregistré dans l’ordre d’affichage du catalogue.
- `name` : nom du pays, jusqu’à 100 caractères. L’adresse est générée avec la normalisation déjà utilisée dans les formulaires (`Côte d’Ivoire` → `cote-d-ivoire`).
- `iso` : deux lettres, normalisées en majuscules.

Seuls ces trois champs sont acceptés. Tous les nouveaux pays sont créés **en brouillon**, sans description ni image ; ces informations peuvent être ajoutées depuis la fiche pays. Aucune migration ni clé API supplémentaire n’est nécessaire.

Le fichier est limité à **500 pays et 1 Mo**. Le format est validé dans l’aperçu puis à nouveau sur le serveur. Les doublons de code ISO ou d’adresse dans un même fichier sont signalés avant toute écriture.

Les codes ISO déjà présents en base sont ignorés. Leurs noms, descriptions, images, adresses, ordres et publications restent intacts. Réimporter le même fichier ne crée donc pas de doublons. Si une nouvelle adresse entre en conflit avec celle d’un autre pays, la totalité du lot est annulée.

L’import utilise une unique insertion PostgreSQL avec `ON CONFLICT (iso_code) DO NOTHING`, via le client de session et les politiques RLS existantes. L’action vérifie le rôle administrateur avant de lire le fichier. Le résultat indique le nombre de pays créés et ignorés, puis actualise la liste.

## Validation

745 tests réussis dans 56 fichiers, dont validation du JSON, normalisation, limites, brouillons forcés, permissions, idempotence et annulation atomique en cas de collision. TypeScript, ESLint et build Next de production validés.

La recette Chromium utilise le vrai build Next, les Server Actions et PostgreSQL/RLS local avec des comptes fictifs : import, aperçu, réimport, collision et formats 390/320 px, sans erreur JavaScript ni modification de données de production.

Après compilation avec `NAGI_QA_DIST_DIR=.next/country-import-qa` :

```sh
NAGI_QA_COUNTRY_IMPORT=1 NAGI_QA_DIST_DIR=.next/country-import-qa NAGI_QA_PORT=3157 NAGI_QA_OUTPUT=/tmp/nagi-country-import-qa node scripts/qa/trips/server.mjs
python3 scripts/qa/trips/country-import.py --url http://localhost:3157 --output /tmp/nagi-country-import-qa
```

Le rapport et les captures de cette livraison sont conservés localement dans `artifacts/country-import/`, ignoré par Git.
