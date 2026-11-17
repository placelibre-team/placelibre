# Prochaines tâches

État initial au 11 novembre 2026 : dépôt créé et prototype publié importé. Mis à jour le 17 novembre 2026, après la fusion des PR #9 à #21. Aucun modèle appris ni test terrain validé n'est annoncé.

## Démarrage à trois

- [ ] Comparer le fichier importé au dossier source de Shad.
- [x] Inviter les comptes GitHub de l'équipe : Tom, Shad, Anthony et Stan ont chacun ouvert des PR.
- [ ] Vérifier que chaque membre peut lancer l'application.
- [x] Isoler les données et le canal de signalements de test : `?canal=test` utilise un canal ntfy et un stockage du téléphone séparés (`config.js`, `KEY` et `BUS`) ; vérifié le 17/11 (les signalements et la file d'attente de test ne peuvent pas partir sur le canal réel).
- [x] Relier le site Netlify au dépôt, avec validation de la configuration avant publication (`outils/verifier-site.js`, workflow `Tests` sur chaque PR).

## V0 — Fiabiliser le pilote

- [ ] Vérifier les emplacements et règles de Bricka / Saint-Honorat. Outil prêt : `/verification-terrain/` et `outils/appliquer-verification.js` (`docs/verification-terrain.md`). Reste le relevé sur place, notamment les 8 paires de files parallèles (doublons ou deux côtés de la rue).
- [ ] Tester les arrivées et départs entre deux appareils. Prêt : simulateur à deux téléphones (`tests/simulateur/`) et protocole `docs/essai-deux-telephones.md`. Reste l'essai avec deux vrais téléphones.
- [ ] Mesurer le délai de réception et les erreurs de localisation. Prêt : `outils/analyser-essai.js` (délais, pertes, doublons, précision GPS, contrôles). Reste à le faire tourner sur les journaux de l'essai réel.
- [x] Protéger le canal temps réel : canal privé par lien d'invitation (#19, `docs/canal-prive.md`).
- [ ] Passer tous les testeurs sur le canal privé (liens et Raccourcis iPhone), puis retirer l'ancien canal public de `config.js`. Décision d'équipe : qui crée le canal et garde le lien.
- [x] Préparer le guide du testeur (`docs/guide-testeur.md`), à relire avant envoi.
- [x] Faire fonctionner une liste de rues même si WebGL échoue : vérifié le 17/11 dans Chrome avec WebGL désactivé, puis avec la bibliothèque de carte bloquée. Mode liste affiché, chances par rue, Je pars / Je me gare et signalements fonctionnels.

## V1 — Structurer le code et les données

- [x] Séparer carte, interface, signalements, stockage et prédictions : un fichier par rôle dans `public/js/` (`map.js`, `ui.js`, `sync.js` et `events.js`, `state.js`, `model.js` et `predict.js`). Les fichiers partagent encore des variables globales (`S`, `SLOTS`…), à réduire si le code grandit.
- [x] Définir des identifiants stables de places et un format d'événements horodatés (`public/js/places.js`, `docs/format-evenements.md`).
- [x] Traiter doublons, messages dans le désordre et contradictions : même état sur tous les téléphones, file d'attente hors réseau (#9, `docs/format-evenements.md`).
- [ ] Traiter les observations incomplètes (contrôles non observés, départs sans suite) dans le futur jeu d'apprentissage. Déjà fait : les contrôles automatiques « non observé » ne comptent pas comme mesures (#10).
- [ ] Importer les inventaires d'horodateurs vérifiés.
- [ ] Confirmer l'accès aux historiques de tickets locaux, sans assimiler fin de ticket et départ.

## V2 — Modèle local

- [ ] Constituer des observations terrain : départ, état à 5, 10 et 30 minutes, heure de reprise si connue.
- [ ] Estimer la probabilité qu'une place soit restée libre depuis un départ.
- [ ] Apprendre les différences selon rue, heure et jour.
- [ ] Entraîner et évaluer localement ; comparer aux hypothèses du prototype sur des jours ultérieurs. Outil d'évaluation chronologique prêt (#13, `docs/evaluation-predictions.md`), sans données réelles pour l'instant.
- [ ] Mesurer la calibration et afficher les limites lorsque les données sont insuffisantes. Déjà affiché : calibration dans les Réglages, « données insuffisantes » par horizon et « Données manquantes » par rue (#10). Reste à mesurer sur données réelles.

Les valeurs 95 % à 5 minutes, 90 % à 10 minutes et 20 % à 30 minutes sont des exemples de fonctionnement proposés par Tom, pas des résultats à inscrire comme probabilités validées.

## V3 à V5 — Guidage, précision et extension

- [x] Classer les rues selon la disponibilité estimée à l'arrivée (temps de trajet compris). L'estimation elle-même reste à valider (V2).
- [x] Afficher origine et ancienneté des informations : ligne « Origine » par rue, âge du signalement, « ancien, moins fiable » au-delà de 20 min (#10, #13).
- [ ] Étendre correctement le partage aux nouvelles places cartographiées.
- [ ] Mesurer la disponibilité réelle à l'arrivée avant de recommander une place précise.
- [ ] Étendre à un autre quartier après un bilan du pilote.

Chaque tâche doit avoir un responsable, un résultat attendu et une vérification. Ces attributions et les dates restent à décider en équipe.
