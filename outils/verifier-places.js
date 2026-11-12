/* PlaceLibre · vérifie le registre des places (public/js/places.js)
   Usage : node outils/verifier-places.js
   Contrôles : identifiants uniques et bien formés, aucun id retiré réutilisé, file connue,
   type connu, coordonnées dans la zone du pilote, orientation et longueur plausibles. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const ctx = {URLSearchParams, location:{search:''}};
vm.createContext(ctx);
vm.runInContext(js('config.js') + '\n' + js('places.js') +
  '\nthis.R = {PLACES, PLACES_RETIREES, BASE_SEGS, TYPES, BBOX};', ctx);
const {PLACES, PLACES_RETIREES, BASE_SEGS, TYPES, BBOX} = ctx.R;

const err = [], segs = new Set(BASE_SEGS.map(b => b.id)), seen = new Map();
const all = PLACES.map(p => ['active', p]).concat(PLACES_RETIREES.map(p => ['retirée', p]));
all.forEach(([etat, p]) => {
  const at = p.id + ' (' + etat + ')';
  if(!/^[a-z]\d{2}-\d+$/.test(p.id || '')) err.push(at + ' : identifiant mal formé, attendu "b04-12"');
  if(seen.has(p.id)) err.push(at + ' : identifiant déjà utilisé (' + seen.get(p.id) + ')');
  seen.set(p.id, etat);
  if(!segs.has(p.seg)) err.push(at + ' : file "' + p.seg + '" absente de BASE_SEGS');
  else if(!p.id.startsWith(p.seg + '-')) err.push(at + ' : l’id ne commence pas par sa file "' + p.seg + '-"');
  if(p.type != null && !TYPES[p.type]) err.push(at + ' : type inconnu "' + p.type + '"');
  if(!(p.lat > BBOX[0] && p.lat < BBOX[2] && p.lng > BBOX[1] && p.lng < BBOX[3])) err.push(at + ' : hors de la zone du pilote');
  if(!(p.cap >= -180 && p.cap <= 180)) err.push(at + ' : cap hors de [-180, 180]');
  if(!(p.l >= 2 && p.l <= 12)) err.push(at + ' : longueur ' + p.l + ' m peu plausible');
  if(etat === 'retirée' && !p.motif) err.push(at + ' : indiquer le motif du retrait');
});
if(err.length){ console.error(err.length + ' problème(s) :\n- ' + err.join('\n- ')); process.exit(1); }
console.log('Registre correct : ' + PLACES.length + ' places actives, ' + PLACES_RETIREES.length + ' retirée(s).');
