'use strict';
// Détection automatique dans l'app : signaux simulés rejoués -> fenêtre de confirmation -> signalement partagé.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');

function app(store = {}) {
  const nodes = {}, listeners = {}, shares = [], calls = [], cbs = [];
  const document = {
    visibilityState: 'visible',
    getElementById: id => nodes[id] || (nodes[id] = { hidden: true, handlers: {}, textContent: '', setAttribute() {},
      addEventListener(type, fn) { this.handlers[type] = fn; } }),
    querySelectorAll: () => [],
    addEventListener: (kind, fn) => (listeners[kind] || (listeners[kind] = [])).push(fn)
  };
  const signals = [];
  const native = {
    geolocation: { getCurrentPosition() {}, watchPosition: () => 1, clearWatch() {} },
    parkingSignals: {
      start: async () => { calls.push('start'); }, stop: async () => { calls.push('stop'); },
      status: async () => ({ running: true, location: 'always', motion: 'authorized' }),
      requestAccess: async () => { calls.push('access'); },
      drain: async after => ({ signals: signals.filter(s => s.seq > after) }),
      onSignal: cb => cbs.push(cb)
    }
  };
  const ctx = vm.createContext({ console, URLSearchParams, location: { search: '?canal=test' }, document, navigator: { userAgent: '' },
    localStorage: { getItem: k => k.startsWith('plj:welcome') ? '1' : store[k] || null, setItem: (k, v) => store[k] = v },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, syncOk: false, fly() {}, fetch() { throw Error('No network'); },
    share: (...args) => shares.push(args), PlaceLibreNative: native });
  vm.runInContext(['config', 'places', 'state', 'geometry', 'model', 'predict', 'events', 'ui', 'detection']
    .map(f => fs.readFileSync(path.join(__dirname, '../public/js/' + f + '.js'), 'utf8')).join('\n') + `
rebuildSlots(); render = () => {};
this.T = { get S() { return S; }, get slots() { return SLOTS; }, get conf() { return CONF; }, startDepart, doArrive };
`, ctx);
  return { T: ctx.T, nodes, listeners, shares, calls, signals, cbs, store };
}

// Trajet : CarPlay connecté, 150 s de route vers la place, arrêt, CarPlay coupé, marche qui s'éloigne.
function trajet(slot, fin) {
  const M = 1 / 111320, out = [], t0 = fin - 6 * 60e3;
  let seq = t0, t = t0;
  const add = o => out.push(Object.assign({ seq: ++seq, t }, o));
  add({ type: 'audio', connected: true, kind: 'carplay', dev: 'cp000001' });
  add({ type: 'motion', activity: 'automotive', conf: 2 });
  for (let i = 30; i >= 1; i--) { t += 5000; add({ type: 'position', lat: slot.lat - i * 50 * M, lng: slot.lng, acc: 8, speed: 10 }); }
  t += 5000; add({ type: 'position', lat: slot.lat, lng: slot.lng, acc: 8, speed: 0 });
  t += 5000; add({ type: 'audio', connected: false, kind: 'carplay', dev: 'cp000001' });
  t += 5000; add({ type: 'motion', activity: 'walking', conf: 2 });
  for (let i = 1; i <= 8; i++) { t += 5000; add({ type: 'position', lat: slot.lat + i * 7 * M, lng: slot.lng, acc: 8, speed: 1.4 }); }
  return out;
}

(async () => {
  // 1. Activation, rejeu des signaux, fenêtre de confirmation, validation.
  const a = app(), slot = a.T.slots[5];
  a.signals.push(...trajet(slot, Date.now() - 60e3));
  await a.nodes.detOn.handlers.click();
  assert.deepEqual(a.calls.slice(0, 2), ['access', 'start']);
  assert.equal(a.T.S.det.on, true);
  assert.equal(a.nodes.detectCard.hidden, false);
  const conf = a.T.conf;
  assert.ok(conf, 'la détection ouvre la fenêtre de confirmation');
  assert.equal(conf.src, 'detection');
  assert.equal(conf.kind, 'arrive');
  assert.match(a.nodes.confBody.innerHTML, /détectée à/);
  assert.ok(conf.near.some(x => x.s.id === slot.id), 'la place de l’arrêt est proposée');
  assert.equal(a.T.S.history.at(-1).ok, null);
  const click = target => a.listeners.click.forEach(f => f({ target }));
  click({ closest: sel => sel === '#confOk' ? {} : null });
  assert.equal(a.T.S.history.find(h => h.type === 'detect_arrive').ok, true);
  assert.equal(a.shares.at(-1)[2].src, 'detection');
  assert.ok(a.T.S.parked);
  // Les signaux déjà lus ne sont pas rejoués.
  const seq = a.T.S.det.seq;
  assert.equal(seq, a.signals.at(-1).seq);
  await a.cbs[0](a.signals.at(-1));
  assert.equal(a.T.conf, null);

  // 2. Refus : la réponse « non » est gardée pour mesurer la fiabilité, rien n'est partagé.
  const b = app(), slotB = b.T.slots[7];
  b.signals.push(...trajet(slotB, Date.now() - 60e3));
  await b.nodes.detOn.handlers.click();
  assert.ok(b.T.conf);
  const avant = b.shares.length;
  b.listeners.keydown.forEach(f => f({ key: 'Escape' }));
  assert.equal(b.T.S.history.find(h => h.type === 'detect_arrive').ok, false);
  assert.equal(b.shares.length, avant);
  assert.equal(b.T.S.parked, null);

  // 3. Partage automatique : seulement si la détection est très sûre, avec un seul clic de réglage.
  const c = app(), slotC = c.T.slots[9];
  c.signals.push(...trajet(slotC, Date.now() - 60e3));
  c.T.S.det.auto = true;
  await c.nodes.detOn.handlers.click();
  assert.equal(c.T.conf, null);
  assert.equal(c.shares.at(-1)[2].src, 'detection');
  assert.equal(c.T.S.parked.slotId, slotC.id);

  // 4. Désactivation : arrêt du plugin natif.
  await a.nodes.detOn.handlers.click();
  assert.equal(a.T.S.det.on, false);
  assert.equal(a.calls.at(-1), 'stop');

  // 5. Dans le navigateur (pas d'app iPhone), rien n'apparaît ni ne démarre.
  const web = vm.createContext({ console, document: { getElementById: () => null, addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/detection.js'), 'utf8')
    .replace("if(typeof module !== 'undefined') module.exports = {makeDetector, DET_CFG};", ''), web);
  console.log('OK : détection dans l’app (rejeu, confirmation, refus, partage automatique prudent, arrêt).');
})().catch(e => { console.error(e); process.exit(1); });
