/* Invitations et isolation des canaux : exécution en VM, sans accès réseau. */
const fs = require('node:fs'), vm = require('node:vm');
const assert = require('node:assert/strict');
const SRC = fs.readFileSync('public/js/config.js', 'utf8');
const STATE = fs.readFileSync('public/js/state.js', 'utf8');
const UI = fs.readFileSync('public/js/ui.js', 'utf8').split('/* Canal du groupe :')[1];

function charger({search = '', hash = '', store = {}, stockageBloque = false, stockageMuet = false,
  historiqueBloque = false, avecEtat = false, avecUi = false, cryptoDisponible = true} = {}){
  const adresse = [], messages = [], elements = {};
  let recharges = 0, tirages = 0;
  const element = id => elements[id] || (elements[id] = {addEventListener:(ev, fn) => { element(id)[ev] = fn; }});
  const ctx = vm.createContext({URLSearchParams, console, Uint8Array,
    location:{search, hash, pathname:'/', origin:'https://exemple.invalid', reload:() => recharges++},
    history:{replaceState:(a, b, url) => { if(historiqueBloque) throw new Error('bloqué'); adresse.push(url); }},
    localStorage:{
      getItem:k => { if(stockageBloque) throw new Error('bloqué'); return store[k] ?? null; },
      setItem:(k, v) => { if(stockageBloque) throw new Error('bloqué'); if(!stockageMuet) store[k] = v; }},
    crypto:cryptoDisponible ? {getRandomValues:b => { tirages++; b.forEach((_, i) => { b[i] = i; }); return b; }} : undefined,
    $:element, toast:m => messages.push(m), navigator:{}});
  vm.runInContext(SRC + (avecEtat ? '\n' + STATE : '') +
    '\nthis.R = {BUS, BUS_PUBLIC, CLE_CANAL, CLE_STORAGE, CLE_PERSISTEE, TEST, KEY};' +
    (avecEtat ? '\nthis.R.etat = S;' : ''), ctx);
  if(avecUi) vm.runInContext('/* Canal du groupe :' + UI + '\nthis.R.lien = lienInvitation();', ctx);
  return Object.assign(ctx.R, {store, adresse, elements, messages, recharges:() => recharges, tirages:() => tirages});
}
const cle = 'k7mq2xw9pa4rt8nd3vb6hc5e'; // Clés fictives, jamais utilisées sur ntfy.
const autre = 'aaaaaaaaaaaaaaaaaaaaaaaa';

// Le canal et le stockage publics historiques sont conservés.
let r = charger();
assert.equal(r.BUS, r.BUS_PUBLIC); assert.equal(r.CLE_CANAL, '');
assert.equal(r.KEY, 'plj:v2');
assert.equal(charger({search:'?canal=test'}).BUS, r.BUS_PUBLIC + '-test');
assert.equal(charger({search:'?canal=test'}).KEY, 'plj:v2:test');

// Invitation, retrait de l'adresse, réouverture : même canal et même stockage.
r = charger({hash:'#cle=' + cle.toUpperCase()});
assert.equal(r.BUS, 'https://ntfy.sh/pl-' + cle);
assert.equal(r.store['plj:cle'], cle);
assert.deepEqual(r.adresse, ['/']);
assert.equal(r.CLE_PERSISTEE, true);
assert.equal(charger({store:r.store}).KEY, r.KEY);
assert.notEqual(r.KEY, 'plj:v2');

// Les données d'un groupe (y compris l'outbox de la PR de synchronisation) ne changent pas de canal.
const ancienEtat = JSON.stringify({journal:[{id:'ancien', t:Date.now()}], outbox:[{id:'ancien', ts:Date.now()}]});
const store = {'plj:v2':ancienEtat, [r.KEY]:ancienEtat};
let nouveau = charger({hash:'#cle=' + autre, store, avecEtat:true});
assert.equal(nouveau.etat.journal.length, 0);
assert.equal((nouveau.etat.outbox || []).length, 0);
assert.equal(store['plj:v2'], ancienEtat);
assert.equal(store[r.KEY], ancienEtat);
let retour = charger({hash:'#cle=' + cle, store, avecEtat:true});
assert.equal(retour.etat.journal[0].id, 'ancien');
assert.equal(retour.etat.outbox[0].id, 'ancien');

// Une invitation de test ne change ni la clé ni l'état du canal réel.
r = charger({search:'?canal=test', hash:'#cle=' + autre, store:{'plj:cle':cle}});
assert.equal(r.BUS, 'https://ntfy.sh/pl-' + autre + '-test');
assert.equal(r.store['plj:cle'], cle);
assert.equal(r.store['plj:cle:test'], autre);
assert.equal(charger({store:r.store}).BUS, 'https://ntfy.sh/pl-' + cle);
assert.equal(charger({search:'?canal=test', store:r.store}).BUS, r.BUS);
assert.notEqual(r.KEY, charger({hash:'#cle=' + autre}).KEY);
assert.equal(charger({search:'?canal=test', store:{'plj:cle':cle}}).BUS, 'https://ntfy.sh/pl-' + cle + '-test');

// Invitation en mémoire malgré stockage bloqué, avertissement et nettoyage indépendants.
r = charger({hash:'#cle=' + autre, store:{'plj:cle':cle}, stockageBloque:true, avecUi:true});
assert.equal(r.BUS, 'https://ntfy.sh/pl-' + autre);
assert.equal(r.CLE_PERSISTEE, false);
assert.deepEqual(r.adresse, ['/']);
assert.match(r.elements.canalAide.textContent, /n’a pas pu être conservée/);
assert.equal(charger({hash:'#cle=' + cle, historiqueBloque:true}).BUS, 'https://ntfy.sh/pl-' + cle);
r = charger({hash:'#cle=' + autre, store:{'plj:cle':cle}, stockageMuet:true});
assert.equal(r.CLE_CANAL, autre);
assert.equal(r.CLE_PERSISTEE, false);

// Les liens d'invitation ne reproduisent pas une action automatique ni une position GPS.
r = charger({search:'?canal=test&evt=depart&lat=43.57&lng=7.10', hash:'#cle=' + cle, avecUi:true});
assert.equal(r.lien, 'https://exemple.invalid/?canal=test#cle=' + cle);
assert.match(r.elements.canalEtat.innerHTML, /pas une authentification/);

// Deux appuis, générateur sécurisé ; les échecs ne rechargent jamais vers le canal public.
for(const options of [{stockageBloque:true}, {stockageMuet:true}, {cryptoDisponible:false}]){
  r = charger({...options, avecUi:true});
  r.elements.btnNewCanal.click(); r.elements.btnNewCanal.click();
  assert.equal(r.recharges(), 0);
  assert.equal(r.store['plj:cle'], undefined);
  assert.match(r.messages.at(-1), /impossible de créer/);
}
r = charger({search:'?canal=test', store:{'plj:cle':cle}, avecUi:true});
r.elements.btnNewCanal.click();
assert.equal(r.tirages(), 0);
r.elements.btnNewCanal.click();
assert.equal(r.tirages(), 1);
assert.equal(r.recharges(), 1);
assert.equal(r.store['plj:cle'], cle);
assert.match(r.store['plj:cle:test'], /^[0-9a-f]{32}$/);

// Clés invalides ignorées, aucun canal privé concret dans le code publié.
for(const h of ['#cle=abc', '#cle=' + cle + '/../x', '#cle=' + 'é'.repeat(24)]) assert.equal(charger({hash:h}).CLE_CANAL, '', h);
assert.equal(charger({store:{'plj:cle':'<script>'}}).CLE_CANAL, '');
for(const f of fs.readdirSync('public/js')) assert.ok(!/ntfy\.sh\/pl-[a-z0-9]{20}/.test(fs.readFileSync('public/js/' + f, 'utf8')), f);
console.log('OK : invitations, isolation par canal, test séparé, stockage bloqué et création sécurisée (hors ligne).');
