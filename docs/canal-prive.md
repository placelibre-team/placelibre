# Canal privé du groupe (lien d'invitation)

## Le problème

Les signalements passent par un canal ntfy.sh. Sur ntfy.sh sans compte, **le nom du canal sert de mot de passe** :
quiconque le connaît peut lire les messages et en publier
([conditions ntfy.sh](https://docs.ntfy.sh/terms/), [FAQ ntfy](https://sources.debian.org/src/ntfy/2.11.0-3/docs/faq.md)).

Le nom du canal du pilote est écrit dans `public/js/config.js`. Il est donc visible sur GitHub (dépôt public)
et dans le code du site publié. Conséquences :

- **faux signalements** : n'importe qui peut annoncer des départs ou des places libres qui n'existent pas ;
- **vie privée** : chaque signalement contient le prénom du testeur, la place et l'heure. En lisant le canal,
  on peut suivre quand une personne précise quitte ou retrouve sa voiture.

À régler avant d'ouvrir le pilote à de vrais testeurs.

## La solution proposée (gratuite)

Un **canal privé par lien d'invitation** :

- une personne du groupe crée le canal : ⚙ Réglages → **Canal du groupe** → « Créer un canal privé »
  (deux appuis). Le téléphone tire une clé aléatoire de 32 caractères hexadécimaux (128 bits, générateur sécurisé du navigateur) ;
- elle touche « Copier le lien d'invitation » et l'envoie **en message privé** aux testeurs
  (`https://<site>/#cle=…`) ;
- chaque testeur ouvre le lien une fois : la clé est gardée dans son téléphone et retirée de l'adresse ;
- le canal devient `ntfy.sh/pl-<clé>`, qui n'apparaît nulle part dans le code ni sur GitHub ;
- sans lien, l'appli reste sur l'ancien canal public (rien ne casse pendant la transition) ;
- le canal de test suit : `?canal=test` avec une clé → `pl-<clé>-test`. Une invitation de test
  garde sa propre clé et ne remplace jamais celle du canal réel ; sans clé de test, il utilise la clé réelle
  uniquement pour rejoindre le canal suffixé `-test` ;
- chaque canal a son propre état local : journal, places, apprentissage et file d'envoi ne passent jamais
  dans le nouveau groupe. Le stockage public existant est conservé. Revenir à l'ancien lien retrouve
  les données de ce groupe ; aucun historique n'est automatiquement transféré ;
- si le stockage du navigateur est bloqué, l'invitation reste active en mémoire et un avertissement
  demande de garder le lien pour la prochaine visite. La création d'un canal est refusée si la clé
  ne peut pas être enregistrée ou si le générateur sécurisé est indisponible.

**Raccourcis iPhone (Bluetooth)** : l'adresse affichée dans Réglages devient celle du canal privé.
Chaque testeur doit la recopier dans ses deux automatisations, sinon ses départs automatiques partent
sur l'ancien canal public.

## Limites

- Le terme « privé » désigne un nom de canal difficile à deviner, **pas une authentification** ni un chiffrement de bout en bout. Le service ntfy reçoit les messages. Toute personne qui a le lien ou le nom du canal peut lire et écrire : ne jamais le publier (groupe WhatsApp du pilote seulement).
  En cas de fuite, créer un autre canal privé et renvoyer le nouveau lien.
- Créer un nouveau canal ne supprime ni les messages déjà transmis à ntfy.sh ni les données déjà reçues par les membres. Cela n'empêche pas une personne de continuer à publier sur l'ancien canal.
- Pour aller plus loin (comptes, droits lecture / écriture séparés), il faut une offre payante ntfy.sh
  avec canaux réservés, ou un serveur ntfy à nous avec contrôle d'accès.

## Décisions pour l'équipe

1. Qui crée le canal privé du pilote et garde le lien ?
2. Quand arrêter l'ancien canal public (par exemple : retirer `BUS_PUBLIC` de `config.js` une fois tous les
   testeurs passés sur le lien) ?
3. Faut-il, plus tard, un serveur ntfy avec comptes ?

## Vérification hors ligne

`node tests/canal-prive.test.cjs` vérifie les invitations, l'isolation public / groupes / test,
le stockage bloqué, les liens sans paramètres d'action et la création sécurisée. Aucune requête
n'est envoyée à ntfy.sh et aucun canal réel n'est créé par ces tests.
