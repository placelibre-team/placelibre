/* Analyse d'un essai à deux téléphones : les journaux sont produits par le vrai code de l'appli
   (journalCSV) sur deux téléphones simulés, sans réseau, avec une horloge simulée. */
const fs = require('node:fs'), vm = require('node:vm'), os = require('node:os'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const A = require('../outils/analyser-essai.js');

const FILES = ['config.js', 'places.js', 'state.js', 'geometry.js', 'model.js', 'journal.js', 'sync.js'];
const SRC = FILES.filter(f => fs.existsSync('public/js/' + f)).map(f => fs.readFileSync('public/js/' + f, 'utf8')).join('\n');
const horloge = {t:new Date(2026, 10, 18, 10, 0, 0).getTime()};
class D extends Date { constructor(...a){ super(...(a.length ? a : [horloge.t])); } static now(){ return horloge.t; } }

function telephone(nom){
  const store = {};
  const ctx = vm.createContext({location:{search:'?canal=test'}, URLSearchParams, console, Math, JSON, Date:D,
    localStorage:{getItem:k => store[k] ?? null, setItem:(k, v) => { store[k] = v; }},
    document:{getElementById:() => ({hidden:true}), addEventListener:() => {}, visibilityState:'visible'},
    addEventListener:() => {}, setInterval:() => 0, setTimeout, clearTimeout,
    fetch:async () => ({ok:true, status:200, text:async () => ''}), render:() => {}, renderStatus:() => {}, toast:() => {}});
  vm.runInContext(SRC + '\nrebuildSlots(); S.me = ' + JSON.stringify(nom) + ';\nthis.app = {share, receive, journalCSV, answerCheck, pendingChecks, get S(){ return S; }};', ctx);
  return ctx.app;
}
const tom = telephone('Tom'), stan = telephone('Stan');
let n = 0;
function transmettre(ev, vers, delaiMs){        // le serveur relaie le message après un délai
  horloge.t += delaiMs;
  vers.receive({event:'message', id:'m' + (++n), time:Math.floor(horloge.t/1000), message:JSON.stringify(ev)}, true);
}
const avancer = ms => { horloge.t += ms; };

// Tom part de b04-12 (GPS ±6 m), Stan reçoit en 1,2 s
let ev = tom.share('b04-12', 'soon', {eta:horloge.t + 45e3, src:'bluetooth', acc:6}); transmettre(ev, stan, 1200);
avancer(60e3);
// Stan signale une place libre (±14 m), Tom reçoit en 0,8 s
ev = stan.share('b02-1', 'free', {src:'signalement', acc:14}); transmettre(ev, tom, 800);
avancer(20e3);
// Doublon : Tom signale la même place libre 20 s plus tard, reçu en 15 s (lent)
ev = tom.share('b02-1', 'free', {src:'signalement', acc:31}); transmettre(ev, stan, 15e3);
avancer(60e3);
// Message perdu : Stan se gare, mais Tom ne le reçoit jamais
stan.share('b01-0', 'occ', {src:'manuel', acc:5});
// Contrôles du départ de Tom : à 5 min libre (Tom), à 10 min reprise (Stan)
const dep = tom.S.journal.find(e => e.type === 'depart');
horloge.t = dep.t + 5*60e3; tom.answerCheck(dep.id, 5, 'libre');
const c5 = tom.S.journal.filter(e => e.type === 'controle').pop();
transmettre({v:1, id:c5.id, k:'ctl', slot:dep.slot, ts:c5.t, by:'Tom', src:'controle', dep:dep.id, h:5, etat:'libre'}, stan, 900);
horloge.t = dep.t + 10*60e3; stan.answerCheck(dep.id, 10, 'occupee');
// 30 min : personne ne répond → « non observé » automatique sur chaque téléphone
horloge.t = dep.t + 60*60e3; tom.pendingChecks(horloge.t); stan.pendingChecks(horloge.t);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'placelibre-essai-'));
const fTom = path.join(tmp, 'tom.csv'), fStan = path.join(tmp, 'stan.csv');
fs.writeFileSync(fTom, tom.journalCSV()); fs.writeFileSync(fStan, stan.journalCSV());

// 1. Lecture du CSV réel de l'appli (BOM, séparateur ;)
const lignes = A.lireCSV(fs.readFileSync(fTom, 'utf8'));
assert.ok(lignes.length >= 4 && lignes[0].id && lignes[0].type, 'CSV mal lu');
assert.throws(() => A.lireCSV('a;b\n1;2\n'), /journal PlaceLibre/);

// 2. Analyse
const tels = [{nom:'tom', evenements:A.lireCSV(fs.readFileSync(fTom, 'utf8')).map(A.evenement)},
              {nom:'stan', evenements:A.lireCSV(fs.readFileSync(fStan, 'utf8')).map(A.evenement)}];
const r = A.analyser(tels);
assert.equal(r.enDirect, 4, 'réceptions en direct');                   // départ, libre, libre (doublon), contrôle 5 min
assert.deepEqual(r.delais.slice().sort((a, b) => a - b), [800, 900, 1200, 15000]);
assert.equal(new Set(r.pertes.map(p => p.id)).size, 2, 'pertes');      // arrivée de Stan + contrôle 10 min non relayés
assert.ok(r.pertes.every(p => p.absent === 'tom' && p.emetteur === 'stan'));
assert.equal(r.doublons.length, 1, 'doublon b02-1');
assert.equal(r.doublons[0].a.place, 'b02-1');
assert.deepEqual(r.precisions.slice().sort((a, b) => a - b), [5, 6, 14, 31]);
assert.deepEqual(r.parHorizon[5], {libre:1, occupee:0, non_observe:0, contradictoire:0});
assert.deepEqual(r.parHorizon[10], {libre:0, occupee:1, non_observe:0, contradictoire:0});
assert.deepEqual(r.parHorizon[30], {libre:0, occupee:0, non_observe:1, contradictoire:0}, 'non observé compté une fois, pas une fois par téléphone');
assert.equal(r.parEmetteur.tom, 3); assert.equal(r.parEmetteur.stan, 3);

// 3. Compte rendu en ligne de commande
const sortie = path.join(tmp, 'cr.md');
execFileSync('node', ['outils/analyser-essai.js', fTom, fStan, '--noms', 'Tom,Stan', '--sortie', sortie]);
const cr = fs.readFileSync(sortie, 'utf8');
for(const attendu of ['# Essai à 2 téléphones', '| Délai médian | 1,1 s |', '| Délai maximal | 15 s |', 'Réceptions lentes',
  '| Signalements absents d’au moins un téléphone | 2 |', '| Précision > 25 m (place probablement fausse) | 25 % |', '| 30 min | 0 | 0 | 1 |'])
  assert.ok(cr.includes(attendu), 'compte rendu sans : ' + attendu + '\n' + cr);
if(process.env.GARDER) console.log(cr);
fs.rmSync(tmp, {recursive:true, force:true});

console.log('OK : délais, pertes, doublons, précision GPS et contrôles mesurés à partir de vrais journaux de l’appli.');
