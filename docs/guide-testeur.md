# PlaceLibre · Guide du testeur (pilote Bricka / Saint-Honorat)

> *Pour l'équipe : ce guide décrit l'appli une fois fusionnées la confirmation de la place (PR #10) et,
> si elle est retenue, le canal privé par lien d'invitation (PR #19). À relire avant de l'envoyer aux testeurs.*

Merci de tester PlaceLibre ! Le but : savoir en direct quand une place se libère rue Bricka et
rue Saint-Honorat, à Juan-les-Pins, grâce aux conducteurs qui partent. Ce guide tient en 5 minutes.

> **Sécurité d'abord** : ne touche jamais ton téléphone en conduisant. Tous les gestes se font
> **à l'arrêt, moteur coupé**, ou par un passager. Ne t'arrête pas en double file pour signaler.

## 1. Installer (2 min)

1. Ouvre **le lien que l'équipe t'a envoyé en message privé**. S'il contient `#cle=`, c'est la clé du groupe :
   ne le partage pas, ne le publie pas. Sans lien, demande-le à l'équipe.
2. iPhone : dans Safari, bouton **Partager** → **Sur l'écran d'accueil** → Ajouter.
   Android : menu ⋮ → **Ajouter à l'écran d'accueil**.
3. Ouvre PlaceLibre depuis l'icône. Autorise la **localisation** (sinon l'appli ne sait pas où tu es garé).
4. ⚙ **Réglages** : choisis un **prénom** (ou un pseudo). Il s'affiche chez les autres testeurs.

## 2. Les 3 gestes

| Quand | Geste | Effet |
|---|---|---|
| Tu **pars** de ta place | **Je pars** | Ta place est annoncée bientôt libre, avec un délai affiché (45 s au départ, puis ajusté) |
| Tu **te gares** | **Je me gare ici** | La place passe en occupée |
| Tu **passes** à pied ou en passager | **Place libre ici** ou **Rue pleine** | Une touche suffit |

Après « Je pars » ou « Je me gare », l'appli peut proposer **les places les plus proches** : choisis celle
où tu es vraiment, surtout si le GPS hésite entre deux places voisines, puis confirme.
« Rue pleine » concerne les places cartographiées à proximité : utilise-le seulement si tu les vois occupées.

## 3. Les contrôles à 5, 10 et 30 min

Après un départ, un encadré « Contrôle à 5 min » peut apparaître : « La place est-elle encore libre ? ».
Réponds **Libre**, **Occupée** ou **Pas vu**, seulement si tu vois la place sans danger. « Pas vu » est une
bonne réponse : mieux vaut ne rien dire qu'une réponse devinée. Ces réponses servent à apprendre combien
de temps une place reste libre.

À l'arrivée près de ta destination, l'appli peut demander « Place trouvée à moins de 100 m ? » :
réponds Oui ou Non, cela mesure si les pourcentages affichés sont justes.

## 4. Option : départs automatiques (iPhone, Bluetooth de la voiture)

Pour que « Je pars » / « Je me gare » se fassent tout seuls quand le téléphone se connecte ou se
déconnecte de la voiture : ⚙ Réglages → **Bluetooth automatique**, suivre les étapes de l'app Raccourcis.
Copie l'adresse affichée **dans Réglages** (elle dépend du lien du groupe). Si l'équipe envoie un nouveau
lien, mets aussi à jour cette adresse dans tes deux automatisations.

À savoir : le Raccourci envoie la **position GPS du téléphone** (latitude, longitude) au moment du départ et
de l'arrivée ; l'appli la transforme en place. Les autres testeurs voient la place, mais la position passe par le canal.

## 5. Ce qui est partagé, et avec qui

- À chaque geste, les autres testeurs reçoivent : **ton prénom ou pseudo, la place, l'heure**, et parfois la
  précision du GPS. Avec le Raccourci Bluetooth, la position GPS du téléphone au départ et à l'arrivée.
  Pas ton numéro ; aucun flux continu de positions n’est envoyé aux autres testeurs.
- Les messages passent par le service ntfy.sh, sur le canal du groupe. Le lien d’invitation donne accès
  à un canal distinct : toute personne qui connaît ce lien ou le nom du canal peut lire **et envoyer**
  des signalements. Ce n’est pas une authentification des membres. Ne transmets pas ce lien.
- Sur ton téléphone, l'appli garde un journal (heures, places, réponses aux contrôles),
  **sans coordonnées GPS**. Tu peux l'exporter (Réglages → Exporter le journal) pour l'envoyer à l'équipe.
- L’état local de l’appli conserve aussi des positions liées à tes actions (par exemple ton dernier
  stationnement et l’historique des départs et arrivées), distinctes du journal CSV.
- Réglages → **Tout effacer**, puis confirme, réinitialise les données de l’appli pour le canal actif
  sur ce navigateur. Cela ne retire pas les messages déjà envoyés, les copies sur les autres téléphones,
  les fichiers exportés ni les données des autres canaux. Le lien d’accès au groupe reste mémorisé.
- Attention : signaler ta place tous les jours au même endroit et à la même heure révèle tes habitudes
  aux autres testeurs. Utilise un pseudo si tu préfères.

## 6. Ce que l'appli ne garantit pas

- Les pourcentages sont des **estimations expérimentales** : une place annoncée peut être déjà prise.
- Les places et règles de stationnement (payant, horaires) sont en cours de vérification sur place :
  respecte toujours les panneaux.
- Si la carte ne s'affiche pas, le **mode liste** permet encore de consulter les rues et de signaler.
  L’affichage de la carte et le dessin de places avec Carto restent indisponibles.

## 7. Un problème ?

Écris au groupe du pilote avec : l'heure, la rue, ce que tu as touché et ce que tu as vu (une capture d'écran aide).
