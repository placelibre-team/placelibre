# Travailler ensemble

Le dépôt est la base de code commune. Les collaborateurs doivent être invités avec leur compte GitHub ; aucun compte n'est ajouté automatiquement.

1. Choisir une tâche précise et annoncer qui la prend.
2. Récupérer la dernière version de `main`.
3. Créer une branche pour la tâche : `carte-secours`, `journal-evenements` ou `modele-disponibilite`.
4. Modifier et tester localement. Éviter de modifier simultanément les mêmes zones du fichier `public/index.html`.
5. Faire des commits courts, avec un message descriptif sur une ligne.
6. Ouvrir une pull request vers `main`, avec les changements et les vérifications effectuées.
7. Un autre membre de l’équipe relit les fichiers dans **Files changed** et teste ce qui a changé. Il peut aussi pousser une correction sur la branche de la PR.
8. Une fois satisfait de la version finale, ce membre clique manuellement sur **Merge pull request** lorsque le contrôle **Tous les contrôles** est vert et que les discussions sont résolues. L’auteur de la PR lui laisse la fusion.

La [protection de `main`](https://github.com/placelibre-team/placelibre/rules/27469736) exige une PR, une branche à jour avec `main`, la réussite de **Tous les contrôles** et la résolution des discussions. Les approbations GitHub sont facultatives. La relecture et le choix de la personne qui clique sur **Merge** relèvent de notre accord d’équipe. La fusion automatique est désactivée.

## Tester

Vérifier les fonctionnalités concernées et noter le navigateur utilisé. Les simulations de disponibilité doivent utiliser un canal de test séparé. Pour les essais terrain, ne pas manipuler le téléphone en conduisant et ne pas présenter une prédiction comme une disponibilité garantie.

## Données et secrets

Ne pas committer de fichiers `.env`, clés, mots de passe, plaques, historiques GPS ou exports utilisateurs. Partager séparément les paramètres nécessaires par un moyen approprié. Les échantillons de développement doivent être fictifs ou correctement anonymisés.
