'use strict';
// Recherche de destination : suggestions d'adresses, adresse hors zone, un seul barème pour les chances.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const racine = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(racine, 'public/index.html'), 'utf8');

// Le champ de recherche annonce ses suggestions, et le résultat de la destination est au-dessus des boutons.
assert.match(html, /id="q"[^>]*role="combobox"[^>]*aria-controls="sugg"/);
assert.match(html, /<ul id="sugg" role="listbox"[^>]*hidden>/);
assert.ok(html.indexOf('id="arrival"') > 0 && html.indexOf('id="arrival"') < html.indexOf('id="btnPark"'), 'la destination doit passer avant les boutons');

const nodes = {};
const document = { visibilityState: 'visible', querySelectorAll: () => [], addEventListener() {},
  getElementById: id => nodes[id] || (nodes[id] = { hidden: true, value: '', innerHTML: '', textContent: '', setAttribute() {}, addEventListener() {} }) };
const ctx = vm.createContext({ console, URLSearchParams, location: { search: '' }, document, navigator: { userAgent: '' },
  localStorage: { getItem: k => k.startsWith('plj:welcome') ? '1' : null, setItem() {}, removeItem() {} },
  setTimeout: () => 0, clearTimeout() {}, syncOk: false, fly() {}, fetch() { throw Error('No network'); } });
vm.runInContext(['config', 'places', 'state', 'geometry', 'model', 'predict', 'events', 'ui'].map(f => fs.readFileSync(path.join(racine, 'public/js/' + f + '.js'), 'utf8')).join('\n') + `
rebuildSlots(); renderList = () => {};
this.T = { nearestTracked, ZONE_M, difficulty, chanceColor };`, ctx);
const T = ctx.T;

// Une adresse dans la rue Bricka est dans la zone suivie ; Nice est loin.
const bricka = T.nearestTracked({ lat: 43.5714, lng: 7.1055 });
assert.ok(bricka && bricka.d < T.ZONE_M, 'rue Bricka dans la zone');
const nice = T.nearestTracked({ lat: 43.7034, lng: 7.2620 });
assert.ok(nice.d > T.ZONE_M, 'Nice hors de la zone : pas de chiffre inventé');
assert.ok(nice.d > 15000);

// Le mot (Facile / Possible / Difficile) et la couleur suivent les mêmes seuils.
const rows = p => ({ rows: [{ r: 100, p }] });
for (const [p, mot, couleur] of [[.7, 'Facile', 'var(--free)'], [.5, 'Facile', 'var(--free)'], [.4, 'Possible', 'var(--mid)'], [.25, 'Possible', 'var(--mid)'], [.2, 'Difficile', 'var(--soon)']]) {
  assert.equal(T.difficulty(rows(p)).t, mot, 'mot à ' + p);
  assert.equal(T.chanceColor(p), couleur, 'couleur à ' + p);
}
console.log('OK : suggestions, zone suivie et barème des chances');

// Panneau du bas : poignée accessible, trois hauteurs définies dans la feuille de style.
assert.match(html, /<div class="grip" id="sheetGrip" role="button" tabindex="0"/);
const css = fs.readFileSync(path.join(racine, 'public/css/app.css'), 'utf8');
for (const etat of ['peek', 'half', 'full']) assert.match(css, new RegExp('#app\\[data-sheet=' + etat + '\\]\\{--sh:'), 'hauteur ' + etat);
console.log('OK : panneau du bas à trois hauteurs');
