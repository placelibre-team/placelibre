/* Vérification terrain : files en double, export du relevé et application au registre des places.
   L'application est testée sur une copie du dépôt (dossier temporaire) : le vrai registre n'est pas touché. */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const {execFileSync, spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const VERIF = require('../public/verification-terrain/verif.js');

function registre(racine){
  const c = {URLSearchParams, location:{search:''}}; vm.createContext(c);
  vm.runInContext(['public/js/config.js', 'public/js/places.js'].map(f => fs.readFileSync(path.join(racine, f), 'utf8')).join('\n') +
    '\nthis.R = {PLACES, PLACES_RETIREES, BBOX};', c);
  return JSON.parse(JSON.stringify(c.R));   // données simples (le bac à sable a ses propres tableaux)
}
const {PLACES, BBOX} = registre('.');

// 1. Les files parallèles à trancher sur place sont trouvées (b04 sur b01-b03, b11 sur b09-b10)
const paires = VERIF.filesParalleles(PLACES), cles = paires.map(p => p.a + '|' + p.b);
['b01|b04', 'b02|b04', 'b03|b04', 'b09|b11', 'b10|b11'].forEach(k => assert.ok(cles.includes(k), 'paire ' + k + ' non trouvée'));
assert.ok(paires.every(p => p.distance < 8), 'distance incohérente');

// 2. « Doublon : garder b01 » retire toute la file b04 ; changer d'avis annule ce retrait automatique
const rel = VERIF.nouveauReleve(), b01b04 = paires.find(p => p.a === 'b01' && p.b === 'b04');
rel.places['b01-0'] = {etat:'ok', t:1};
VERIF.deciderFiles(rel, b01b04, 'garder-a', PLACES);
const b04 = PLACES.filter(p => p.seg === 'b04');
assert.ok(b04.every(p => rel.places[p.id] && rel.places[p.id].etat === 'absente' && /doublon/.test(rel.places[p.id].motif)));
assert.equal(rel.places['b01-0'].etat, 'ok', 'la file gardée ne doit pas changer');
VERIF.deciderFiles(rel, b01b04, 'deux-cotes', PLACES);
assert.ok(b04.every(p => !rel.places[p.id]), 'retrait automatique non annulé');

// Les décisions sur les paires qui partagent b04 se cumulent ; l'ordre ne supprime pas un retrait restant.
const b02b04 = paires.find(p => p.a === 'b02' && p.b === 'b04');
const chevauche = VERIF.nouveauReleve();
const manuel = {etat:'deplacee', lat:43.571, lng:7.105, acc:3, note:'vérifiée individuellement', t:10};
chevauche.places['b04-0'] = {...manuel};
VERIF.deciderFiles(chevauche, b01b04, 'garder-a', PLACES);
VERIF.deciderFiles(chevauche, b02b04, 'garder-a', PLACES);
VERIF.deciderFiles(chevauche, b02b04, 'deux-cotes', PLACES);
assert.ok(b04.filter(p => p.id !== 'b04-0').every(p => chevauche.places[p.id]?.etat === 'absente'), 'le retrait demandé par b01 doit rester');
assert.deepEqual(chevauche.places['b04-0'], manuel, 'une décision groupée ne doit pas écraser une observation individuelle');
VERIF.deciderFiles(chevauche, b01b04, 'deux-cotes', PLACES);
assert.deepEqual(chevauche.places, {'b04-0':manuel}, 'annuler les deux décisions conserve uniquement l’observation individuelle');
// Le changement vers l'autre file ne laisse pas les deux files retirées par la même décision.
VERIF.deciderFiles(chevauche, b01b04, 'garder-a', PLACES);
VERIF.deciderFiles(chevauche, b01b04, 'garder-b', PLACES);
assert.ok(PLACES.filter(p => p.seg === 'b01').every(p => chevauche.places[p.id]?.etat === 'absente'));
assert.ok(b04.filter(p => p.id !== 'b04-0').every(p => !chevauche.places[p.id]));

// 3. Export valide ; export abîmé refusé
VERIF.deciderFiles(rel, b01b04, 'garder-a', PLACES);
const cible = PLACES.find(p => p.id === 'b12-0');
rel.places['b12-0'] = {etat:'deplacee', lat:cible.lat + 0.00002, lng:cible.lng, acc:4, t:2};
rel.places['b13-0'] = {etat:'ok', type:'pmr', t:3};
rel.places['b14-0'] = {etat:'deplacee', lat:cible.lat, lng:cible.lng, acc:15, t:4};   // GPS trop imprécis
rel.places['b17-0'] = {etat:'absente', motif:'entrée de garage', t:5};
rel.regles.push({rue:'Rue Bricka', regle:'payant', horaires:'9h-12h, 14h-18h', t:6});
const ex = VERIF.exporter(rel, PLACES);
assert.deepEqual(VERIF.verifierExport(ex, PLACES), []);
assert.ok(VERIF.verifierExport({format:'autre'}, PLACES).length);
assert.ok(VERIF.verifierExport(Object.assign({}, ex, {places:[{id:'b99-0', etat:'ok'}]}), PLACES).some(p => /inconnue/.test(p)));
assert.ok(VERIF.verifierExport(Object.assign({}, ex, {places:[{id:'b01-0', etat:'peut-être'}]}), PLACES).some(p => /état/.test(p)));

// Tout export mal formé est refusé proprement, y compris les champs qui alimentent le compte rendu.
const invalides = [];
const invalide = (nom, modifier) => {
  const copie = structuredClone(ex); modifier(copie);
  assert.ok(VERIF.verifierExport(copie, PLACES, BBOX).length, nom + ' devrait être refusé');
  invalides.push([nom, copie]);
};
for(const v of [undefined, 0, -1, 2, '1']) invalide('version ' + v, x => { x.v = v; });
for(const champ of ['places', 'files', 'ajouts', 'regles']){
  for(const valeur of [null, {}, [null], [false]]) invalide(champ + ' mal formé', x => { x[champ] = valeur; });
}
invalide('identifiant répété', x => { x.places.push({...x.places[0]}); });
invalide('date de début invalide', x => { x.debut = '../../essai'; });
invalide('date impossible', x => { x.exporte = '2026-02-30T00:00:00.000Z'; });
invalide('horodatage absent', x => { delete x.places[0].t; });
invalide('horodatage hors limite', x => { x.places[0].t = 1e20; });
invalide('motif objet', x => { x.places[0].motif = {}; });
invalide('état objet', x => { x.places[0].etat = {toString:null}; });
invalide('paire inconnue', x => { x.files[0].paire = 'b00|b99'; });
invalide('décision inconnue', x => { x.files[0].decision = 'effacer'; });
invalide('paire répétée', x => { x.files.push({...x.files[0]}); });
invalide('règle vide', x => { x.regles[0].regle = ' '; });
invalide('type tarif incorrect', x => { x.regles[0].tarif = {}; });
const positionValide = {rue:'Rue Bricka', type:'pay', lat:cible.lat, lng:cible.lng, acc:3, t:6};
const avecAjout = {...ex, ajouts:[positionValide]};
assert.deepEqual(VERIF.verifierExport(avecAjout, PLACES, BBOX), []);
for(const [nom, coord] of [
  ['latitude hors Terre', {lat:100}], ['longitude hors Terre', {lng:181}],
  ['position hors pilote', {lat:0, lng:0}], ['arrondi sur frontière du pilote', {lat:BBOX[0] + 1e-8}],
  ['précision absente', {acc:undefined}],
  ['précision négative', {acc:-1}], ['coordonnée texte', {lat:String(cible.lat)}]
]){
  invalide('déplacement : ' + nom, x => { Object.assign(x.places.find(p => p.id === 'b12-0'), coord); });
  invalide('ajout : ' + nom, x => { x.ajouts = [{...positionValide, ...coord}]; });
}
assert.deepEqual(VERIF.verifierExport(ex, PLACES, BBOX), []);

// 4. Application sur une copie du dépôt
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'placelibre-verif-'));
for(const f of ['public/js/config.js', 'public/js/places.js', 'public/verification-terrain/verif.js',
  'outils/appliquer-verification.js', 'outils/verifier-places.js']){
  fs.mkdirSync(path.join(tmp, path.dirname(f)), {recursive:true}); fs.copyFileSync(f, path.join(tmp, f));
}
const releve = path.join(tmp, 'releve.json'); fs.writeFileSync(releve, JSON.stringify(ex));
const lancer = (...a) => execFileSync('node', [path.join(tmp, 'outils/appliquer-verification.js'), releve, ...a], {encoding:'utf8'});

// Même --forcer ne doit jamais permettre un import invalide ou toucher un fichier.
const registreAvant = fs.readFileSync(path.join(tmp, 'public/js/places.js'), 'utf8');
for(const [nom, invalide] of invalides){
  fs.writeFileSync(releve, JSON.stringify(invalide));
  const refus = spawnSync('node', [path.join(tmp, 'outils/appliquer-verification.js'), releve, '--ecrire', '--forcer'], {encoding:'utf8'});
  assert.equal(refus.status, 1, nom + ' : code de sortie incorrect');
  assert.match(refus.stderr, /Relevé refusé/, nom + ' : rejet explicite attendu');
  assert.equal(fs.readFileSync(path.join(tmp, 'public/js/places.js'), 'utf8'), registreAvant, nom + ' a modifié le registre');
  assert.equal(fs.existsSync(path.join(tmp, 'docs')), false, nom + ' a créé un compte rendu');
}
fs.writeFileSync(releve, JSON.stringify(ex));

const apercu = lancer();
assert.match(apercu, /Aperçu seulement/);
assert.equal(fs.readFileSync(path.join(tmp, 'public/js/places.js'), 'utf8'), fs.readFileSync('public/js/places.js', 'utf8'), 'l’aperçu ne doit rien modifier');

lancer('--ecrire');
const apres = registre(tmp), parId = Object.fromEntries(apres.PLACES.map(p => [p.id, p]));
assert.equal(apres.PLACES.length, PLACES.length - b04.length - 1, 'nombre de places actives');
assert.equal(apres.PLACES_RETIREES.length, b04.length + 1, 'places retirées');
assert.ok(apres.PLACES_RETIREES.every(p => p.motif && p.date), 'motif et date obligatoires');
assert.ok(!parId['b04-0'] && apres.PLACES_RETIREES.some(p => p.id === 'b04-0'), 'b04-0 doit être retirée, pas effacée');
assert.equal(parId['b12-0'].lat, +(cible.lat + 0.00002).toFixed(7), 'déplacement non appliqué');
assert.equal(parId['b12-0'].cap, cible.cap, 'l’orientation doit rester');
assert.equal(parId['b13-0'].type, 'pmr', 'type non corrigé');
const b14 = PLACES.find(p => p.id === 'b14-0');
assert.equal(parId['b14-0'].lat, b14.lat, 'un GPS à ±15 m ne doit pas déplacer la place');
// ordre et identifiants conservés pour toutes les autres places
assert.deepEqual(apres.PLACES.map(p => p.id), PLACES.map(p => p.id).filter(id => parId[id]));
execFileSync('node', [path.join(tmp, 'outils/verifier-places.js')], {encoding:'utf8'});      // le registre reste valide
const cr = fs.readFileSync(path.join(tmp, 'docs/verification-terrain', ex.debut.slice(0, 10) + '.md'), 'utf8');
assert.match(cr, /b01 \/ b04 : doublon/); assert.match(cr, /9h-12h, 14h-18h/); assert.match(cr, /b14-0 : déplacement ignoré/);

// 5. Réappliquer le même relevé ne retire rien deux fois
lancer('--ecrire');
const encore = registre(tmp);
assert.equal(encore.PLACES_RETIREES.length, apres.PLACES_RETIREES.length);
fs.rmSync(tmp, {recursive:true, force:true});

console.log('OK : doublons tranchés, relevé exporté et contrôlé, registre mis à jour sans renumérotation ni perte d’identifiant.');
