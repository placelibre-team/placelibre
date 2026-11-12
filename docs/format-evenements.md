# Identifiants des places et format des événements

## Identifiants des places du pilote

Les places partagées des rues Bricka et Saint-Honorat sont listées une par une dans `public/js/places.js`.
Chaque place a un identifiant de la forme `<file>-<numéro>`, par exemple `b04-12`.

Cet identifiant est la seule référence utilisée par les signalements, le journal, les contrôles et le canal
temps réel. Il doit donc garder le même sens pour toute la durée du pilote.

Avant ce registre, les places étaient recalculées à chaque ouverture en découpant les files `b01` à `b18`.
Corriger le tracé d'une file aurait décalé la numérotation : un ancien « Je pars » sur `b04-12` aurait
désigné une autre place. Le registre fige les 90 places existantes avec leurs identifiants d'origine,
à moins d'un centimètre de leur position précédente.

### Règles

1. **Ne jamais renuméroter.** Pour corriger une place après la vérification sur place, modifier
   `lat`, `lng`, `cap` ou `l` et garder l'`id`.
2. **Nouvelle place** : lui donner un identifiant jamais utilisé, à la suite de sa file (`b04-19`)
   ou dans une nouvelle file (`b19-0`, à ajouter aussi dans `BASE_SEGS`).
3. **Place supprimée** (pas une place, place PMR, livraison…) : déplacer sa ligne dans
   `PLACES_RETIREES` avec un `motif` et la date. Son identifiant reste réservé ; les événements
   qui la citent sont ignorés.
4. **Type de place** : par défaut, une place prend le type de sa file dans `BASE_SEGS`. Après vérification
   sur place, on peut fixer le type d'une place précise (`type: "pmr"`) dans sa ligne, sans changer l'`id`.
5. Après chaque modification : `node outils/verifier-places.js`.

### Champs d'une place

| Champ | Exemple | Rôle |
|---|---|---|
| `id` | `"b04-12"` | Identifiant stable |
| `seg` | `"b04"` | File d'origine (`BASE_SEGS`, sert au tracé et à la suppression locale) |
| `rue` | `"Rue Bricka"` | Nom de rue utilisé pour les statistiques |
| `type` | `"pmr"` | Facultatif. Type propre à cette place (`TYPES` dans `config.js`) ; sinon celui de la file |
| `lat`, `lng` | `43.5713980`, `7.1056213` | Centre de la place |
| `cap` | `-6.8` | Orientation de la place en degrés (0 = est, 90 = nord) |
| `l` | `5.55` | Longueur occupée par la place, en mètres |

Les files dessinées avec Carto sur un téléphone (`u…`) et les côtés de rue OpenStreetMap (`o…`) restent
découpés automatiquement. Ils ne sont pas partagés : leurs identifiants n'ont de sens que sur ce téléphone.

## Événements partagés

Un événement est un message JSON envoyé sur le canal temps réel (ntfy). Version actuelle : `v: 1`.

| Champ | Obligatoire | Exemple | Rôle |
|---|---|---|---|
| `v` | non | `1` | Version du format ; absent sur les messages envoyés avant le 12/11/2026 |
| `id` | oui | `"mwdnnf7wb5q6l0"` | Identifiant unique de l'événement (évite les doublons dans le journal) |
| `slot` | oui | `"b04-12"` | Identifiant de place du registre |
| `k` | oui | `"soon"` | Nature : `soon` (départ annoncé), `free` (libre), `occ` (occupée), `ctl` (contrôle) |
| `ts` | oui | `1794494429132` | Heure de l'événement, en millisecondes depuis 1970 (heure du téléphone émetteur) |
| `eta` | non | `1794494474132` | Pour `soon` : heure prévue de libération |
| `by` | non | `"Tom"` | Prénom choisi dans Réglages |
| `dev` | non | `"k3j9x0q2ab"` | Identifiant aléatoire du téléphone (aucune donnée personnelle), pour reconnaître qu'un même téléphone se corrige |
| `src` | non | `"bluetooth"` | Origine : `bluetooth`, `manuel`, `signalement`, `confirmation`, `controle` |
| `acc` | non | `12` | Précision GPS au moment du signalement, en mètres |
| `dep`, `h`, `etat` | pour `ctl` | `"…"`, `10`, `"libre"` | Départ contrôlé, horizon en minutes, résultat (`libre`, `occupee`, `non_observe`) |

Aucune coordonnée GPS n'est envoyée pour les places du registre : la place suffit.
Le Raccourci iPhone envoie un format court `{k:'depart'|'arrive', lat, lng, by}`, converti à la réception
en événement `soon` ou `occ` sur la place la plus proche (35 m au plus), puis validé
comme les autres événements. Sans `ts`, l'heure est celle du serveur ntfy à la réception.

### Événements refusés à la réception

- `k` inconnu, `slot` absent ou `ts` non numérique ;
- `ts` plus de 10 minutes dans le futur (horloge du téléphone déréglée) ;
- `v` supérieur à la version connue (téléphone avec une version plus ancienne de l'appli) ;
- place absente du registre ou retirée.

## Même état sur tous les téléphones

Chaque téléphone garde, pour chaque place, ses derniers événements (`S.slotLog` : 40 au plus, 48 h au plus).
L'état affiché est recalculé à partir de cette liste, triée par heure d'origine (`ts`) puis par `id`.
Le résultat ne dépend donc ni de l'ordre d'arrivée, ni des retards, ni des renvois :

- **Doublon** : un événement déjà reçu (même `id`) est ignoré. C'est le cas de l'écho de ses propres
  messages, de la relecture du canal au démarrage et d'un renvoi après une coupure.
- **Message en retard** : un événement plus ancien que l'état actuel est replacé à sa date. Le résultat
  est le même que s'il était arrivé à l'heure.
- **Même heure** : l'ordre est fixé par l'`id`, identique sur tous les téléphones.
- **Contradiction** : une place signalée occupée, puis libre ou « je pars » moins de 60 s après
  (ou à la même heure) par une autre personne, reste occupée : on évite d'envoyer quelqu'un vers une
  place prise. L'état porte `conflict: true` et la fiche de la place affiche « signalements
  contradictoires ». Un signalement net plus d'une minute après lève la contradiction.
  La même personne (même prénom ou même téléphone `dev`) qui se corrige n'est pas une contradiction.
  Une place libérée puis reprise par une autre voiture est un enchaînement normal.

## Coupures réseau

Chaque signalement partagé passe par une file d'attente (`S.outbox`) gardée dans le téléphone :

- en cas d'échec (pas de réseau, erreur du serveur), il reste dans la file, même si l'appli est fermée ;
- la file repart dans l'ordre au retour du réseau, au retour dans l'appli, à la reconnexion au canal,
  et toutes les 30 s ;
- l'heure d'origine (`ts`) ne change pas : les autres téléphones placent le signalement à sa vraie date ;
- un signalement de plus de 24 h est abandonné ; la file est limitée à 300 envois ;
- le bandeau d'état indique « N envois en attente (réseau) ».

Après une coupure de la réception, le téléphone relit le canal depuis le dernier message reçu
(avec 2 min de marge) : les signalements publiés pendant l'absence ne sont pas perdus.
