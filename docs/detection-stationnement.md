# Détection automatique du stationnement (app iPhone, bêta)

Objectif : deviner **quand une voiture se gare ou repart** à partir du téléphone de la personne, sans qu'elle ait
à appuyer sur un bouton, puis proposer la place sur la carte avec une marge d'erreur.

## Ce que fait la version actuelle

1. Le plugin natif (`ios/App/App/ParkingSignalsPlugin.swift`) enregistre trois signaux horodatés sur le téléphone :
   - **mouvement** (CoreMotion) : voiture, marche, course, vélo, immobile, avec un niveau de confiance ;
   - **position** (CoreLocation) : latitude, longitude, précision, vitesse ;
   - **audio** (AVAudioSession) : un appareil **CarPlay** ou **Bluetooth** audio se connecte ou se déconnecte.
     On ne garde pas son nom, seulement une empreinte courte propre à ce téléphone.
2. Le moteur (`public/js/detection.js`, testé sans iPhone) fusionne ces signaux. Une voiture est dite **garée** si
   au moins deux indices concordent après une vraie conduite (au moins 1 min) :

   | Indice | Poids |
   |---|---|
   | Le Bluetooth ou CarPlay **de la voiture** se déconnecte | 0,50 |
   | Le téléphone détecte de la **marche** (au moins 15 s) | 0,35 |
   | La personne **s'éloigne à pied** d'au moins 25 m du point d'arrêt | 0,15 |

   Seuil : 0,60. La marche seule (bus, taxi, feu rouge) ne suffit jamais. Le point retenu est celui où la voiture
   s'est arrêtée, pas celui où la personne marche ; la marge d'erreur combine la précision GPS et le temps écoulé.
3. **Reconnaître la voiture** : CarPlay est reconnu tout de suite. Un Bluetooth ordinaire devient « la voiture »
   après 2 conduites d'au moins 2 min pendant lesquelles il est connecté. Un appareil connecté pendant 2 min de
   marche (écouteurs, enceinte) est définitivement écarté.
4. **Départ** : si l'appareil de la voiture se reconnecte à moins de 80 m de la voiture garée, l'app propose
   « départ détecté » (confiance 0,8). Un mouvement de voiture près de la voiture garée donne 0,6.
5. **Rien n'est partagé sans accord.** Par défaut, une détection ouvre la fenêtre « Tu te gares sur quelle place ? »
   avec l'heure et la marge. Le réglage « Partage automatique » ne partage seul que les détections très sûres
   (confiance ≥ 0,8 et marge ≤ 25 m). Chaque réponse (oui/non) est gardée dans l'historique du téléphone
   (`detect_arrive` / `detect_depart`, champ `ok`) pour mesurer la fiabilité. Les événements partagés portent `src: "detection"`.

## Vie privée

- Les signaux restent sur le téléphone, 3 h au plus, puis sont effacés ; tout est effacé quand on désactive la détection.
- Le plugin n'accède pas au réseau. Seule la place validée est envoyée, comme un signalement manuel.
- Ne jamais ajouter au dépôt d'exports de positions, de plaques ou d'historiques GPS.
- Permissions demandées à l'activation : position (idéalement « Toujours »), mouvement et forme. Descriptions dans `Info.plist`.
  Mode d'arrière-plan : `location` (iOS affiche l'indicateur bleu pendant le suivi).

## À valider sur de vrais iPhone (rien de cela n'est prouvé par les tests automatiques)

- **Le point le plus incertain** : iOS montre-t-il la sortie Bluetooth/CarPlay de la voiture dans `AVAudioSession.currentRoute`
  quand aucun son ne joue ? Tester : voiture A (CarPlay), voiture B (Bluetooth), avec et sans musique, écran verrouillé.
- La page web continue-t-elle de recevoir les signaux en arrière-plan ? Sinon ils sont relus à l'ouverture de l'app
  (le plugin les garde), mais la détection n'arrive qu'à l'ouverture : pas de partage en temps réel.
- Fiabilité de `CMMotionActivity` (marche détectée après la sortie de voiture) et du GPS à l'arrêt.
- Consommation de batterie sur une journée.
- Chiffres de départ à régler avec les essais : seuil 0,60, poids, 25 m, 15 s, 80 m (`DET_CFG` dans `detection.js`).

## Essai conseillé

1. Installer la version TestFlight, ouvrir ⚙ Réglages > **Détection automatique du stationnement**, activer, accepter les permissions.
2. Faire 2 trajets de plus de 2 min avec le Bluetooth de la voiture : l'écran indique alors « Bluetooth de ta voiture reconnu ».
3. Se garer rue Bricka ou Saint-Honorat, couper le moteur, marcher 1 min, ouvrir l'app : la fenêtre doit proposer la bonne place.
4. Noter pour chaque essai : place réelle, place proposée, marge annoncée, détection oui/non (sans exporter de traces GPS).

## Prochaines étapes possibles

- Porter la décision dans le plugin natif pour détecter et partager même si la page est suspendue.
- Notification locale « Tu t'es garé ? » pour valider sans ouvrir l'app.
- Calibrer poids et seuil avec les réponses oui/non collectées, puis ajouter l'orientation de la rue (cap du déplacement).
- Croiser avec les données de la Ville (tickets d'horodateurs) quand elles seront disponibles.
