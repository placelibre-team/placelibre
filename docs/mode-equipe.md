# Mode équipe

L'application est faite pour le grand public : pas de compte, un prénom facultatif, des réglages courts.
Les outils qui servent seulement à l'équipe sont cachés dans un **mode équipe**.

## Ce qui est caché au public
- Bouton **Carto** (dessiner des files de places sur la carte).
- Dans les Réglages : mode d'emploi des essais, canal du groupe (invitation, canal de test), Raccourcis Bluetooth,
  mesures du modèle (« Ce que l'IA a appris », fiabilité, durée de vie d'une place), journal et export CSV,
  partage de la cartographie, rechargement des rues OpenStreetMap.

## Activer ou désactiver
- Toucher **5 fois de suite le logo** PlaceLibre (en haut à gauche), chaque touche à moins de 1,5 s de la précédente.
  Même geste pour désactiver, ou bouton « Quitter le mode équipe » dans les Réglages.
- Ou ouvrir l'adresse avec `?equipe=1` (navigateur seulement).
- Le choix reste sur le téléphone (`localStorage`, clé `plj:equipe`). Il n'est jamais partagé.

## Règles
- Ne rien mettre dans le mode équipe qui soit nécessaire à un utilisateur normal.
- Ne jamais écrire de prénom de l'équipe dans l'interface ou dans les textes de l'application.
- Test : `tests/interface-publique.test.cjs`.
