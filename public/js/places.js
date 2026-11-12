/* PlaceLibre · registre des places partagées du pilote (rue Bricka et rue Saint-Honorat)

   Chaque place a un identifiant STABLE. Les signalements, le journal et le canal temps réel
   s’y réfèrent : un identifiant ne doit jamais changer de sens.

   Règles (détail dans docs/format-evenements.md) :
   1. Ne jamais renuméroter. Pour déplacer une place après vérification sur place,
      modifier lat, lng, cap ou l, et garder l’id.
   2. Nouvelle place : nouvel id jamais utilisé (ex. "b04-19" ou une nouvelle file "b19-0").
   3. Place supprimée : déplacer sa ligne dans PLACES_RETIREES, ne pas l’effacer.
      Son id ne sera jamais réattribué ; les événements qui la citent sont ignorés.
   4. Vérifier avec : node outils/verifier-places.js

   Champs : id · seg (file d’origine, voir BASE_SEGS) · rue · type (facultatif, voir TYPES :
   sans type, la place prend celui de sa file dans BASE_SEGS) ·
   lat, lng (centre de la place) · cap (orientation de la place, degrés, 0 = est, 90 = nord) ·
   l (longueur occupée, m).
   Version initiale : figée le 12/11/2026 à partir du découpage automatique des files b01 à b18,
   avec les identifiants déjà utilisés depuis le début du pilote. Positions à vérifier sur place. */
'use strict';

const PLACES = [
  {id:"b01-0", seg:"b01", rue:"Rue Bricka", lat:43.5715096, lng:7.1049961, cap:-7.0, l:6.50},
  {id:"b01-1", seg:"b01", rue:"Rue Bricka", lat:43.5715025, lng:7.1050761, cap:-7.0, l:6.50},
  {id:"b01-2", seg:"b01", rue:"Rue Bricka", lat:43.5714954, lng:7.1051560, cap:-7.0, l:6.50},
  {id:"b01-3", seg:"b01", rue:"Rue Bricka", lat:43.5714883, lng:7.1052360, cap:-7.0, l:6.50},
  {id:"b02-0", seg:"b02", rue:"Rue Bricka", lat:43.5714719, lng:7.1054301, cap:-6.9, l:7.29},
  {id:"b02-1", seg:"b02", rue:"Rue Bricka", lat:43.5714640, lng:7.1055198, cap:-6.9, l:7.29},
  {id:"b03-0", seg:"b03", rue:"Rue Bricka", lat:43.5714377, lng:7.1058094, cap:-6.8, l:5.55},
  {id:"b03-1", seg:"b03", rue:"Rue Bricka", lat:43.5714318, lng:7.1058777, cap:-6.8, l:5.55},
  {id:"b03-2", seg:"b03", rue:"Rue Bricka", lat:43.5714259, lng:7.1059460, cap:-6.8, l:5.55},
  {id:"b03-3", seg:"b03", rue:"Rue Bricka", lat:43.5714200, lng:7.1060143, cap:-6.8, l:5.55},
  {id:"b04-0", seg:"b04", rue:"Rue Bricka", lat:43.5714672, lng:7.1048329, cap:-6.9, l:5.34},
  {id:"b04-1", seg:"b04", rue:"Rue Bricka", lat:43.5714614, lng:7.1048986, cap:-6.9, l:5.34},
  {id:"b04-2", seg:"b04", rue:"Rue Bricka", lat:43.5714557, lng:7.1049643, cap:-6.9, l:5.34},
  {id:"b04-3", seg:"b04", rue:"Rue Bricka", lat:43.5714499, lng:7.1050300, cap:-6.9, l:5.34},
  {id:"b04-4", seg:"b04", rue:"Rue Bricka", lat:43.5714441, lng:7.1050957, cap:-6.9, l:5.34},
  {id:"b04-5", seg:"b04", rue:"Rue Bricka", lat:43.5714384, lng:7.1051614, cap:-6.9, l:5.34},
  {id:"b04-6", seg:"b04", rue:"Rue Bricka", lat:43.5714326, lng:7.1052271, cap:-6.9, l:5.34},
  {id:"b04-7", seg:"b04", rue:"Rue Bricka", lat:43.5714268, lng:7.1052928, cap:-6.9, l:5.34},
  {id:"b04-8", seg:"b04", rue:"Rue Bricka", lat:43.5714211, lng:7.1053585, cap:-6.9, l:5.34},
  {id:"b04-9", seg:"b04", rue:"Rue Bricka", lat:43.5714153, lng:7.1054242, cap:-6.9, l:5.34},
  {id:"b04-10", seg:"b04", rue:"Rue Bricka", lat:43.5714095, lng:7.1054899, cap:-6.9, l:5.34},
  {id:"b04-11", seg:"b04", rue:"Rue Bricka", lat:43.5714038, lng:7.1055556, cap:-6.9, l:5.34},
  {id:"b04-12", seg:"b04", rue:"Rue Bricka", lat:43.5713980, lng:7.1056213, cap:-6.9, l:5.34},
  {id:"b04-13", seg:"b04", rue:"Rue Bricka", lat:43.5713922, lng:7.1056870, cap:-6.9, l:5.34},
  {id:"b04-14", seg:"b04", rue:"Rue Bricka", lat:43.5713865, lng:7.1057527, cap:-6.9, l:5.34},
  {id:"b04-15", seg:"b04", rue:"Rue Bricka", lat:43.5713807, lng:7.1058184, cap:-6.9, l:5.34},
  {id:"b04-16", seg:"b04", rue:"Rue Bricka", lat:43.5713749, lng:7.1058841, cap:-6.9, l:5.34},
  {id:"b04-17", seg:"b04", rue:"Rue Bricka", lat:43.5713692, lng:7.1059498, cap:-6.9, l:5.34},
  {id:"b04-18", seg:"b04", rue:"Rue Bricka", lat:43.5713634, lng:7.1060155, cap:-6.9, l:5.34},
  {id:"b05-0", seg:"b05", rue:"Rue Bricka", lat:43.5716269, lng:7.1038705, cap:-6.1, l:5.91},
  {id:"b05-1", seg:"b05", rue:"Rue Bricka", lat:43.5716212, lng:7.1039433, cap:-6.1, l:5.91},
  {id:"b05-2", seg:"b05", rue:"Rue Bricka", lat:43.5716155, lng:7.1040162, cap:-6.1, l:5.91},
  {id:"b06-0", seg:"b06", rue:"Rue Bricka", lat:43.5715180, lng:7.1042944, cap:-6.4, l:6.33},
  {id:"b06-1", seg:"b06", rue:"Rue Bricka", lat:43.5715117, lng:7.1043725, cap:-6.4, l:6.33},
  {id:"b06-2", seg:"b06", rue:"Rue Bricka", lat:43.5715053, lng:7.1044505, cap:-6.4, l:6.33},
  {id:"b06-3", seg:"b06", rue:"Rue Bricka", lat:43.5714990, lng:7.1045285, cap:-6.4, l:6.33},
  {id:"b06-4", seg:"b06", rue:"Rue Bricka", lat:43.5714927, lng:7.1046066, cap:-6.4, l:6.33},
  {id:"b07-0", seg:"b07", rue:"Rue Bricka", lat:43.5717320, lng:7.1025925, cap:-6.9, l:5.91},
  {id:"b07-1", seg:"b07", rue:"Rue Bricka", lat:43.5717256, lng:7.1026653, cap:-6.9, l:5.91},
  {id:"b07-2", seg:"b07", rue:"Rue Bricka", lat:43.5717192, lng:7.1027381, cap:-6.9, l:5.91},
  {id:"b08-0", seg:"b08", rue:"Rue Bricka", lat:43.5716775, lng:7.1034094, cap:-7.8, l:5.56},
  {id:"b08-1", seg:"b08", rue:"Rue Bricka", lat:43.5716707, lng:7.1034777, cap:-7.8, l:5.56},
  {id:"b08-2", seg:"b08", rue:"Rue Bricka", lat:43.5716640, lng:7.1035460, cap:-7.8, l:5.56},
  {id:"b08-3", seg:"b08", rue:"Rue Bricka", lat:43.5716572, lng:7.1036143, cap:-7.8, l:5.56},
  {id:"b09-0", seg:"b09", rue:"Rue Bricka", lat:43.5713896, lng:7.1061932, cap:-6.6, l:6.02},
  {id:"b09-1", seg:"b09", rue:"Rue Bricka", lat:43.5713834, lng:7.1062673, cap:-6.6, l:6.02},
  {id:"b09-2", seg:"b09", rue:"Rue Bricka", lat:43.5713772, lng:7.1063414, cap:-6.6, l:6.02},
  {id:"b09-3", seg:"b09", rue:"Rue Bricka", lat:43.5713710, lng:7.1064155, cap:-6.6, l:6.02},
  {id:"b10-0", seg:"b10", rue:"Rue Bricka", lat:43.5713332, lng:7.1067387, cap:-6.5, l:5.91},
  {id:"b10-1", seg:"b10", rue:"Rue Bricka", lat:43.5713272, lng:7.1068115, cap:-6.5, l:5.91},
  {id:"b10-2", seg:"b10", rue:"Rue Bricka", lat:43.5713211, lng:7.1068843, cap:-6.5, l:5.91},
  {id:"b11-0", seg:"b11", rue:"Rue Bricka", lat:43.5713413, lng:7.1060931, cap:-6.1, l:5.37},
  {id:"b11-1", seg:"b11", rue:"Rue Bricka", lat:43.5713362, lng:7.1061593, cap:-6.1, l:5.37},
  {id:"b11-2", seg:"b11", rue:"Rue Bricka", lat:43.5713311, lng:7.1062255, cap:-6.1, l:5.37},
  {id:"b11-3", seg:"b11", rue:"Rue Bricka", lat:43.5713260, lng:7.1062917, cap:-6.1, l:5.37},
  {id:"b11-4", seg:"b11", rue:"Rue Bricka", lat:43.5713209, lng:7.1063579, cap:-6.1, l:5.37},
  {id:"b11-5", seg:"b11", rue:"Rue Bricka", lat:43.5713158, lng:7.1064241, cap:-6.1, l:5.37},
  {id:"b11-6", seg:"b11", rue:"Rue Bricka", lat:43.5713107, lng:7.1064903, cap:-6.1, l:5.37},
  {id:"b11-7", seg:"b11", rue:"Rue Bricka", lat:43.5713055, lng:7.1065566, cap:-6.1, l:5.37},
  {id:"b11-8", seg:"b11", rue:"Rue Bricka", lat:43.5713004, lng:7.1066228, cap:-6.1, l:5.37},
  {id:"b11-9", seg:"b11", rue:"Rue Bricka", lat:43.5712953, lng:7.1066890, cap:-6.1, l:5.37},
  {id:"b11-10", seg:"b11", rue:"Rue Bricka", lat:43.5712902, lng:7.1067552, cap:-6.1, l:5.37},
  {id:"b11-11", seg:"b11", rue:"Rue Bricka", lat:43.5712851, lng:7.1068214, cap:-6.1, l:5.37},
  {id:"b11-12", seg:"b11", rue:"Rue Bricka", lat:43.5712800, lng:7.1068876, cap:-6.1, l:5.37},
  {id:"b12-0", seg:"b12", rue:"Rue Saint-Honorat", lat:43.5709389, lng:7.1069962, cap:-90.0, l:7.80},
  {id:"b13-0", seg:"b13", rue:"Rue Saint-Honorat", lat:43.5709473, lng:7.1070680, cap:-90.0, l:10.44},
  {id:"b14-0", seg:"b14", rue:"Rue Saint-Honorat", lat:43.5707212, lng:7.1070103, cap:-87.8, l:6.42},
  {id:"b14-1", seg:"b14", rue:"Rue Saint-Honorat", lat:43.5706635, lng:7.1070133, cap:-87.8, l:6.42},
  {id:"b15-0", seg:"b15", rue:"Rue Saint-Honorat", lat:43.5707138, lng:7.1070797, cap:-89.1, l:8.06},
  {id:"b16-0", seg:"b16", rue:"Rue Saint-Honorat", lat:43.5711531, lng:7.1070060, cap:-89.4, l:5.86},
  {id:"b16-1", seg:"b16", rue:"Rue Saint-Honorat", lat:43.5711005, lng:7.1070067, cap:-89.4, l:5.86},
  {id:"b17-0", seg:"b17", rue:"Rue Saint-Honorat", lat:43.5703502, lng:7.1070044, cap:-94.6, l:5.47},
  {id:"b17-1", seg:"b17", rue:"Rue Saint-Honorat", lat:43.5703013, lng:7.1069989, cap:-94.6, l:5.47},
  {id:"b17-2", seg:"b17", rue:"Rue Saint-Honorat", lat:43.5702523, lng:7.1069935, cap:-94.6, l:5.47},
  {id:"b17-3", seg:"b17", rue:"Rue Saint-Honorat", lat:43.5702034, lng:7.1069880, cap:-94.6, l:5.47},
  {id:"b17-4", seg:"b17", rue:"Rue Saint-Honorat", lat:43.5701544, lng:7.1069825, cap:-94.6, l:5.47},
  {id:"b17-5", seg:"b17", rue:"Rue Saint-Honorat", lat:43.5701055, lng:7.1069771, cap:-94.6, l:5.47},
  {id:"b17-6", seg:"b17", rue:"Rue Saint-Honorat", lat:43.5700565, lng:7.1069716, cap:-94.6, l:5.47},
  {id:"b17-7", seg:"b17", rue:"Rue Saint-Honorat", lat:43.5700076, lng:7.1069661, cap:-94.6, l:5.47},
  {id:"b17-8", seg:"b17", rue:"Rue Saint-Honorat", lat:43.5699586, lng:7.1069607, cap:-94.6, l:5.47},
  {id:"b17-9", seg:"b17", rue:"Rue Saint-Honorat", lat:43.5699097, lng:7.1069552, cap:-94.6, l:5.47},
  {id:"b18-0", seg:"b18", rue:"Rue Saint-Honorat", lat:43.5703262, lng:7.1070900, cap:-94.7, l:5.79},
  {id:"b18-1", seg:"b18", rue:"Rue Saint-Honorat", lat:43.5702743, lng:7.1070841, cap:-94.7, l:5.79},
  {id:"b18-2", seg:"b18", rue:"Rue Saint-Honorat", lat:43.5702224, lng:7.1070782, cap:-94.7, l:5.79},
  {id:"b18-3", seg:"b18", rue:"Rue Saint-Honorat", lat:43.5701705, lng:7.1070723, cap:-94.7, l:5.79},
  {id:"b18-4", seg:"b18", rue:"Rue Saint-Honorat", lat:43.5701187, lng:7.1070664, cap:-94.7, l:5.79},
  {id:"b18-5", seg:"b18", rue:"Rue Saint-Honorat", lat:43.5700668, lng:7.1070605, cap:-94.7, l:5.79},
  {id:"b18-6", seg:"b18", rue:"Rue Saint-Honorat", lat:43.5700149, lng:7.1070546, cap:-94.7, l:5.79},
  {id:"b18-7", seg:"b18", rue:"Rue Saint-Honorat", lat:43.5699630, lng:7.1070487, cap:-94.7, l:5.79},
  {id:"b18-8", seg:"b18", rue:"Rue Saint-Honorat", lat:43.5699111, lng:7.1070428, cap:-94.7, l:5.79}
];

/* Places retirées : même format, plus un champ "motif" et la date. Leurs id restent réservés. */
const PLACES_RETIREES = [];
