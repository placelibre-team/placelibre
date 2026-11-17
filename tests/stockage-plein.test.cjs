/* Stockage du téléphone plein : l'appli allège ce qui ne sert qu'à l'affichage, garde la file d'envoi et
   le journal, et prévient l'utilisateur au lieu d'échouer en silence. Aucun réseau. */
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

console.log('OK : stockage plein → historique allégé, file d’envoi et journal gardés, utilisateur prévenu.');
