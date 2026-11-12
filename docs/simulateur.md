# Simulateur du quartier

Un outil pour rejouer des départs, des arrivées et des contrôles à 5, 10 et 30 minutes, avec **un ou deux téléphones virtuels**, **sans aller dans la rue** et **sans rien envoyer sur le vrai canal**.

## À quoi ça sert

- Vérifier qu'une modification n'a rien cassé (journal, contrôles, prévision, états des places).
- Reproduire un cas précis, par exemple « la voiture part dans 45 s mais j'arrive dans 6 s ».
- Avancer le temps de 5, 10 ou 30 minutes en une seconde.
- Vérifier que deux téléphones affichent la même chose, y compris après une coupure réseau.

## Lancer

Prérequis : Node.js (aucune installation de paquet).

```bash
node tests/simulateur/simulateur.cjs                 # tous les scénarios, avec la chronologie
node tests/simulateur/simulateur.cjs --silencieux    # seulement le résultat
node tests/simulateur/simulateur.cjs --liste         # liste des scénarios
node tests/simulateur/simulateur.cjs arrivee-prend-la-place   # un seul scénario
```

Le code de sortie est 0 si tout est conforme et 1 si un scénario échoue. Un « échec connu » n'est pas une erreur (voir plus bas).

### Essayer une autre version de l'appli sans la fusionner

Par défaut, le simulateur teste le code de ce dépôt. Pour essayer une branche ou une pull request :

```bash
git fetch origin pull/9/head:pr9                     # récupérer la PR #9
mkdir -p /tmp/app-pr9 && git archive pr9 public | tar -x -C /tmp/app-pr9
PLACELIBRE_APP=/tmp/app-pr9 node tests/simulateur/simulateur.cjs
```

## Ce qui est simulé

| Élément | Comment |
|---|---|
| Application | Les **vrais fichiers** de `public/js` (config, places, state, geometry, model, journal, predict, sync, events) sont chargés tels quels. Ils ne sont pas modifiés. |
| Temps | Horloge simulée : le scénario avance le temps à volonté. Les minuteries de l'appli (par exemple la fin d'un départ en cours) se déclenchent au bon moment. |
| Téléphone | Le stockage est en mémoire. Rien n'est écrit sur le disque. |
| Réseau | Faux ntfy en mémoire. Toute écriture sur un canal qui ne finit pas par `-test`, ou vers un site externe, est refusée et comptée comme violation. La relecture du canal (`since=`) fonctionne comme celle de ntfy. |
| Coupure réseau | `couperReseau(true)` : les envois échouent, la connexion temps réel signale une erreur et les messages publiés pendant la coupure ne sont pas reçus. `couperReseau(false)` : la connexion se rouvre et l'événement `online` est envoyé à l'appli, comme dans un navigateur. |
| Deux téléphones | Chaque téléphone a son propre contexte et son propre stockage. Ils partagent le même faux canal et la même horloge. |
| Carte et interface | Non chargées (`map.js`, `ui.js`, `main.js`). Seul le comportement est testé, pas l'affichage. |

Les téléphones sont **A** (Anthony) et **B** (Camille). Les places utilisées sont celles du registre figé `public/js/places.js` (par exemple `b04-5`, rue Bricka). Départ à 10 h le jeudi 12 novembre 2026, heure locale (rue Bricka payante).

## Scénarios

| Identifiant | Ce qu'il vérifie |
|---|---|
| `depart-et-controles` | Un départ, puis les contrôles à 5, 10 et 30 min (libre, occupée, sans réponse → « non observé »), et le modèle de durée. |
| `arrivee-prend-la-place` | Quelqu'un se gare sur la place libérée : état « occupée » et apprentissage de la durée. |
| `prevision-avec-depart` | Un départ annoncé rend la prévision « en direct » sans l'abaisser. Les pourcentages restent entre 3 % et 95 % et croissent avec le rayon. |
| `arrivee-avant-depart` | **Échec connu.** Voir ci-dessous. |
| `journal-sans-gps` | Aucune coordonnée GPS dans le journal ni dans l'export CSV. |
| `canal-reel-jamais-touche` | Tous les messages vont sur un canal `-test`. Le garde-fou refuse le canal réel. |
| `deux-telephones-meme-etat` | A annonce un départ, B se gare : les deux téléphones affichent le même état à chaque étape. |
| `doublon-ignore` | Un message rejoué (même identifiant) ne change ni l'état ni le journal. |
| `coupure-reception` | B perd le réseau pendant que A signale un départ ; à son retour B rattrape le signalement. |
| `coupure-envoi` | A signale un départ sans réseau ; l'envoi reste en attente, repart au retour du réseau **avec l'heure d'origine**, et B le reçoit. |
| `coupure-des-deux-cotes` | A et B signalent chacun pendant une coupure ; au retour du réseau, les deux affichent le même état pour les deux places. |
| `signalements-contradictoires` | « Occupée » (B) puis « libre » (A) 20 s après : la place reste « occupée » par prudence, avec l'indication de contradiction. |

## Échec connu : arriver avant le départ

`arrivee-avant-depart` montre un défaut déjà identifié : quand une voiture annonce son départ (« libre dans ~45 s »), une personne qui arrive **6 secondes plus tard** se voit attribuer environ 89 % de chances, comme si la place était déjà libre. Arriver 2 minutes plus tard donne moins (environ 61 %). C'est la tâche de Tom « corriger les prévisions avant un départ annoncé ».

Le scénario porte le drapeau `connu` : il s'affiche en « ÉCHEC CONNU » sans faire échouer la commande. Quand le défaut sera corrigé, le simulateur affichera « CORRIGÉ » : il suffira alors de retirer le drapeau `connu` dans `tests/simulateur/scenarios.cjs`, et le scénario deviendra un test normal.

## Scénarios qui dépendent d'une fonction pas encore fusionnée

Les scénarios de coupure et de contradiction dépendent du travail de Stan (pull request « signalements fiables » : file d'attente des envois, relecture du canal, état identique sur tous les téléphones). Ils déclarent `necessite: {fonction: ...}` :

- **tant que la fonction n'existe pas dans l'appli**, leur échec est « connu » : sur l'ancienne version, B ne rattrape jamais un signalement manqué et l'envoi de A est perdu ;
- **dès que la fonction existe**, ils deviennent de vrais tests : un échec fait échouer la commande.

Aucune modification n'est nécessaire après la fusion de cette pull request.

## Ajouter un scénario

Dans `tests/simulateur/scenarios.cjs`, ajouter un objet à la liste :

```js
{
  id: 'mon-scenario',
  titre: 'Ce que je veux vérifier',
  async executer({tel, h, dire, verifier}) {
    await tel.partir('b04-5');            // « Je pars » devant cette place
    await h.minutes(3);                   // avancer de 3 minutes (toujours avec await)
    dire('État : ' + tel.etatPlace('b04-5').texte);
    verifier(tel.etatPlace('b04-5').k === 'high', 'la place est libre');
  }
}
```

Pour un scénario à deux téléphones, ajouter `deux: true` ; les téléphones s'appellent alors `a` (= `tel`) et `b`, et on peut utiliser `a.couperReseau(true)`, `a.couperReseau(false)`, `await a.laisserFaire()` (laisse l'appli terminer ses envois) et `a.envoisEnAttente()`.

Actions disponibles sur `tel` : `partir(id)`, `confirmerDepart()`, `arriver(id)`, `signaler(id, libre)`, `controlesEnAttente()`, `repondreControle(idDepart, h, etat)`. Lectures : `etatPlace(id)`, `journal()`, `modele()`, `survie()`, `prevision(dest, minutes)`, `probaPlace(id, minutes)`, `places()`, `centre(id)`. Temps : `await h.secondes(n)`, `await h.minutes(n)` (le temps avance en laissant l'appli terminer ses opérations asynchrones, comme dans un navigateur : toujours utiliser `await`).

## Limites

- Les résultats décrivent le **comportement du code**, pas la réalité du terrain : un scénario qui passe ne prouve pas que les pourcentages sont justes.
- L'affichage (carte 3D, liste des rues) n'est pas testé.
- Les téléphones sont virtuels : on ne teste ni le vrai navigateur, ni le vrai ntfy, ni la vraie qualité du réseau mobile. Un test avec de vrais téléphones sur `?canal=test` reste nécessaire avant tout essai en rue.
- Le simulateur reproduit ce que fait un navigateur lors d'une coupure (erreur de connexion, événement `online`), mais il reste une modélisation : un comportement qui diffère sur certains navigateurs peut lui échapper.
