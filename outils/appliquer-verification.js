/* PlaceLibre · applique un relevé de vérification terrain au registre des places
   Usage :
     node outils/appliquer-verification.js relevé.json            → aperçu, rien n'est modifié
     node outils/appliquer-verification.js relevé.json --ecrire   → met à jour public/js/places.js
                                                                     et écrit un compte rendu dans docs/verification-terrain/
   Option : --forcer applique aussi les déplacements dont la précision GPS dépasse 8 m (déconseillé).

   Ce que fait l'application (règles de public/js/places.js) :
   - place « existe » : rien ne change, sauf le type s'il a été corrigé ;
   - place « déplacée » : nouvelles lat / lng, même identifiant (jamais de renumérotation) ;
   - place « pas une place » (ou doublon) : déplacée dans PLACES_RETIREES avec motif et date, id réservé ;
   - places ajoutées et panneaux : listés dans le compte rendu, à intégrer à la main (il faut une orientation
     et une longueur pour créer une place). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const VERIF = require('../public/verification-terrain/verif.js');

const ROOT = path.join(__dirname, '..');
const PLACES_JS = path.join(ROOT, 'public', 'js', 'places.js');
const args = process.argv.slice(2), fichier = args.find(a => !a.startsWith('--'));
const ECRIRE = args.includes('--ecrire'), FORCER = args.includes('--forcer');
if(!fichier){ console.error('Usage : node outils/appliquer-verification.js relevé.json [--ecrire] [--forcer]'); process.exit(2); }

function chargerRegistre(){
  const ctx = {URLSearchParams, location:{search:''}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'config.js'), 'utf8') + '\n' + fs.readFileSync(PLACES_JS, 'utf8') +
    '\nthis.R = {PLACES, PLACES_RETIREES, BASE_SEGS, TYPES, BBOX};', ctx);
  return JSON.parse(JSON.stringify(ctx.R));
}

let ex;
try{ ex = JSON.parse(fs.readFileSync(fichier, 'utf8')); }
catch(e){ console.error('Lecture impossible de ' + fichier + ' : ' + e.message); process.exit(2); }

const R = chargerRegistre();
const problemes = VERIF.verifierExport(ex, R.PLACES.concat(R.PLACES_RETIREES), R.BBOX);
const dejaRetirees = new Set(R.PLACES_RETIREES.map(p => p.id));
if(problemes.length){ console.error('Relevé refusé :\n- ' + problemes.join('\n- ')); process.exit(1); }

const jour = t => new Date(t ?? Date.now()).toISOString().slice(0, 10);
const actions = {type:[], deplacee:[], retiree:[], ignoree:[]};
const parId = Object.fromEntries(R.PLACES.map(p => [p.id, p]));
const SEG_TYPE = Object.fromEntries(R.BASE_SEGS.map(b => [b.id, b.type]));

ex.places.forEach(v => {
  if(dejaRetirees.has(v.id)){ actions.ignoree.push(v.id + ' : déjà retirée du registre'); return; }
  const p = parId[v.id];
  if(v.type && v.type !== (p.type || SEG_TYPE[p.seg])){ actions.type.push(v.id + ' : ' + (p.type || SEG_TYPE[p.seg]) + ' → ' + v.type); p.type = v.type; }
  if(v.etat === 'deplacee'){
    if(v.acc > VERIF.PRECISION_MAX && !FORCER){ actions.ignoree.push(v.id + ' : déplacement ignoré, précision ±' + v.acc + ' m (relancer avec --forcer si sûr)'); return; }
    const ecart = Math.round(VERIF.dist(p, v));
    actions.deplacee.push(v.id + ' : déplacée de ' + ecart + ' m (précision ±' + v.acc + ' m)' + (ecart > 25 ? ' ⚠ écart important, à revérifier' : ''));
    p.lat = +(+v.lat).toFixed(7); p.lng = +(+v.lng).toFixed(7);
  }
  if(v.etat === 'absente'){
    actions.retiree.push(v.id + ' : ' + v.motif);
    p.motif = String(v.motif).slice(0, 160); p.date = jour(v.t); p.retiree = true;
  }
});

const actives = R.PLACES.filter(p => !p.retiree);
const retirees = R.PLACES_RETIREES.concat(R.PLACES.filter(p => p.retiree).map(p => { delete p.retiree; return p; }));

// Réécriture de places.js : même en-tête, même format de ligne
function ligne(p){
  const parts = ['id:' + JSON.stringify(p.id), 'seg:' + JSON.stringify(p.seg), 'rue:' + JSON.stringify(p.rue)];
  if(p.type) parts.push('type:' + JSON.stringify(p.type));
  parts.push('lat:' + Number(p.lat).toFixed(7), 'lng:' + Number(p.lng).toFixed(7), 'cap:' + Number(p.cap).toFixed(1), 'l:' + Number(p.l).toFixed(2));
  if(p.motif) parts.push('motif:' + JSON.stringify(p.motif), 'date:' + JSON.stringify(p.date || jour()));
  return '  {' + parts.join(', ') + '}';
}
const src = fs.readFileSync(PLACES_JS, 'utf8');
const entete = src.slice(0, src.indexOf('const PLACES = ['));
const nouveau = entete + 'const PLACES = [\n' + actives.map(ligne).join(',\n') + '\n];\n\n' +
  '/* Places retirées : même format, plus un champ "motif" et la date. Leurs id restent réservés. */\n' +
  'const PLACES_RETIREES = [' + (retirees.length ? '\n' + retirees.map(ligne).join(',\n') + '\n' : '') + '];\n';

// Compte rendu
const decisions = {'deux-cotes':'deux côtés de la rue', 'garder-a':'doublon : garder la 1re file', 'garder-b':'doublon : garder la 2e file'};
const liste = (titre, l) => '## ' + titre + ' (' + l.length + ')\n\n' + (l.length ? l.map(x => '- ' + x).join('\n') : '- aucun') + '\n';
const cr = '# Vérification terrain du ' + ex.debut.slice(0, 10) + '\n\n' +
  'Relevé exporté le ' + ex.exporte.slice(0, 16).replace('T', ' ') + ' UTC' + (ex.releveur ? ' par ' + ex.releveur : '') + '. ' +
  ex.places.length + ' places relevées sur ' + ex.nbPlacesRegistre + ' au registre.\n\n' +
  liste('Files parallèles tranchées', (ex.files || []).map(f => f.paire.replace('|', ' / ') + ' : ' + (decisions[f.decision] || f.decision))) + '\n' +
  liste('Places retirées', actions.retiree) + '\n' + liste('Places déplacées', actions.deplacee) + '\n' +
  liste('Types corrigés', actions.type) + '\n' + liste('Non appliqué', actions.ignoree) + '\n' +
  liste('Places à ajouter à la main (créer un id neuf, orientation et longueur)', (ex.ajouts || []).map(a =>
    a.rue + ' · ' + a.type + ' · ' + a.lat + ', ' + a.lng + ' (±' + a.acc + ' m)' + (a.note ? ' · ' + a.note : ''))) + '\n' +
  liste('Panneaux relevés', (ex.regles || []).map(r => r.rue + (r.troncon ? ' (' + r.troncon + ')' : '') + ' : ' + r.regle +
    (r.horaires ? ' · ' + r.horaires : '') + (r.tarif ? ' · ' + r.tarif : '') + (r.saison ? ' · saisonnier' : '')));

console.log(cr);
console.log('Registre : ' + R.PLACES.length + ' → ' + actives.length + ' places actives, ' + retirees.length + ' retirée(s).');
if(!ECRIRE){ console.log('\nAperçu seulement. Ajouter --ecrire pour mettre à jour public/js/places.js.'); process.exit(0); }

fs.writeFileSync(PLACES_JS, nouveau);
const dossier = path.join(ROOT, 'docs', 'verification-terrain');
fs.mkdirSync(dossier, {recursive:true});
const crFichier = path.join(dossier, ex.debut.slice(0, 10) + '.md');
fs.writeFileSync(crFichier, cr);
console.log('\nÉcrit : ' + path.relative(ROOT, PLACES_JS) + ' et ' + path.relative(ROOT, crFichier) +
  '\nÀ faire ensuite : node outils/verifier-places.js, puis une pull request.');
