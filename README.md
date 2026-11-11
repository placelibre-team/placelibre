# PlaceLibre

Prototype collaboratif de recherche de stationnement, avec un pilote autour des rues Bricka et Saint-Honorat à Juan-les-Pins.

## Point de départ

`public/index.html` est une copie du HTML publié sur le site Netlify, récupérée le 11 novembre 2026. Elle contient le style et la logique JavaScript du prototype. Ce dépôt ne contient pas l'historique de développement ni les éventuels fichiers non publiés de Shad. Comparer cette base avec son dossier source avant les prochaines modifications.

Le prototype existant est conservé sans changement fonctionnel. Les prochaines versions et le modèle local ne sont pas encore développés.

## Lancer sur son ordinateur

Prérequis : Python 3 et un navigateur prenant en charge WebGL.

```bash
git clone https://github.com/TomMakhlouf/placelibre.git
cd placelibre
python3 -m http.server 8000 --bind 127.0.0.1 --directory public
```

Sous Windows, utiliser `py -m http.server 8000 --bind 127.0.0.1 --directory public` si nécessaire.
Ouvrir http://localhost:8000 dans le navigateur. L'accès au dépôt privé nécessite un compte GitHub autorisé.

La carte, la recherche et le service de signalements utilisent des services externes : une connexion Internet est nécessaire. La géolocalisation demande l'autorisation du navigateur. Sur téléphone, utiliser une adresse HTTPS ; `localhost` sur le téléphone ne désigne pas l'ordinateur.

## Attention pendant les essais

Le code importé conserve le canal de signalements du prototype en ligne. Les boutons de signalement peuvent donc écrire dans ce canal : ne pas envoyer de fausses données. Isoler un canal de test avant les essais automatisés ou les simulations.

Les pourcentages sont expérimentaux. La cartographie et les règles doivent être vérifiées sur le terrain. Un échec WebGL peut empêcher le démarrage du prototype ; prévoir un affichage de secours est une tâche à réaliser.

## Organisation

- `public/index.html` : application existante, HTML/CSS/JavaScript réunis.
- `CONTRIBUTING.md` : méthode de collaboration.
- `docs/ROADMAP.md` : prochaines tâches techniques.
- `netlify.toml` : préparation d'un déploiement statique depuis `main`.
- `.github/pull_request_template.md` : modèle de demande de relecture.

Le document de travail reste la référence pour la stratégie : [Plan d'action PlaceLibre](https://docs.google.com/document/d/1pcwOm-5wa35VTFGdWqv8p20sZWXWpRAEfRnts1RXQss/edit).

## Publication

Le dépôt est privé. La présence de `netlify.toml` ne connecte pas le site Netlify à GitHub : cette connexion reste à configurer depuis le compte qui possède le site. Vérifier la confidentialité des aperçus avant de les diffuser.

Les données personnelles, historiques GPS et clés ne doivent pas être déposés dans Git. Le dépôt contient le code, pas une base de données partagée des utilisateurs.
