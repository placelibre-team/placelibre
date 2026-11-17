# Vérification terrain des places (Bricka, Saint-Honorat)

Outil pour la tâche V0 « Vérifier les emplacements et règles de Bricka / Saint-Honorat ».
Il remplace les 90 places dessinées depuis la photo aérienne par des places contrôlées sur place,
sans jamais changer leurs identifiants.

## Sur place (téléphone)

Ouvrir `/verification-terrain/` sur le site (aperçu Netlify ou site publié), par exemple
`https://<site>/verification-terrain/`. Rien n'est envoyé : le relevé reste dans le téléphone jusqu'à l'export.
Il est conservé si on ferme la page.

**Avant de partir**, ouvrir la page une fois avec du réseau : elle se rouvre ensuite **hors réseau**
(le service worker du site en garde une copie). Le GPS fonctionne sans réseau.

1. **Me localiser** : les places sont rangées de la plus proche à la plus éloignée. La précision GPS
   s'affiche ; au-delà de ±8 m, l'outil refuse de déplacer une place.
2. **Files en double ou deux côtés de la rue** : 8 paires de files parallèles, à 5-7 m l'une de l'autre
   sur la carte (b04 le long de b01 à b03, b11 le long de b09 et b10, et b12/b13, b14/b15, b17/b18 à
   Saint-Honorat). Sur place, regarder s'il y a des places des deux côtés ou une seule rangée :
   - « Deux côtés de la rue » : on garde tout ;
   - « Doublon : garder … » : les places de l'autre file sans réponse individuelle sont marquées « Pas une place », motif
     « doublon ». Les observations individuelles sont conservées et restent prioritaires. Changer d'avis
     annule le retrait automatique seulement si aucune autre paire ne le demande.
3. **Place par place** : toucher une place, puis
   - « Elle existe ici » ;
   - « Pas une place » (entrée de garage, arrêt de bus, livraison…) : écrire le motif dans la remarque ;
   - « Elle est là où je suis » : se placer au milieu de la place, la nouvelle position est enregistrée
     (même identifiant) ;
   - corriger le type si besoin (payant, PMR, livraison…).
   La place suivante la plus proche s'ouvre toute seule.
4. **Place absente de l'appli** : se mettre devant, choisir le type, « Ajouter une place ici ».
5. **Panneaux et marquages** : une ligne par panneau (règle, jours et horaires, tarif, saisonnier).
   Prendre aussi les panneaux en photo avec l'appareil photo.
6. **Exporter** : « Télécharger le relevé (JSON) » ou « Copier », puis l'envoyer à l'équipe.

## Appliquer le relevé au registre (ordinateur)

```bash
node outils/appliquer-verification.js placelibre-verification-20261118-1030.json            # aperçu
node outils/appliquer-verification.js placelibre-verification-20261118-1030.json --ecrire   # applique
node outils/verifier-places.js
```

- Place qui existe : inchangée (sauf type corrigé).
- Place déplacée : nouvelles coordonnées, même identifiant, même orientation et longueur.
  Un déplacement mesuré à plus de ±8 m est ignoré (option `--forcer` pour l'imposer).
  Un écart de plus de 25 m est signalé « à revérifier ».
- Pas une place ou doublon : déplacée dans `PLACES_RETIREES` avec le motif et la date.
  Son identifiant reste réservé ; les signalements qui la citent sont ignorés.
- Places ajoutées et panneaux : listés dans le compte rendu `docs/verification-terrain/<date>.md`,
  à intégrer à la main (une nouvelle place a besoin d'un identifiant neuf, d'une orientation et d'une longueur).

Ensuite : une pull request avec `public/js/places.js` et le compte rendu, relue avant fusion.
Appliquer deux fois le même relevé ne retire rien deux fois.

## Limites

- La position GPS d'un téléphone est souvent à ±5 m : elle sert à retrouver la place, pas à la
  dessiner au centimètre. Pour un déplacement, attendre une précision de ±5 m ou mieux, à découvert.
- Les places de l'appli n'ont pas de numéro peint sur la chaussée : s'aider de la carte de l'appli et
  des numéros de rue.
- Le relevé ne contient aucune donnée personnelle, sauf le prénom facultatif du releveur.

Les imports refusent avant écriture les versions inconnues, identifiants répétés, dates ou structures invalides,
ainsi que les coordonnées hors pilote et les précisions GPS absentes ou négatives. `--forcer` permet seulement
de dépasser le seuil de précision de 8 m ; il ne contourne pas ces contrôles.
