# Polices locales

Polices distribuées sous SIL Open Font License 1.1. Les licences originales sont jointes dans ce dossier.

- **Cormorant Garamond**, romain et italique, variable 400–500 : [Google Fonts](https://fonts.google.com/specimen/Cormorant+Garamond).
- **Manrope**, variable 400–500 : [Google Fonts](https://fonts.google.com/specimen/Manrope).

Les trois fichiers WOFF2 ont été régénérés le 10 octobre 2026 à partir des fontes variables du dépôt officiel Google Fonts : [Cormorant Garamond, romain et italique](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond) et [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope). Les graisses utilisées par le site restent 400–500.

Le sous-ensemble latin étendu comprend les accents français, les ligatures `œ` et `æ`, les majuscules accentuées et les macrons des noms japonais romanisés (`ō`, `ū`, `Ō`, `Ū`). Les anciens fichiers ne contenaient pas les macrons ni `Ÿ`, ce qui provoquait un changement de police au milieu des mots. La couverture est identique en romain et en italique pour ces caractères.

Conversion avec FontTools 4.66.1 et Brotli 1.2.0 : conservation des fonctions OpenType et des axes variables, des caractères déjà présents, ainsi que des plages U+0000–024F, U+0300–036F, U+1E00–1EFF, U+2000–206F, U+20A0–20CF, U+2100–214F, U+2190–21FF et des caractères U+2212, U+FEFF, U+FFFD lorsqu’ils existent dans les sources. Le latin de base et le latin étendu sont regroupés dans un seul fichier par style pour éviter des déclarations de police concurrentes.

`next/font/local` les optimise et les sert depuis le même domaine que la page. Aucun accès à Google ni outil de conversion n’est requis pendant le build ou la visite. Compléter les sous-ensembles de caractères lors de l’ajout de langues qui le nécessitent.
