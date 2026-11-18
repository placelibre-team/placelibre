# PlaceLibre sur iPhone : du dépôt à TestFlight

Le projet Xcode est maintenant versionné dans `ios/App/App.xcodeproj`. Capacitor 8
embarque une copie du site et donne accès aux fonctions iPhone. Il ne faut plus
exécuter `npx cap add ios` : le projet existe déjà.

## Ce qui est préparé

- Code de l'interface embarqué, sans chargement de la page Netlify au démarrage.
- Localisation native lorsque l'application est ouverte ; suivi suspendu en arrière-plan.
- Presse-papiers et feuille de partage iOS ; export CSV par un fichier temporaire.
- Invitations de groupe en HTTPS, import du lien depuis les réglages et bouton de canal de test.
- Descriptions de permission de localisation en français et manifeste requis par le plugin d'export.
- Dépendances verrouillées, tests sans réseau et compilation pour simulateur sur GitHub Actions.

La signature Apple, l'installation sur un vrai iPhone et l'envoi TestFlight restent des étapes
à effectuer avec votre compte sur Mac. Un contrôle vert de compilation ne valide pas
le GPS réel, les autorisations sur l'appareil ou la publication Apple. L'icône et l'écran
de lancement générés par Capacitor sont provisoires : personnalisez-les avant diffusion publique.

## Prérequis et accès Apple

- Un Mac compatible avec **Xcode 26 ou plus** ; installer Xcode depuis le Mac App Store,
  l'ouvrir une première fois et installer la plateforme iOS si demandée.
- **Node.js 22 ou plus**, avec npm.
- iPhone sous **iOS 15 ou plus** pour les essais.
- Pour distribuer via TestFlight : abonnement Apple Developer actif, accès approprié à
  App Store Connect et capacité de signer l'application avec l'équipe concernée.

Sources : [environnement Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup),
[plateforme iOS](https://capacitorjs.com/docs/ios),
[compatibilité Mac/Xcode](https://developer.apple.com/xcode/system-requirements/).

**Abonnement individuel ou organisation :** une invitation à App Store Connect ne donne
pas nécessairement accès à l'équipe de signature dans Xcode. Si Anthony est inscrit
comme particulier, les invités ont accès à App Store Connect mais ne deviennent pas
membres de son équipe Apple Developer. Le premier archivage signé doit alors être
organisé avec le titulaire du compte, sans partager ses identifiants.
Si le compte est une organisation, vérifier les rôles et l'accès aux certificats.
Source : [rôles Apple](https://developer.apple.com/help/account/access/roles/).

L'invitation App Store Connect expire après trois jours ; le titulaire peut la renvoyer.
On l'accepte avec un compte Apple existant ou créé pendant l'activation.
Source : [ajouter un utilisateur](https://developer.apple.com/help/app-store-connect/manage-your-team/add-and-edit-users/).
Une capture affichant « Rejoindre l'Apple Developer Program » sur le compte d'un invité
ne confirme pas le statut de l'abonnement du titulaire.

## 1. Récupérer et ouvrir le projet sur le Mac

Pendant la revue de la PR nº 27 :

```bash
git clone --branch capacitor-ios https://github.com/placelibre-team/placelibre.git
cd placelibre
npm ci
npm run ios:synchroniser
npm run ios:ouvrir
```

Après fusion, utiliser `main` à la place de `capacitor-ios`. Si le dépôt est déjà sur le
Mac, sauvegarder ses modifications, puis récupérer la branche avec Git avant ces commandes.

`ios:synchroniser` copie `public/` dans `.capacitor-web/`, ajoute le pont natif compilé,
puis synchronise Xcode et ses dépendances Swift Package Manager. Ces copies sont ignorées
par Git ; **modifier les sources dans `public/` ou `native/`**, jamais dans la copie Xcode.
Le site Netlify continue à publier `public/`. Aucun mot de passe ni certificat n'est nécessaire
pour préparer ces fichiers ou compiler pour le simulateur.

Si Xcode indique que les outils de ligne de commande sont sélectionnés à sa place :

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

Adapter le chemin si Xcode a un autre nom. Les paquets Swift sont téléchargés par Xcode
à la première compilation ; une connexion Internet est nécessaire.

## 2. Lancer sur un iPhone

1. Xcode → **Settings → Accounts** : ajouter son propre compte Apple.
2. Dans le navigateur de projet, sélectionner **App**, puis la cible **App**.
3. **Signing & Capabilities** : activer **Automatically manage signing**, choisir
   l'équipe Apple qui a les droits nécessaires. La configuration ne contient aucun Team ID personnel.
4. Vérifier le **Bundle Identifier** : `fr.placelibre.app` est le choix du projet,
   pas un identifiant dont la réservation chez Apple a été vérifiée. S'il est indisponible,
   choisir un identifiant appartenant à votre équipe et modifier aussi `appId` dans
   `capacitor.config.json` et le contrôle de cohérence associé.
5. Brancher l'iPhone, accepter la relation de confiance et suivre Xcode pour activer
   le mode développeur si demandé. Le sélectionner comme appareil puis appuyer sur **▶ Run**.
6. Dans PlaceLibre → réglages → **Passer au canal de test**. Autoriser la localisation
   quand l'application est utilisée. Pour le groupe, coller le même lien d'invitation de test
   sur les téléphones : le canal est indiqué par le bandeau de test.

Les descriptions de permission sont déjà présentes dans `Info.plist`. Les deux clés demandées
par le plugin Geolocation ne signifient pas qu'on demande un suivi permanent : la version
actuelle n'active aucun mode de localisation en arrière-plan.
Source : [plugin Geolocation](https://capacitorjs.com/docs/apis/geolocation).

## 3. Distribuer la bêta à l'équipe avec TestFlight

1. Dans [App Store Connect](https://appstoreconnect.apple.com/), créer la fiche PlaceLibre
   avec le même Bundle ID, la langue principale et un SKU interne choisi par l'équipe.
2. Dans Xcode, vérifier **General → Version** et **Build** ; augmenter le numéro de build
   à chaque nouvel envoi. Choisir une destination iOS générique pour appareil physique.
3. **Product → Archive** puis, dans Organizer, **Distribute App → App Store Connect** et
   suivre l'assistant de validation et d'envoi. Renseigner les questions Apple conformément
   aux fonctions de cette version, notamment confidentialité et chiffrement.
4. Attendre le traitement de la version dans l'onglet **TestFlight**. Aucun délai précis
   n'est garanti ici. Compléter les informations de test et les éventuelles demandes Apple.
5. Ajouter les membres éligibles comme testeurs internes dans App Store Connect, ou préparer
   un groupe externe. Les tests externes peuvent nécessiter une revue Apple.
6. Chacun installe **TestFlight** sur son iPhone et accepte l'invitation pour installer PlaceLibre.

Le fichier `PlaceLibre-simulateur` produit par GitHub est une compilation non signée pour
simulateur Mac. Il ne s'installe pas sur un iPhone et ne s'envoie pas tel quel à TestFlight.
Source : [procédure TestFlight Apple](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

## Vérification avant de distribuer

```bash
npm ci
npm run ios:synchroniser
bash outils/tout-tester.sh
```

Sur GitHub, regarder **Tous les contrôles** et **Compilation iPhone (simulateur)**.
Sur deux appareils, dans le même canal de test, vérifier :

- démarrage, accueil, carte ou mode liste et affichage avec les marges de l'écran ;
- position autorisée puis refusée, sans blocage de l'interface ;
- choix d'une place et signalement reçu sur l'autre appareil ;
- partage puis import de l'invitation dans l'app, conservation du canal après réouverture ;
- copie de la cartographie et export CSV via la feuille de partage ;
- passage en arrière-plan puis retour : reprise du GPS au premier plan ;
- coupure et retour du réseau : conservation et reprise des signalements en attente.

Ces essais physiques ne sont pas remplacés par les tests simulés du dépôt. Enregistrer
le modèle d'iPhone, la version iOS, le build et le résultat des essais dans la PR.

## Limites et suite

Le stockage de Safari et celui de l'application sont séparés : l'historique existant ne migre
pas automatiquement. La carte, les polices, la recherche et les signalements réseau dépendent
de services externes. Le service worker du site n'est pas actif sous `capacitor://`.
Le canal dit privé reste une adresse partagée par invitation, pas une authentification.
Les pourcentages de disponibilité restent expérimentaux.

Le **Bluetooth natif et la détection en arrière-plan** viendront dans un chantier séparé,
après validation sur deux iPhone. Les explications Raccourcis déjà présentes dans le site ne
constituent pas une intégration Bluetooth native. Une autorisation de localisation ne garantit
pas une détection automatique fiable du stationnement ni un accès au Bluetooth de toute voiture.

Une mise à jour Netlify ne met pas à jour le code embarqué dans la bêta : après modification,
refaire `npm run ios:synchroniser`, vérifier, augmenter le build et envoyer une nouvelle archive.
La distribution publique sur l'App Store est une autre étape de revue ; son acceptation
n'est pas garantie par la présence de Capacitor ou d'un abonnement développeur.

Sources complémentaires : [distribution Capacitor](https://capacitorjs.com/docs/ios/deploying-to-app-store),
[manifeste Filesystem](https://capacitorjs.com/docs/apis/filesystem),
[App Review Guidelines Apple](https://developer.apple.com/app-store/review/guidelines/).
