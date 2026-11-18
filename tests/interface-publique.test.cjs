'use strict';
// Interface grand public : pas de prénoms de l'équipe, outils d'équipe cachés (mode équipe), prénom facultatif, accueil.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const racine = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(racine, 'public/index.html'), 'utf8');

// 1. Le HTML ne cite aucun membre de l'équipe, et les outils d'équipe sont dans le bloc caché.
assert.doesNotMatch(html, /\b(Shad|Tom|Stan|Antho(ny)?)\b/);
assert.match(html, /<div id="equipe" hidden>/);
const iEquipe = html.indexOf('<div id="equipe" hidden>');
for (const titre of ['Comment tester dans la rue', 'Canal du groupe', 'Partager ta cartographie', 'Journal des observations', 'Ce que l\'IA a appris'])
  assert.ok(html.indexOf('<h2>' + titre + '</h2>') > iEquipe, titre + ' doit être réservé à l’équipe');
for (const titre of ['Ton prénom (facultatif)', 'Tes données', 'Légende'])
  assert.ok(html.indexOf('<h2>' + titre + '</h2>') > 0 && html.indexOf('<h2>' + titre + '</h2>') < iEquipe, titre + ' doit rester public');
assert.match(html, /id="tDraw"[^>]*hidden/);

// 2. Comportement : 5 touches sur le logo, prénom, accueil.
function app(store = {}, search = '') {
  const nodes = {}, listeners = {};
  const document = { visibilityState: 'visible', querySelectorAll: () => [], addEventListener: (k, f) => (listeners[k] || (listeners[k] = [])).push(f),
    getElementById: id => nodes[id] || (nodes[id] = { hidden: true, value: '', handlers: {}, innerHTML: '', textContent: '', setAttribute() {},
      addEventListener(t, f) { this.handlers[t] = f; } }) };
  const toasts = [], clock = { t: Date.UTC(2026, 10, 18, 12, 0, 0) };
  class FakeDate extends Date { constructor(...a) { a.length ? super(...a) : super(clock.t); } static now() { return clock.t; } }
  const ctx = vm.createContext({ console, URLSearchParams, location: { search }, document, navigator: { userAgent: '' },
    localStorage: { getItem: k => k.startsWith('plj:welcome') ? '1' : store[k] || null, setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k] },
    Date: FakeDate, setTimeout: () => 0, clearTimeout() {}, syncOk: false, fly() {}, fetch() { throw Error('No network'); } });
  vm.runInContext(['config', 'places', 'state', 'geometry', 'model', 'predict', 'events', 'ui'].map(f => fs.readFileSync(path.join(racine, 'public/js/' + f + '.js'), 'utf8')).join('\n') + `
rebuildSlots(); renderList = () => {}; toast = m => TOASTS.push(m);
this.T = { get S() { return S; }, showWelcome, teamMode };`.replace('TOASTS', 'this.TOASTS'), Object.assign(ctx, { TOASTS: toasts }));
  return { T: ctx.T, nodes, store, toasts, clock };
}
{
  const a = app();
  assert.equal(a.T.teamMode(), false);
  assert.equal(a.nodes.equipe.hidden, true);
  assert.equal(a.nodes.tDraw.hidden, true);
  for (let i = 0; i < 4; i++) a.nodes.brand.handlers.click();
  assert.equal(a.T.teamMode(), false, '4 touches ne suffisent pas');
  a.clock.t += 5000;                                                   // trop lent : le compteur repart de 1
  a.nodes.brand.handlers.click();
  assert.equal(a.T.teamMode(), false, 'touches trop espacées');
  for (let i = 0; i < 5; i++) a.nodes.brand.handlers.click();
  assert.equal(a.T.teamMode(), true);
  assert.equal(a.nodes.equipe.hidden, false);
  assert.equal(a.nodes.tDraw.hidden, false);
  assert.equal(a.store['plj:equipe'], '1');
  a.nodes.btnEquipeOff.handlers.click();
  assert.equal(a.T.teamMode(), false);
  assert.equal(a.nodes.equipe.hidden, true);
  assert.equal(a.nodes.tDraw.hidden, true);
}
{
  assert.equal(app({}, '?equipe=1').T.teamMode(), true, '?equipe=1 active le mode équipe');
}
{
  const a = app();
  a.nodes.meName.value = '  Camille  '; a.nodes.meName.handlers.change();
  assert.equal(a.T.S.me, 'Camille');
  a.nodes.meName.value = ''; a.nodes.meName.handlers.change();
  assert.equal(a.T.S.me, '');
  assert.match(a.toasts.at(-1), /anonyme/);
  a.nodes.meName.value = 'x'.repeat(40); a.nodes.meName.handlers.change();
  assert.equal(a.T.S.me.length, 20);
}
{
  const a = app();
  a.T.showWelcome(0);
  const corps = a.nodes.wcBody.innerHTML;
  assert.match(corps, /facultatif/);
  assert.match(corps, /Aucun compte/);
  assert.doesNotMatch(corps, /\b(Shad|Tom|Stan)\b/);
  a.T.showWelcome(1);
  assert.match(a.nodes.wcBody.innerHTML, /Tu cherches/);
}
console.log('OK : interface grand public (aucun prénom d’équipe, mode équipe caché, prénom facultatif, accueil).');
