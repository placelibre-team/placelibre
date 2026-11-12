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

console.log('OK : places inconnues et dates fausses refusées, Bluetooth valide accepté.');
