# Simulateur du quartier

Un outil pour rejouer des départs, des arrivées et des contrôles à 5, 10 et 30 minutes **sans aller dans la rue** et **sans rien envoyer sur le vrai canal**.

## À quoi ça sert

- Vérifier qu'une modification n'a rien cassé (journal, contrôles, prévision, états des places).
- Reproduire un cas précis, par exemple « la voiture part dans 45 s mais j'arrive dans 6 s ».
- Avancer le temps de 5, 10 ou 30 minutes en une seconde.

## Lancer

Prérequis : Node.js (aucune installation de paquet).

```bash
node tests/simulateur/simulateur.cjs                 # tous les scénarios, avec la chronologie
node tests/simulateur/simulateur.cjs --silencieux    # seulement le résultat
node tests/simulateur/simulateur.cjs --liste         # liste des scénarios
node tests/simulateur/simulateur.cjs arrivee-prend-la-place   # un seul scénario
```

Le code de sortie est 0 si tout est conforme et 1 si un scénario échoue. Un « échec connu » n'est pas une erreur (voir plus bas).

## Ce qui est simulé

| Élément | Comment |
|---|---|
| Application | Les **vrais fichiers** de `public/js` (config, places, state, geometry, model, journal, predict, sync, events) sont chargés tels quels. Ils ne sont pas modifiés. |
| Temps | Horloge simulée : le scénario avance le temps à volonté. Les minuteries de l'appli (par exemple la fin d'un départ en cours) se déclenchent au bon moment. |
| Téléphone | Le stockage est en mémoire. Rien n'est écrit sur le disque. |
| Réseau | Faux ntfy en mémoire. Toute écriture sur un canal qui ne finit pas par `-test`, ou vers un site externe, est refusée et comptée comme violation. |
| Carte et interface | Non chargées (`map.js`, `ui.js`, `main.js`). Seul le comportement est testé, pas l'affichage. |

Les places utilisées sont celles du registre figé `public/js/places.js` (par exemple `b04-5`, rue Bricka). Départ à 10 h le jeudi 12 novembre 2026, heure locale (rue Bricka payante).

## Scénarios

| Identifiant | Ce qu'il vérifie |
|---|---|
| `depart-et-controles` | Un départ, puis les contrôles à 5, 10 et 30 min (libre, occupée, sans réponse → « non observé »), et le modèle de durée. |
| `arrivee-prend-la-place` | Quelqu'un se gare sur la place libérée : état « occupée » et apprentissage de la durée. |
| `prevision-avec-depart` | Un départ annoncé rend la prévision « en direct » sans l'abaisser. Les pourcentages restent entre 3 % et 95 % et croissent avec le rayon. |
| `arrivee-avant-depart` | **Échec connu.** Voir ci-dessous. |
| `journal-sans-gps` | Aucune coordonnée GPS dans le journal ni dans l'export CSV. |
| `canal-reel-jamais-touche` | Tous les messages vont sur un canal `-test`. Le garde-fou refuse le canal réel. |

## Échec connu : arriver avant le départ

`arrivee-avant-depart` montre un défaut déjà identifié : quand une voiture annonce son départ (« libre dans ~45 s »), une personne qui arrive **6 secondes plus tard** se voit attribuer environ 89 % de chances, comme si la place était déjà libre. Arriver 2 minutes plus tard donne moins (environ 61 %). C'est la tâche de Tom « corriger les prévisions avant un départ annoncé ».

Le scénario porte le drapeau `connu` : il s'affiche en « ÉCHEC CONNU » sans faire échouer la commande. Quand le défaut sera corrigé, le simulateur affichera « CORRIGÉ » : il suffira alors de retirer le drapeau `connu` dans `tests/simulateur/scenarios.cjs`, et le scénario deviendra un test normal.

## Ajouter un scénario

Dans `tests/simulateur/scenarios.cjs`, ajouter un objet à la liste :

```js
{
  id: 'mon-scenario',
  titre: 'Ce que je veux vérifier',
  async executer({tel, h, dire, verifier}) {
    await tel.partir('b04-5');            // « Je pars » devant cette place
    h.minutes(3);                         // avancer de 3 minutes
    dire('État : ' + tel.etatPlace('b04-5').texte);
    verifier(tel.etatPlace('b04-5').k === 'high', 'la place est libre');
  }
}
```

Actions disponibles sur `tel` : `partir(id)`, `confirmerDepart()`, `arriver(id)`, `signaler(id, libre)`, `controlesEnAttente()`, `repondreControle(idDepart, h, etat)`. Lectures : `etatPlace(id)`, `journal()`, `modele()`, `survie()`, `prevision(dest, minutes)`, `probaPlace(id, minutes)`, `places()`, `centre(id)`. Temps : `h.secondes(n)`, `h.minutes(n)`.

## Limites

- Les résultats décrivent le **comportement du code**, pas la réalité du terrain : un scénario qui passe ne prouve pas que les pourcentages sont justes.
- L'affichage (carte 3D, liste des rues) n'est pas testé.
- Un seul téléphone virtuel pour l'instant. Le test à deux utilisateurs (échanges entre téléphones, coupure réseau) viendra dans une étape suivante et réutilisera cet environnement.
