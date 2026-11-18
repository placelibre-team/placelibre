/* Stockage du téléphone plein : allègement de l'historique ancien, conservation des signalements
   et de leur état, avertissement en cas d'échec. Aucun réseau. */
const fs = require('node:fs'), vm = require('node:vm');
const assert = require('node:assert/strict');

function telephone(limite){
  const store = {}, toasts = [];
  const ctx = vm.createContext({location:{search:'?canal=test', hash:'', pathname:'/'}, URLSearchParams, console, Math, JSON, Date,
    localStorage:{getItem:k => store[k] ?? null, setItem:(k, v) => {
      if(String(v).length > limite.n){ const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      store[k] = v; }},
    history:{replaceState:() => {}},
    document:{getElementById:() => ({hidden:true, textContent:''}), addEventListener:() => {}}});
  vm.runInContext(['config.js', 'places.js', 'state.js'].map(f => fs.readFileSync('public/js/' + f, 'utf8')).join('\n') +
    '\ntoast = m => __toasts.push(m);\nthis.app = {save, get S(){ return S; }, KEY};', Object.assign(ctx, {__toasts:toasts}));
  return {app:ctx.app, store, toasts};
}

const limite = {n:1e9};
const {app, store, toasts} = telephone(limite);
const now = Date.now();
for(let i = 0; i < 3000; i++) app.S.history.push({type:'depart', lat:43.57, lng:7.105, t:now - i*1000});
for(let i = 0; i < 50; i++) app.S.journal.push({id:'j' + i, t:now - i*1000, type:'depart', slot:'b04-12'});
app.S.outbox.push({v:1, id:'o1', slot:'b04-12', k:'free', ts:now});
assert.equal(app.save(), true); assert.equal(toasts.length, 0);

// 1. Presque plein : l'historique est allégé, la file et le journal restent, un message prévient
limite.n = store[app.KEY].length - 1000;
assert.equal(app.save(), true, 'l’enregistrement doit réussir après allègement');
assert.ok(app.S.history.length <= 300, 'historique non allégé');
assert.equal(app.S.journal.length, 50, 'le journal ne doit pas être touché');
assert.equal(app.S.outbox.length, 1, 'la file d’envoi ne doit pas être touchée');
assert.equal(toasts.length, 1); assert.match(toasts[0], /presque plein/);

// 2. Vraiment plein : échec signalé, une seule fois par minute
limite.n = 10;
assert.equal(app.save(), false);
assert.equal(toasts.length, 2, 'le message « plein » ne doit pas être masqué par « presque plein »');
assert.match(toasts[1], /plein : tes derniers signalements/);
assert.equal(app.save(), false);
assert.equal(toasts.length, 2, 'pas de répétition dans la minute');
assert.equal(app.S.outbox.length, 1, 'la file d’envoi reste en mémoire');

// 3. L'allègement doit conserver les preuves utilisées pour départager deux signalements.
const {telephone: telephoneSynchronise} = require('./aide-telephone.cjs');
const A = telephoneSynchronise(), B = telephoneSynchronise();
const place = A.app.PLACES[0].id;
function evenement(i, k, by){
  return {v:1, id:'saturation-' + i, slot:place, k, ts:now - 20000 + i*1000, by, dev:by, src:'signalement'};
}
function recevoirSur(tel, ev){
  return tel.app.receive({event:'message', id:ev.id, time:Math.floor(ev.ts/1000), message:JSON.stringify(ev)}, true);
}
for(const tel of [A, B]){
  recevoirSur(tel, evenement(0, 'occ', 'Stan'));
  for(let i = 1; i <= 10; i++) recevoirSur(tel, evenement(i, 'free', 'Tom'));
  tel.app.S.loose.push({id:'locale-recente', lat:43.57, lng:7.105, t:now, free:now});
}
assert.equal(A.app.slotState(place, now).k, 'occ');
assert.equal(B.app.slotState(place, now).k, 'occ');
for(let i = 0; i < 3000; i++) A.app.S.history.push({type:'depart', t:now - i*1000});
vm.runInContext('save()', A);
const quota = A.store[A.app.KEY].length - 1000;
const enregistrer = A.localStorage.setItem;
A.localStorage.setItem = (k, v) => {
  if(String(v).length > quota) throw new Error('QuotaExceededError');
  enregistrer(k, v);
};
const logAvant = JSON.stringify(A.app.S.slotLog);
const localesAvant = JSON.stringify(A.app.S.loose);
assert.equal(vm.runInContext('save()', A), true);
assert.equal(JSON.stringify(A.app.S.slotLog), logAvant, 'l’allègement a effacé une preuve de signalement');
assert.equal(JSON.stringify(A.app.S.loose), localesAvant, 'une place locale récente a disparu');

// La reprise d'un ancien message garde la déduplication et les observations inchangées.
const observationsAvant = JSON.stringify(A.app.S.obs);
assert.equal(recevoirSur(A, evenement(1, 'free', 'Tom')).applied, false);
assert.equal(JSON.stringify(A.app.S.obs), observationsAvant, 'un ancien événement a été appris deux fois');

// Un rechargement puis le même message doivent donner le même état sur les deux téléphones.
const apresRechargement = telephoneSynchronise({store:A.store});
for(const tel of [A, B, apresRechargement]){
  recevoirSur(tel, evenement(11, 'free', 'Tom'));
  assert.equal(tel.app.slotState(place, now).k, 'occ', 'une place occupée est devenue libre après allègement');
}
assert.equal(JSON.stringify(A.app.S.slotState[place]), JSON.stringify(B.app.S.slotState[place]));

// Même si l'enregistrement échoue encore, conserver les preuves et places locales en mémoire.
A.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
const logPlein = JSON.stringify(A.app.S.slotLog);
assert.equal(vm.runInContext('save()', A), false);
assert.equal(JSON.stringify(A.app.S.slotLog), logPlein);
assert.equal(JSON.stringify(A.app.S.loose), localesAvant);

console.log('OK : stockage plein → alerte, données de signalement conservées, convergence et déduplication après rechargement.');
