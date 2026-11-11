# Travailler ensemble

Le dépôt est la base de code commune. Les collaborateurs doivent être invités avec leur compte GitHub ; aucun compte n'est ajouté automatiquement.

1. Choisir une tâche précise et annoncer qui la prend.
2. Récupérer la dernière version de `main`.
3. Créer une branche pour la tâche : `carte-secours`, `journal-evenements` ou `modele-disponibilite`.
4. Modifier et tester localement. Éviter de modifier simultanément les mêmes zones du fichier `public/index.html`.
5. Faire des commits courts, avec un message descriptif sur une ligne.
6. Ouvrir une pull request vers `main`, avec les changements et les vérifications effectuées.
7. Faire relire et tester par un autre membre avant de fusionner.

Après l'import initial, ne pas développer directement sur `main`. Cette règle est une convention d'équipe ; aucune protection technique de branche n'a été activée lors de la création.

## Tester

Vérifier les fonctionnalités concernées et noter le navigateur utilisé. Les simulations de disponibilité doivent utiliser un canal de test séparé. Pour les essais terrain, ne pas manipuler le téléphone en conduisant et ne pas présenter une prédiction comme une disponibilité garantie.

## Données et secrets

Ne pas committer de fichiers `.env`, clés, mots de passe, plaques, historiques GPS ou exports utilisateurs. Partager séparément les paramètres nécessaires par un moyen approprié. Les échantillons de développement doivent être fictifs ou correctement anonymisés.
