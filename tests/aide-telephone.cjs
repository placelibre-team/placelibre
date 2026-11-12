/* Outil de test : un « téléphone » PlaceLibre simulé, sans navigateur ni réseau.
   Charge les fichiers de l'appli nécessaires aux signalements dans un contexte isolé (canal de test),
   avec un stockage en mémoire et un fetch remplaçable. */
const fs = require('node:fs');
const vm = require('node:vm');

const FILES = ['config.js', 'places.js', 'state.js', 'geometry.js', 'model.js', 'journal.js', 'sync.js'];
const SRC = FILES.map(f => fs.readFileSync('public/js/' + f, 'utf8')).join('\n');

function telephone(opts = {}){
  const store = Object.assign({}, opts.store || {});
  const listeners = {};
  const ctx = vm.createContext({
    location:{search:'?canal=test'}, URLSearchParams, console, Date, Math, JSON,
    localStorage:{getItem:k => store[k] ?? null, setItem:(k, v) => { store[k] = v; }},
    document:{getElementById:() => ({hidden:true}), addEventListener:() => {}, visibilityState:'visible'},
    addEventListener:(t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    setInterval:() => 0, setTimeout, clearTimeout,
    fetch:async () => { throw new Error('hors ligne'); },
    render:() => {}, renderStatus:() => {}, toast:() => {}
  });
  vm.runInContext(SRC + '\nrebuildSlots();\nthis.app = {get S(){ return S; }, applyEv, foldSlot, share, receive, post, flushOutbox, PLACES, slotState, KEY, BUS};', ctx);
  ctx.store = store; ctx.listeners = listeners;
  return ctx;
}
module.exports = {telephone};
