/* Validation des événements reçus sur le canal temps réel (public/js/sync.js).
   Aucun réseau : on appelle fromMsg() directement sur des messages simulés. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const store = {};
const ctx = vm.createContext({
  location:{search:'?canal=test'}, URLSearchParams, console,
  localStorage:{getItem:k => store[k] ?? null, setItem:(k, v) => { store[k] = v; }},
  document:{getElementById:() => ({})}
});
const js = f => fs.readFileSync('public/js/' + f, 'utf8');
vm.runInContext(['config.js', 'places.js', 'state.js', 'geometry.js', 'sync.js'].map(js).join('\n') +
  '\nrebuildSlots(); this.T = {fromMsg, PLACES};', ctx);
const {fromMsg, PLACES} = ctx.T;

const now = Date.now();
const msg = (ev, time) => ({event:'message', id:'m' + Math.random(), time:Math.floor((time || now)/1000), message:JSON.stringify(ev)});
const place = PLACES[0];

// Témoins : un événement normal et un "depart" Bluetooth sans ts (heure du serveur) sont acceptés.
assert.ok(fromMsg(msg({v:1, id:'ok1', slot:place.id, k:'free', ts:now - 1000})), 'événement valide refusé');
const bt = fromMsg(msg({k:'depart', lat:place.lat, lng:place.lng, by:'test'}));
assert.ok(bt && bt.k === 'soon' && bt.slot === place.id && Number.isFinite(bt.ts), 'depart Bluetooth valide refusé');

// 1. Place inconnue ou absente du registre : refusée.
assert.equal(fromMsg(msg({v:1, id:'x1', slot:'b99-0', k:'free', ts:now})), null, 'place inconnue acceptée');
assert.equal(fromMsg(msg({v:1, id:'x2', slot:'u123-0', k:'occ', ts:now})), null, 'place locale acceptée');

// 2. depart / arrive avec une date à plus de 10 min dans le futur : refusés.
const future = now + 11*60e3;
assert.equal(fromMsg(msg({k:'depart', lat:place.lat, lng:place.lng, ts:future})), null, 'depart dans le futur accepté');
assert.equal(fromMsg(msg({k:'arrive', lat:place.lat, lng:place.lng, ts:future})), null, 'arrive dans le futur accepté');
// et date non numérique : refusée (Number('demain') = NaN).
assert.equal(fromMsg(msg({k:'depart', lat:place.lat, lng:place.lng, ts:'demain'})), null, 'depart avec date non numérique accepté');

// 3. La conversion Bluetooth garde la version et l'identifiant du téléphone.
for(const k of ['depart', 'arrive']){
  const converted = fromMsg(msg({v:1, k, lat:place.lat, lng:place.lng, dev:'tel-bt'}));
  assert.equal(converted.v, 1); assert.equal(converted.dev, 'tel-bt');
  for(const v of [2, -1, 0, 1.5, '1']){
    assert.equal(fromMsg(msg({v, k, lat:place.lat, lng:place.lng})), null, 'version Bluetooth invalide acceptée : ' + v);
    assert.equal(fromMsg(msg({v, k:'free', slot:place.id, ts:now})), null, 'version normale invalide acceptée : ' + v);
  }
}

// 4. Une place Carto plus proche ne masque pas la place partagée (ni ne devient la cible).
ctx.near = {lat:place.lat + 0.000001, lng:place.lng};
vm.runInContext("SLOTS.push({id:'u-local-0', lat:near.lat, lng:near.lng});", ctx);
const near = fromMsg(msg({k:'arrive', lat:ctx.near.lat, lng:ctx.near.lng}));
assert.equal(near.slot, place.id, 'la place locale a masqué une place du registre');
assert.equal(fromMsg(msg({k:'arrive', lat:0, lng:0})), null, 'point hors pilote accepté');
assert.equal(fromMsg(msg({k:'arrive', lat:'Infinity', lng:place.lng})), null, 'coordonnée infinie acceptée');

console.log('OK : versions, dates et places validées ; Bluetooth garde dev et cherche dans le registre partagé.');
