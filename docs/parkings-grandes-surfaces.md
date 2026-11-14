# Pilote parkings de grandes surfaces

## Proposition

Tester PlaceLibre sur un parking délimité peut permettre de comparer un comptage
global à des observations. C'est une hypothèse de pilote, pas la confirmation qu'un
magasin dispose de capteurs, de données accessibles ou souhaite un partenariat.

Commencer par la capacité du périmètre, son occupation agrégée et les conditions
d'accès. La place exacte, les prévisions et le guidage restent des étapes ultérieures.
Un test opérationnel et les éventuels accès aux données restent à organiser avec
l'exploitant. Aucun flux ni partenariat n'est connecté dans cette PR.

## Fonctionnement livré

Ouvrir `/parkings-pilotes/` sur le serveur local ou dans l'aperçu Netlify de la PR.

- Ajouter un parking, sa capacité, ses conditions d'accès et la source déclarée.
- Laisser le comptage vide pour enregistrer uniquement une capacité : l'état reste inconnu.
- Saisir le nombre de places occupées et la date du comptage sur le **même périmètre**.
- Actualiser un parking, exporter/importer du JSON versionné ou supprimer les données locales.
- Passer en exemple fictif sans écraser ni exporter les données de démonstration.

Le résultat est `capacité - occupées` au moment du comptage. Ce n'est pas une
garantie de place utilisable : prendre en compte les places réservées, fermées,
les horaires, l'accès clients et les changements depuis l'observation.

La valeur disparaît au seuil choisi (15 minutes par défaut, réglable de 1 à 60).
Ce seuil est un paramètre de test non calibré. La page actualise son affichage toutes
les 30 secondes ; une date future est refusée, un recul de l'horloge rend l'état inconnu.
Le libellé « Source exploitant déclarée » ne signifie pas que la source est authentifiée.

## Format de données

Objet `{version:1, parkings:[...]}`. Chaque parking comporte :

| Champ | Contenu |
|---|---|
| `id`, `name` | Identifiant local stable et nom du parking |
| `capacity` | Entier positif, capacité du périmètre compté |
| `occupied` | Entier entre 0 et capacité, ou `null` si inconnu |
| `observedAt` | Date ISO avec fuseau, ou `null` sans comptage |
| `source`, `kind` | Source déclarée ; `manual` ou `operator` pour les imports |
| `access` | `customers`, `public` ou `unknown` |
| `maxAgeMinutes` | Seuil de fraîcheur entre 1 et 60 minutes |

Un import invalide est refusé en entier. Un import valide remplace les données
locales après confirmation si elles existent. Maximum : 200 parkings, fichier 1 Mo.
Les champs supplémentaires ne sont pas conservés. Aucun besoin de plaques, GPS,
trajets ou noms de personnes. Les données sont propres au navigateur et à l'origine
du site ; le JSON permet leur transfert volontaire. Ne pas committer de données réelles.

## Tests et limites

```bash
node tests/parking-occupancy.test.cjs
python3 -m http.server 8000 --bind 127.0.0.1 --directory public
```

Tester : vide → ajout → actualisation → rechargement → exemple fictif → retour aux
données → export/import → fichier invalide. Tester aussi un comptage ancien et un
parking complet. Vérifier que la page n'envoie aucun comptage au canal de signalements.

La page ne charge aucun module de synchronisation de l'application principale,
aucune carte et aucun service tiers. Elle n'est pas un serveur partagé : l'équipe
devra choisir ultérieurement le stockage commun et l'authentification de l'exploitant.
Les inventaires municipaux, les probabilités et les branches des autres membres ne
sont pas modifiés. Cette préparation ne remplace pas les corrections en attente
sur les PR #9 et #10 ni la validation des PR #11 à #13.
