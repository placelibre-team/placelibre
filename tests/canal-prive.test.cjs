/* Canal privé par lien d'invitation (public/js/config.js) : la clé vient du lien, est gardée dans le téléphone,
   retirée de l'adresse, et le canal n'apparaît pas dans le code. */
const fs = require('node:fs'), vm = require('node:vm');
const assert = require('node:assert/strict');
const SRC = fs.readFileSync('public/js/config.js', 'utf8');

function charger({search = '', hash = '', store = {}} = {}){
  const adresse = [];
  const ctx = vm.createContext({URLSearchParams, console,
    location:{search, hash, pathname:'/'},
    history:{replaceState:(a, b, url) => adresse.push(url)},
    localStorage:{getItem:k => store[k] ?? null, setItem:(k, v) => { store[k] = v; }}});
  vm.runInContext(SRC + '\nthis.R = {BUS, BUS_PUBLIC, CLE_CANAL, TEST};', ctx);
  return Object.assign(ctx.R, {store, adresse});
}
const cle = 'k7mq2xw9pa4rt8nd3vb6hc5e';

// Sans clé : ancien canal public (et son canal de test)
let r = charger();
assert.equal(r.BUS, r.BUS_PUBLIC); assert.equal(r.CLE_CANAL, '');
assert.equal(charger({search:'?canal=test'}).BUS, r.BUS_PUBLIC + '-test');

// Lien d'invitation : canal privé, clé gardée, adresse nettoyée
r = charger({hash:'#cle=' + cle.toUpperCase()});
assert.equal(r.BUS, 'https://ntfy.sh/pl-' + cle);
assert.equal(r.store['plj:cle'], cle);
assert.deepEqual(r.adresse, ['/'], 'la clé doit disparaître de l’adresse');

// Rouverte plus tard sans le lien : la clé est retrouvée dans le téléphone ; le canal de test reste séparé
assert.equal(charger({store:{'plj:cle':cle}}).BUS, 'https://ntfy.sh/pl-' + cle);
r = charger({search:'?canal=test', store:{'plj:cle':cle}});
assert.equal(r.BUS, 'https://ntfy.sh/pl-' + cle + '-test'); assert.equal(r.TEST, true);

// Clé invalide (trop courte, caractères interdits) : ignorée
for(const h of ['#cle=abc', '#cle=' + cle + '/../x', '#cle=' + 'é'.repeat(24)]) assert.equal(charger({hash:h}).BUS, r.BUS_PUBLIC, h);
assert.equal(charger({store:{'plj:cle':'<script>'}}).BUS, r.BUS_PUBLIC);

// Aucun canal privé écrit dans le code publié
for(const f of fs.readdirSync('public/js')) assert.ok(!/ntfy\.sh\/pl-[a-z0-9]{20}/.test(fs.readFileSync('public/js/' + f, 'utf8')), f);

console.log('OK : canal privé par lien d’invitation, clé gardée dans le téléphone, aucun nom de canal privé dans le code.');
