# Prochaines tâches

État initial au 11 novembre 2026 : dépôt créé et prototype publié importé. Aucun modèle appris ni test terrain validé n'est annoncé.

## Démarrage à trois

- [ ] Comparer le fichier importé au dossier source de Shad.
- [ ] Inviter les comptes GitHub de l'équipe.
- [ ] Vérifier que chaque membre peut lancer l'application.
- [ ] Isoler les données et le canal de signalements de test.
- [ ] Relier le site Netlify au dépôt, avec validation de la configuration avant publication.

## V0 — Fiabiliser le pilote

- [ ] Vérifier les emplacements et règles de Bricka / Saint-Honorat.
- [ ] Tester les arrivées et départs entre deux appareils.
- [ ] Mesurer le délai de réception et les erreurs de localisation.
- [ ] Faire fonctionner une liste de rues même si WebGL échoue.

## V1 — Structurer le code et les données

- [ ] Séparer carte, interface, signalements, stockage et prédictions.
- [x] Définir des identifiants stables de places et un format d'événements horodatés (`public/js/places.js`, `docs/format-evenements.md`).
- [ ] Traiter doublons, contradictions et observations incomplètes.
- [ ] Importer les inventaires d'horodateurs vérifiés.
- [ ] Confirmer l'accès aux historiques de tickets locaux, sans assimiler fin de ticket et départ.

## V2 — Modèle local

- [ ] Constituer des observations terrain : départ, état à 5, 10 et 30 minutes, heure de reprise si connue.
- [ ] Estimer la probabilité qu'une place soit restée libre depuis un départ.
- [ ] Apprendre les différences selon rue, heure et jour.
- [ ] Entraîner et évaluer localement ; comparer aux hypothèses du prototype sur des jours ultérieurs.
- [ ] Mesurer la calibration et afficher les limites lorsque les données sont insuffisantes.

Les valeurs 95 % à 5 minutes, 90 % à 10 minutes et 20 % à 30 minutes sont des exemples de fonctionnement proposés par Tom, pas des résultats à inscrire comme probabilités validées.

## V3 à V5 — Guidage, précision et extension

- [ ] Classer les rues selon la disponibilité estimée à l'arrivée.
- [ ] Afficher origine et ancienneté des informations.
- [ ] Étendre correctement le partage aux nouvelles places cartographiées.
- [ ] Mesurer la disponibilité réelle à l'arrivée avant de recommander une place précise.
- [ ] Étendre à un autre quartier après un bilan du pilote.

Chaque tâche doit avoir un responsable, un résultat attendu et une vérification. Ces attributions et les dates restent à décider en équipe.
