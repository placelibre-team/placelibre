# Application iPhone (Capacitor + TestFlight)

Cette page explique comment transformer PlaceLibre en vraie appli iPhone, installable par l'équipe via TestFlight. L'appli reste la même : le dossier `public/` est simplement placé dans une enveloppe iPhone (Capacitor). Rien ne change pour le site Netlify.

## Ce que contient la branche

- `package.json` : Capacitor 8 (`@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`).
- `capacitor.config.json` : identifiant `fr.placelibre.app`, nom `PlaceLibre`, dossier web `public`.
- `tests/capacitor-config.test.cjs` : vérifie que cette configuration reste cohérente.
- `.gitignore` : exclut les certificats et clés Apple (`*.p12`, `*.p8`, `*.cer`, `*.mobileprovision`).

Le projet Xcode (dossier `ios/`) n'est **pas** encore dans le dépôt : il se crée sur un Mac, une seule fois (étape 2).

## Ce qu'il faut avoir

| Élément | Version | Pourquoi |
|---|---|---|
| Compte Apple Developer actif | payant, statut « Actif » | publier sur TestFlight |
| Mac avec Xcode | Xcode 26 ou plus | Capacitor 8 l'exige |
| Node.js | 22 ou plus | Capacitor 8 l'exige |

Sources : [exigences Capacitor 8](https://capgo.app/blog/upgrade-capacitor-app-to-capacitor-8/) (Node 22, Xcode 26, iOS 15).

## Étapes sur le Mac

À faire par une seule personne pour l'étape 2, ensuite chacun peut reprendre à l'étape 3.

1. Récupérer le code et se placer sur la branche de l'appli iPhone :
   ```bash
   git clone https://github.com/placelibre-team/placelibre
   cd placelibre
   git switch -c ios-projet
   npm install
   ```
2. **Première fois seulement** : créer le projet Xcode.
   ```bash
   npx cap add ios
   ```
   Cette commande crée le dossier `ios/`. Il faut l'ajouter au dépôt (`git add ios`) et l'envoyer sur une branche, avec une pull request comme d'habitude. Le message « `npx cap sync ios` » seul ne suffit pas tant que `ios/` n'existe pas.
3. Après chaque changement dans `public/` :
   ```bash
   npx cap sync ios
   npx cap open ios
   ```
4. Dans Xcode, onglet **Signing & Capabilities** : cocher « Automatically manage signing », choisir l'équipe (le compte Apple Developer) et vérifier l'identifiant `fr.placelibre.app`.
5. Autoriser la position : dans Xcode, onglet **Info** de la cible `App`, ajouter la clé `NSLocationWhenInUseUsageDescription` (« Privacy - Location When In Use Usage Description ») avec un texte clair, par exemple : *PlaceLibre utilise votre position pour repérer les places libres autour de vous.* Sans cette clé, le GPS ne fonctionne pas dans l'appli.
6. Choisir « Any iOS Device (arm64) », puis **Product > Archive**, puis **Distribute App > App Store Connect > Upload**.

À chaque nouvel envoi, augmenter le **numéro de build** (Xcode > cible `App` > General), sinon Apple refuse le fichier.

## TestFlight

1. Sur appstoreconnect.apple.com, créer l'app avec l'identifiant `fr.placelibre.app`.
2. Attendre 10 à 30 minutes que la version apparaisse dans l'onglet TestFlight.
3. Ajouter les testeurs internes (invités d'abord dans **Utilisateurs et accès**, avec leur e-mail Apple).
4. Chacun installe l'appli TestFlight, accepte l'invitation, puis installe PlaceLibre.

Les testeurs internes n'ont pas besoin d'une validation Apple de l'appli.

## Limites à connaître

- L'appli iPhone charge la même carte et les mêmes polices depuis Internet que le site : sans réseau, la carte n'apparaît pas.
- Le service worker (`sw.js`) ne s'active que sur le site `https`, donc pas dans l'appli. La reprise hors ligne se fait comme aujourd'hui, par le stockage local et la file d'envoi.
- Une appli qui n'est qu'un site dans une enveloppe peut être refusée par Apple pour une **publication publique** (règle sur les fonctions minimales). TestFlight entre vous ne pose pas ce problème. Pour la suite, des fonctions natives, comme le Bluetooth de la voiture, comptent aussi pour cette raison.
- L'appli ne suit pas la position quand l'écran est verrouillé. Cela demande une autorisation et un plugin supplémentaires, à décider plus tard.
- Le Bluetooth de la voiture viendra après, une fois l'appli installée.

## Règles

- Mots de passe, certificats et clés Apple **jamais** dans GitHub.
- Aucune fusion sans relecture par un autre membre, comme pour toutes les branches.
- Les essais se font sur un canal de test (`?canal=test`), pas sur le canal réel.
