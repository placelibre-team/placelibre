# Pilote : tests, journal et contrôles

## Canal de test

Ajouter `?canal=test` à l'adresse du site :

- le temps réel passe par `placelibre-juan-q7m2x9k4-test` (le canal réel n'est pas touché) ;
- le téléphone garde des données séparées (`plj:v2:test`) ;
- un bandeau jaune « Canal de test » s'affiche.

Toutes les simulations se font sur ce canal (voir CONTRIBUTING).

## Organisation du code (`public/`)

| Fichier | Rôle |
|---|---|
| `js/config.js` | Constantes, canal, places de base, règles de la Ville |
| `js/places.js` | Registre des places partagées du pilote, identifiants stables (voir `format-evenements.md`) |
| `js/state.js` | Stockage du téléphone, outils |
| `js/geometry.js` | Découpe des files en places, rues OpenStreetMap |
| `js/model.js` | Délai Bluetooth, état des places, prévision par rue, durée de disponibilité |
| `js/journal.js` | Journal des observations, contrôles 5/10/30 min, export CSV |
| `js/sync.js` | Temps réel (ntfy) |
| `js/events.js` | Je pars, je me gare, signalements, position |
| `js/map.js` | Carte 3D (facultative) |
| `js/ui.js` | Interface, liste des rues, réglages |
| `js/main.js` | Démarrage, chargement de la carte, mode liste |

Les données et l'interface démarrent sans la carte. Si WebGL ou la bibliothèque de carte manque,
l'appli passe en mode liste au lieu de bloquer.

## Journal des observations

Une ligne par événement : départ, départ confirmé, arrivée, place vue libre, place vue occupée, contrôle.
Champs : id, heure, type, place, rue, source (bluetooth, manuel, signalement, controle, auto), auteur,
précision GPS, délai de réception, départ lié, horizon, résultat. **Aucune coordonnée GPS.**
Export : Réglages → « Exporter le journal (CSV) ». Ne pas committer ces exports.

## Contrôles après un départ

À 5, 10 et 30 min après chaque départ sur une place cartographiée, une carte « Contrôle » apparaît :
Libre, Occupée ou Pas vu. La réponse est partagée en temps réel (une seule personne répond).
Sans réponse 5 min après l'échéance, le contrôle est noté « non observé ».

## Durée de disponibilité et estimation à l'arrivée

Pour 5, 10, 15 et 30 min : part des places encore libres, calculée avec les contrôles et les
arrivées. Tant qu'il y a moins de 5 mesures, l'appli affiche « données insuffisantes » et
s'appuie surtout sur l'estimation de départ.

Dans la liste des rues, chaque place signalée est estimée **à ton heure d'arrivée** (trajet à 25 km/h
× 1,4), avec l'origine et l'âge du signalement : « Départ signalé par Tom il y a 3 min (Bluetooth) ».

## Protocole de test à deux téléphones

1. Les deux ouvrent le site avec `?canal=test` et choisissent leur prénom dans Réglages.
2. A appuie sur « Je pars » devant une place de la rue Bricka.
3. B vérifie la notification et la ligne dans la liste ; noter le délai de réception (Réglages → Journal).
4. À 5, 10 et 30 min, celui qui voit la place répond au contrôle.
5. Exporter le CSV et le ranger hors du dépôt.
