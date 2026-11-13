# Prévisions : départ annoncé et évaluation locale

Travail de Tom — 13 novembre 2026.

## 1. Disponibilité à l'arrivée

Exemple : une voiture annonce à 10 h un départ pour 10 h 03.

- Arrivée à 10 h 01 : sa place contribue **0** à la probabilité de disponibilité.
- Arrivée à 10 h 03 : début de la courbe de disponibilité.
- Arrivée à 10 h 05 : la courbe porte sur **2 minutes depuis le départ**, pas 5 depuis l'annonce.
- Un départ confirmé plus tôt remplace la date annoncée. Une occupation ultérieure reprend la priorité.

`liveProbability` dans `model.js` est utilisée par `slotP` et `slotLive` : prévision à
l'arrivée et liste des rues partagent la même règle. L'ancien facteur de prudence 0,9
pour un départ seulement annoncé reste une **hypothèse**, pas une fiabilité mesurée.
Le plancher artificiel de 3 % est supprimé : sans place candidate disponible, le
calcul peut rendre 0. Cela signifie « aucune contribution des places modélisées »,
pas une certitude que toutes les places réelles du quartier sont occupées.

## 2. Évaluer l'apprentissage sans apprendre les réponses du test

L'application apprend déjà un paramètre `rho` représentant la dépendance entre les
places voisines. L'outil ci-dessous évalue **cet apprentissage uniquement**, pas
l'ensemble des hypothèses de disponibilité ou de durée.

```bash
node scripts/evaluate_predictions.cjs --demo
node scripts/evaluate_predictions.cjs /chemin/local/predictions.json --cutoff 2026-11-20T00:00:00+01:00
```

La démonstration génère 60 observations **entièrement synthétiques**. Elle vérifie
le fonctionnement technique et ne démontre aucun gain sur le terrain.

Le fichier réel contient un tableau de prévisions (ou un objet avec `preds`). Champs
nécessaires : `id`, `t`, `arr`, `answeredAt`, `out` (0 ou 1), `rec.qLive` et `rec.grp`.
Ce sont les composantes enregistrées au moment de la prévision, pas des valeurs
recalculées avec le journal du futur. Depuis cette modification, `answerPred`
horodate chaque réponse dans `answeredAt` ; une correction remplace cet horodatage.
Les anciennes réponses non datées sont exclues, sans inventer leur heure.

Pour exporter localement les prévisions du navigateur utilisé pour les essais,
exécuter dans sa console de développement, sur PlaceLibre :

```js
const rows = (S.preds || []).map(({id, t, arr, answeredAt, out, rec}) =>
  ({id, t, arr, answeredAt, out, rec}));
const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], {type:'application/json'}));
const a = document.createElement('a');
a.href = url; a.download = 'predictions.json'; a.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

Cet export omet les coordonnées et les prénoms. Garder les observations réelles
hors du dépôt Git et du dossier `public/`. L'évaluation reste locale, sans réseau.
Ne pas mélanger un export du canal de test avec des observations réelles.

### Séparation des périodes

1. Choisir la date de coupure **avant de consulter les résultats**.
2. Apprentissage : prévisions créées et réponses connues strictement avant cette date.
3. Test : prévisions créées à partir de cette date, avec une réponse après l'arrivée.
4. Les prévisions antérieures dont la réponse n'est arrivée qu'après la coupure sont
   exclues. Les lignes invalides ou sans réponse datée le sont aussi ; les comptes
   sont affichés. Les identifiants dupliqués provoquent une erreur.
5. Apprendre `rho` sur au moins 30 réponses d'entraînement, le figer, puis comparer
   sur les **mêmes** prévisions de test au modèle fixe `rho = 0,25`.

Les dates d'entraînement et de test sont distinctes ; les réponses futures ne
servent jamais à choisir `rho`. L'outil réutilise `fitRho` et `pWithRho` de l'application.

### Lire les résultats

- `baseline.brier` / `learned.brier` : erreur quadratique moyenne entre probabilité
  et résultat (score de Brier). Plus bas signifie meilleur sur l'échantillon évalué.
- `brierGain` : erreur du modèle fixe moins erreur du modèle appris. Négatif signifie
  une dégradation ; l'outil l'indique aussi.
- `bins` : nombre d'observations, probabilité moyenne et fréquence réellement observée
  par tranche de probabilité. Une tranche vide affiche `null`, jamais une précision inventée.
- Moins de 30 réponses d'entraînement ou aucun test : `insufficient_data`, code de sortie 2.
- Entrée invalide : code 1 ; évaluation effectuée : code 0, même si le modèle appris est moins bon.

Un petit échantillon, des réponses volontaires ou plusieurs prévisions du même trajet
ne constituent pas une validation statistique indépendante. Aucun gain terrain n'est
annoncé ici ; il faudra des observations réelles sur plusieurs jours. L'outil ne
modifie pas automatiquement le modèle de l'application.

## Vérification

```bash
node tests/prediction-timing.test.cjs
node tests/prediction-evaluation.test.cjs
```

Compatibilité avec le travail de l'équipe : le simulateur d'Anthony (#11/#12)
peut cibler cette branche avec `PLACELIBRE_APP=/chemin/vers/ce/depot`.
Son scénario `arrivee-avant-depart` passe alors de « ÉCHEC CONNU » à « CORRIGÉ ».
Le drapeau `connu` reste dans sa PR ; notre test de régression échoue normalement
si ce défaut revient. Les scénarios de coupure nécessitent aussi la PR #9 de Stan.
