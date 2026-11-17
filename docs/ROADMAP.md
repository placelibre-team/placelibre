# Prochaines tâches

État initial au 11 novembre 2026 : dépôt créé et prototype publié importé. Mis à jour le 17 novembre 2026, après les évolutions fusionnées jusqu'à la PR #22. Le code dispose de calculs et d'ajustements locaux, mais aucun gain de précision sur données réelles ni test terrain validé n'est annoncé. Une fonctionnalité fusionnée n'est pas nécessairement déjà publiée sur le site.

## Démarrage à quatre

- [ ] Comparer le fichier importé au dossier source de Shad.
- [x] Collaborer par PR sur GitHub : Tom, Shad, Anthony et Stan ont chacun ouvert des PR. Cela confirme leurs contributions, pas leurs droits d'administration.
- [ ] Vérifier que chaque membre peut lancer l'application.
- [x] Isoler les données et le canal de signalements de test : `?canal=test` utilise un canal ntfy et un stockage du téléphone séparés (`config.js`, `KEY` et `BUS`). La séparation des journaux et files d'envoi est vérifiée par `tests/canal-sync-isolation.test.cjs`.
- [x] Relier Netlify au dépôt pour les aperçus de PR : aperçu de #23 confirmé par Netlify.
- [x] Contrôler les fichiers publiés et exécuter les tests sur GitHub (`outils/verifier-site.js`, workflow `Tests`). Ces contrôles ne bloquent pas automatiquement les déploiements Netlify.
- [ ] Vérifier la publication du dernier `main` en production. Au contrôle HTTP du 17/11, le site sert encore `pl-v4-confirmation` dans `sw.js` et `/verification-terrain/verif.js` renvoie 404, alors que ces fichiers ont évolué dans `main`. Examiner le déploiement Netlify et son journal avant de relancer si nécessaire.
- [x] Protéger `main` : [règle active](https://github.com/placelibre-team/placelibre/settings/rules/27469736), PR avec une approbation, contrôle « Tous les contrôles » réussi sur une branche à jour, discussions résolues, suppression et poussées forcées interdites, aucune dérogation configurée.

## V0 — Fiabiliser le pilote

- [ ] Vérifier les emplacements et règles de Bricka / Saint-Honorat, à Juan-les-Pins (Antibes). Outil prêt dans le dépôt : `/verification-terrain/` et `outils/appliquer-verification.js` (`docs/verification-terrain.md`). Reste le relevé sur place, notamment les paires de files parallèles repérées (doublons ou deux côtés de la rue).
- [ ] Tester les arrivées et départs entre deux appareils. Prêt : simulateur à deux téléphones (`tests/simulateur/`) et protocole `docs/essai-deux-telephones.md`. Reste l'essai avec deux vrais téléphones.
- [ ] Mesurer les délais et pertes de réception sur un essai réel. Prêt : `outils/analyser-essai.js` (#18, `docs/essai-deux-telephones.md`). Il mesure les délais disponibles dans les journaux et signale les doublons possibles ; les conditions de comparaison restent à respecter.
- [ ] Mesurer l'erreur réelle de localisation en comparant avec la place observée sur le terrain. L'analyse des journaux fournit la précision annoncée par le téléphone, pas cette erreur réelle.
- [x] Ajouter un canal par invitation facultatif, avec stockage isolé par groupe (#19, `docs/canal-prive.md`). Le canal public reste utilisé par défaut. Le lien secret n'est ni une authentification ni un chiffrement de bout en bout : connaître le canal permet de lire et publier.
- [ ] Décider en équipe de migrer les testeurs vers un canal par invitation, puis adapter les liens et Raccourcis iPhone. Si l'ancien canal est retiré de `config.js`, cela ne désactive pas son accès sur ntfy ni les anciennes versions de l'application.
- [x] Préparer le guide du testeur (`docs/guide-testeur.md`), à relire avant envoi.
- [x] Faire fonctionner une liste de rues même si WebGL échoue. Stan rapporte dans #22 un contrôle Chrome avec WebGL désactivé et avec la carte bloquée ; le mode liste, les boutons et les signalements restent utilisables. Parcours à vérifier aussi sur les téléphones des testeurs.
- [x] Améliorer les contrastes, les repères de page et la navigation des fenêtres au clavier (#22, `tests/dialogues.test.cjs`). La correction du focus et de Tab/Shift+Tab a été testée en DOM simulé ; un nouvel essai sur les navigateurs des testeurs reste à faire.
- [x] Porter les cibles « Réglages » et « Aller » à au moins 44 × 44 px (#20). Sur les écrans de 480 px ou moins, la recherche occupe sa propre ligne. Cela ne remplace pas l'essai sur les téléphones des testeurs.

### Suivi du guide de fusion (#17)

Les PR #9 à #16, puis #18, #19, #21, #22 et #23 sont fusionnées. Les corrections du scénario `arrivee-avant-depart`, du décompte des contrôles réellement observés et du texte avant un départ annoncé sont intégrées. Le bandeau et la liste ne proposent plus « Carto » quand la carte est indisponible ; le message d'échec du chargement OpenStreetMap reste suivi dans la PR #25.

L'issue #17 reste ouverte pour les validations réelles :

- [ ] Vérifier les huit paires de files sur place, importer le relevé et faire relire la modification du registre selon `docs/verification-terrain.md`.
- [ ] Effectuer l'essai à deux vrais téléphones sur la même version et `?canal=test`, puis analyser les journaux selon `docs/essai-deux-telephones.md`. Garder les exports hors du dépôt et consigner uniquement un bilan anonymisé.

Les tests automatiques ne permettent pas de cocher ces deux points. Vérifier la version publiée avant le déplacement ; un aperçu Netlify de la version à tester peut servir si la production n'est pas encore à jour.

## V1 — Structurer le code et les données

- [x] Séparer carte, interface, signalements, stockage et prédictions : un fichier par rôle dans `public/js/` (`map.js`, `ui.js`, `sync.js` et `events.js`, `state.js`, `model.js` et `predict.js`). Les fichiers partagent encore des variables globales (`S`, `SLOTS`…), à réduire si le code grandit.
- [x] Définir des identifiants stables de places et un format d'événements horodatés (`public/js/places.js`, `docs/format-evenements.md`).
- [x] Traiter doublons, messages dans le désordre et contradictions : convergence testée à partir des mêmes événements reçus, file d'attente hors réseau et rattrapage au retour de la connexion (#9, `docs/format-evenements.md`). Cela ne garantit pas la réception de chaque message en conditions réelles.
- [ ] Traiter les observations incomplètes (contrôles non observés, départs sans suite) dans le futur jeu d'apprentissage. Déjà fait : les contrôles automatiques « non observé » ne comptent pas comme mesures (#10).
- [x] Importer les inventaires municipaux : 46 horodateurs et 5 parkings sélectionnés, avec provenance et explorateur (#6, `docs/donnees-pilote.md`). Sources datées de 2023 et 2025 ; les capacités ne sont pas des disponibilités.
- [ ] Vérifier l'actualité des inventaires et leurs correspondances sur place ; leur import ne constitue pas une validation terrain.
- [ ] Confirmer l'accès aux historiques de tickets locaux, sans assimiler fin de ticket et départ.

## V2 — Modèle local

- [ ] Constituer des observations terrain : départ, état à 5, 10 et 30 minutes, heure de reprise si connue.
- [x] Calculer une estimation expérimentale de disponibilité après un départ, en distinguant départ annoncé et place confirmée libre (#13). Sa justesse reste à mesurer sur des observations réelles.
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
- [x] Préparer un pilote local pour les parkings de grandes surfaces (#14, `docs/parkings-grandes-surfaces.md`) : comptages sourcés, limites de capacité et disponibilité inconnue après expiration.
- [ ] Obtenir l'accord d'un exploitant et une source de comptage réelle avant d'évaluer ce pilote. Les données de démonstration ne sont pas des mesures terrain.

Chaque tâche doit avoir un responsable, un résultat attendu et une vérification. Ces attributions et les dates restent à décider en équipe.
