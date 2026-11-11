/* PlaceLibre · configuration (constantes, données de la Ville, réglages du pilote) */
'use strict';

/* Canal : ?canal=test sépare tout (temps réel ntfy et stockage du téléphone) pour les simulations */
const URLP = new URLSearchParams(location.search);
const TEST = URLP.get('canal') === 'test';
const KEY = TEST ? 'plj:v2:test' : 'plj:v2';
const BUS = 'https://ntfy.sh/placelibre-juan-q7m2x9k4' + (TEST ? '-test' : '');

const BBOX = [43.552, 7.090, 43.582, 7.135];          // Juan-les-Pins (S, O, N, E)
const CENTER = [7.1056, 43.5712];                      // [lng, lat]
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const SLOT_LEN = 5.3;                                  // longueur d'une place (m)
const LINK_M = 25;                                     // distance max pour rattacher un départ à une place
const MOVE_M = 35;                                     // distance qui confirme le départ
const TYPES = {
  free:{label:'Gratuit', color:'#1f9d55'}, pay:{label:'Payant', color:'#2f5fb3'},
  blue:{label:'Zone bleue', color:'#3a8fd5'}, res:{label:'Résidents', color:'#8a5a44'},
  deliv:{label:'Livraison', color:'#b0702a'}, pmr:{label:'PMR', color:'#7a4fc0'},
  unk:{label:'Non précisé', color:'#7d8b90'}
};
/* Places déjà cartographiées (photo aérienne IGN) : rue Bricka et rue Saint-Honorat */
const BASE_SEGS = [{"id": "b01", "pts": [[7.1049561, 43.5715131], [7.105276, 43.5714848]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b02", "pts": [[7.1053852, 43.5714758], [7.1055647, 43.57146]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b03", "pts": [[7.1057753, 43.5714407], [7.1060484, 43.571417]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b04", "pts": [[7.1048, 43.5714701], [7.1060484, 43.5713605]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b05", "pts": [[7.1038341, 43.5716297], [7.1040526, 43.5716127]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b06", "pts": [[7.1042554, 43.5715212], [7.1046456, 43.5714895]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b07", "pts": [[7.1025561, 43.5717352], [7.1027745, 43.571716]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b08", "pts": [[7.1033753, 43.5716809], [7.1036484, 43.5716538]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b09", "pts": [[7.1061561, 43.5713927], [7.1064526, 43.5713679]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b10", "pts": [[7.1067023, 43.5713362], [7.1069207, 43.5713181]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b11", "pts": [[7.10606, 43.5713439], [7.1069207, 43.5712774]], "type": "pay", "name": "Rue Bricka", "src": "base"}, {"id": "b12", "pts": [[7.1069962, 43.5709739], [7.1069962, 43.5709038]], "type": "free", "name": "Rue Saint-Honorat", "src": "base"}, {"id": "b13", "pts": [[7.107068, 43.5709942], [7.107068, 43.5709004]], "type": "free", "name": "Rue Saint-Honorat", "src": "base"}, {"id": "b14", "pts": [[7.1070087, 43.57075], [7.1070149, 43.5706347]], "type": "free", "name": "Rue Saint-Honorat", "src": "base"}, {"id": "b15", "pts": [[7.1070789, 43.57075], [7.1070805, 43.5706776]], "type": "free", "name": "Rue Saint-Honorat", "src": "base"}, {"id": "b16", "pts": [[7.1070056, 43.5711794], [7.1070071, 43.5710742]], "type": "free", "name": "Rue Saint-Honorat", "src": "base"}, {"id": "b17", "pts": [[7.1070071, 43.5703747], [7.1069525, 43.5698852]], "type": "free", "name": "Rue Saint-Honorat", "src": "base"}, {"id": "b18", "pts": [[7.1070929, 43.5703521], [7.1070399, 43.5698852]], "type": "free", "name": "Rue Saint-Honorat", "src": "base"}];

/* Contrôles après un départ et modèle de durée de disponibilité */
const CHECK_H = [5, 10, 30];               // contrôles demandés après un départ (min)
const SURV_H = [5, 10, 15, 30];            // horizons du modèle de durée (min)
const CHECK_EARLY = 60e3;                  // on peut répondre 1 min avant l'échéance…
const CHECK_LATE = 5*60e3;                 // …et jusqu'à 5 min après, ensuite « non observé »
const SURV_PSEUDO = 3;                     // poids de l'estimation de départ (nombre de mesures fictives)
const SURV_MIN_N = 5;                      // en dessous : « données insuffisantes »
const DRIVE_KMH = 25, DETOUR = 1.4;        // trajet en ville pour estimer l'heure d'arrivée

const DEF = {me:'', segments:[], removedBase:[], slotState:{}, loose:[], history:[], journal:[], parked:null, dest:null,
  model:{delay:45, delayN:0, tau:180, tauN:0}};

/* ---------- Données de la Ville d'Antibes ---------- */
// Sources open data (data.gouv.fr, Ville d'Antibes, licence ouverte) :
//  « Horodateurs à Antibes Juan-les-Pins » : 10 horodateurs rue Bricka (n° 250 à 259), payant 9h-12h et 14h-18h,
//    1 h gratuite par jour, gratuit samedi, dimanche et jours fériés, zone résidents 20 €/mois.
//  « Places de stationnement PMR » : 1 place au 12 rue Saint-Honorat.
//  « Stationnement à Antibes Juan-les-Pins » : 796 places sur voirie au centre de Juan-les-Pins.
const RULES = {
  'Rue Bricka': {paid:true, hours:[[9,12],[14,18]], freeWeekend:true, firstHourFree:true,
    residents:'20 €/mois ou 60 €/trimestre', src:'10 horodateurs (n° 250 à 259) recensés par la Ville d’Antibes'},
  'Rue Saint-Honorat': {paid:false, src:'Aucun horodateur recensé par la Ville d’Antibes : gratuit, à confirmer sur place'}
};
const PMR_POINTS = [{lat:43.5705576, lng:7.1069424, label:'Place PMR, 12 rue Saint-Honorat'}];
