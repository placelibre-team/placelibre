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
  (deux appuis). Le téléphone tire une clé aléatoire de 24 caractères ;
- elle touche « Copier le lien d'invitation » et l'envoie **en message privé** aux testeurs
  (`https://<site>/#cle=…`) ;
- chaque testeur ouvre le lien une fois : la clé est gardée dans son téléphone et retirée de l'adresse ;
- le canal devient `ntfy.sh/pl-<clé>`, qui n'apparaît nulle part dans le code ni sur GitHub ;
- sans lien, l'appli reste sur l'ancien canal public (rien ne casse pendant la transition) ;
- le canal de test suit : `?canal=test` avec une clé → `pl-<clé>-test`.

**Raccourcis iPhone (Bluetooth)** : l'adresse affichée dans Réglages devient celle du canal privé.
Chaque testeur doit la recopier dans ses deux automatisations, sinon ses départs automatiques partent
sur l'ancien canal public.

## Limites

- Toute personne qui a le lien peut lire et écrire : ne jamais le publier (groupe WhatsApp du pilote seulement).
  En cas de fuite, créer un autre canal privé et renvoyer le nouveau lien.
- Les messages restent quelques heures en mémoire sur ntfy.sh, comme aujourd'hui.
- Pour aller plus loin (comptes, droits lecture / écriture séparés), il faut une offre payante ntfy.sh
  avec canaux réservés, ou un serveur ntfy à nous avec contrôle d'accès.

## Décisions pour l'équipe

1. Qui crée le canal privé du pilote et garde le lien ?
2. Quand arrêter l'ancien canal public (par exemple : retirer `BUS_PUBLIC` de `config.js` une fois tous les
   testeurs passés sur le lien) ?
3. Faut-il, plus tard, un serveur ntfy avec comptes ?
