# Essai à deux téléphones : réception, localisation, expiration

Tâches V0 « Tester les arrivées et départs entre deux appareils » et « Mesurer le délai de réception
et les erreurs de localisation ». À faire après la vérification terrain (`docs/verification-terrain.md`),
sur des places vérifiées.

## Préparer (5 min)

- Deux téléphones, **A** (dans la voiture) et **B** (à distance), tous deux sur l'appli avec `?canal=test`.
  Le bandeau « Canal de test » doit être visible : aucun signalement ne part sur le canal réel.
- Heure automatique (réseau) sur les deux téléphones : le délai de réception est calculé avec l'heure
  de chacun, une horloge décalée fausse la mesure.
- Un prénom différent dans Réglages sur chaque téléphone.
- Noter pour chacun : modèle, système, navigateur, 4G / 5G / Wi-Fi.
- Sécurité : aucun signalement ni manipulation du téléphone en conduisant, seulement à l'arrêt.

## Pendant l'essai

1. **Réception** : sur A, à l'arrêt, « Je pars » puis, une autre fois, « Je me gare ici ». B ne fait rien :
   l'appli enregistre seule le délai de réception. Refaire avec B qui signale et A qui reçoit.
   Cas à essayer aussi : B en arrière-plan, A sans réseau quelques minutes puis reconnecté.
2. **Localisation** : à chaque signalement, noter sur papier la place où est **vraiment** la voiture
   (numéro de place de la page de vérification terrain ou numéro de rue). À comparer ensuite à la colonne
   `place` du journal. Avec la PR #10, choisir la bonne place dans la fenêtre de confirmation et noter si
   la place proposée en premier était la bonne.
3. **Expiration** : après chaque « Je pars », répondre aux contrôles à 5, 10 et 30 min (libre / reprise /
   non observé), seulement si l'observation est possible et sûre.

Viser au moins 20 signalements dans chaque sens, sur plusieurs jours et heures, avant de conclure.

## Analyser

Sur chaque téléphone : ⚙ Réglages, section « Journal des observations », **Exporter le journal (CSV)**, puis envoyer les deux fichiers.

```bash
node outils/analyser-essai.js journal-A.csv journal-B.csv --noms Tom,Stan --sortie docs/essais/2026-11-18.md
```

Le compte rendu donne :

- **Réception** : délai médian, à 90 %, maximal, réceptions de plus de 10 s, signalements reçus au démarrage
  (délai inconnu) et signalements absents d'un téléphone (perte, ou journal exporté trop tôt) ;
- **Localisation** : précision GPS annoncée (médiane, à 90 %, part ≤ 10 m et > 25 m). Les places sont
  espacées d'environ 6 m : au-delà, la place proposée peut être la voisine ;
- **Doublons** : même type, même place, moins de 30 s d'écart ;
- **Contrôles** : par horizon, places encore libres, reprises, non observées, réponses contradictoires.

Une alerte s'affiche si beaucoup de délais valent 0 s : l'horloge d'un téléphone est en avance.

## Limites

- Les journaux ne contiennent aucune coordonnée GPS : l'erreur de localisation réelle vient des notes prises
  sur place, la précision annoncée par le téléphone n'en est qu'une indication.
- Un signalement absent d'un journal n'est pas forcément perdu : exporter les deux journaux à la fin de
  l'essai, après quelques minutes de réseau.
- Quelques essais ne suffisent pas pour régler le modèle de prévision : ils servent à vérifier que les
  signalements circulent bien et à repérer les problèmes.
