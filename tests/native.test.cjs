'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const tick = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const { invitationPath, PUBLIC_URL, foregroundGeolocation, fileExporter } = await import('../native/services.mjs');
  const key = 'abcdef0123456789abcdef0123456789';
  assert.equal(invitationPath(PUBLIC_URL + '?canal=test#cle=' + key), '/?canal=test#cle=' + key);
  assert.equal(invitationPath(PUBLIC_URL + '#cle=' + key.toUpperCase()), '/#cle=' + key);
  for (const value of ['javascript:alert(1)', 'capacitor://localhost/#cle=' + key,
    PUBLIC_URL + '#cle=short', PUBLIC_URL + '?evt=depart#cle=' + key,
    PUBLIC_URL + '?canal=test&canal=test#cle=' + key,
    'https://example.com/#cle=' + key, PUBLIC_URL + 'autre/#cle=' + key,
    'https://user@taupe-axolotl-872d89.netlify.app/#cle=' + key]) {
    assert.throws(() => invitationPath(value));
  }

  // Pause pendant l'inscription asynchrone : le vieux suivi est annulé et ses
  // callbacks sont ignorés, même s'il répond après une nouvelle inscription.
  const registrations = [], cleared = [], received = [], errors = [];
  const position = { coords: { latitude: 43.57, longitude: 7.1, accuracy: 5 } };
  const plugin = {
    getCurrentPosition: async () => position,
    watchPosition: (options, callback) => new Promise(resolve => registrations.push({ callback, resolve })),
    clearWatch: async ({ id }) => { cleared.push(id); }
  };
  const geo = foregroundGeolocation(plugin);
  await new Promise((resolve, reject) => geo.getCurrentPosition(p => { assert.equal(p, position); resolve(); }, reject));
  const token = geo.watchPosition(p => received.push(p), e => errors.push(e));
  assert.equal(typeof token, 'number');
  geo.setActive(false);
  geo.setActive(true);
  registrations[1].resolve('new');
  registrations[0].resolve('old');
  await tick();
  assert.deepEqual(cleared, ['old']);
  registrations[0].callback(position);
  assert.equal(received.length, 0);
  registrations[1].callback(position);
  assert.equal(received.length, 1);
  geo.setActive(false);
  registrations[1].callback(position);
  assert.equal(received.length, 1);
  assert.deepEqual(cleared, ['old', 'new']);
  geo.clearWatch(token);
  geo.setActive(true);
  assert.equal(registrations.length, 2);
  const pending = geo.watchPosition(() => {});
  geo.clearWatch(pending);
  registrations[2].resolve('cancelled');
  await tick();
  assert.ok(cleared.includes('cancelled'));
  const denied = foregroundGeolocation({ ...plugin, watchPosition: async () => { throw Error('denied'); } });
  denied.watchPosition(() => {}, e => errors.push(e.message));
  await tick();
  assert.ok(errors.includes('denied'));

  // Export iOS : fichier local UTF-8, partage de l'URI, nettoyage aussi à l'annulation.
  const writes = [], deletions = [], shares = [];
  let cancel = false;
  const exporter = fileExporter({
    writeFile: async data => { writes.push(data); return { uri: 'file:///cache/journal.csv' }; },
    deleteFile: async data => { deletions.push(data); }
  }, { share: async data => { shares.push(data); if (cancel) throw Error('cancel'); } }, 'CACHE', 'utf8');
  const name = 'placelibre-journal-2026-11-18-test.csv';
  assert.equal(await exporter('rue;état\nBricka;libre', name), true);
  assert.equal(writes[0].encoding, 'utf8');
  assert.deepEqual(shares[0].files, ['file:///cache/journal.csv']);
  assert.equal(deletions.length, 1);
  cancel = true;
  await assert.rejects(exporter('data', name), /cancel/);
  assert.equal(deletions.length, 2);
  await assert.rejects(exporter('data', '../escape.csv'), /invalide/);
  assert.equal(writes.length, 2);

  // Charge le vrai code de l'interface avec puis sans le pont natif.
  function app(native) {
    const nodes = {}, calls = [];
    const document = {
      getElementById: id => nodes[id] ||= { hidden: true, value: '', handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } },
      querySelectorAll: () => [], addEventListener() {}
    };
    const nativeBridge = {
      publicUrl: PUBLIC_URL, invitationPath, geolocation: {
        getCurrentPosition: success => { calls.push('gps'); success(position); },
        watchPosition: () => { calls.push('watch'); return 7; }
      },
      copyText: async value => calls.push(['copy', value]),
      share: async options => calls.push(['share', options.url]),
      exportCsv: async (csv, file) => calls.push(['csv', file])
    };
    const ctx = vm.createContext({
      console, URLSearchParams, location: { origin: native ? 'capacitor://localhost' : new URL(PUBLIC_URL).origin, pathname: '/', search: '?canal=test', hash: '#cle=' + key },
      history: { replaceState() {} }, document, navigator: { userAgent: 'iPhone', clipboard: { writeText: async text => calls.push(['webCopy', text]) } },
      matchMedia: () => ({ matches: false }),
      localStorage: { getItem: k => k.startsWith('plj:welcome') ? '1' : null, setItem() {} },
      setTimeout: () => 0, clearTimeout() {}, fetch() { throw Error('No network'); },
      ...(native ? { PlaceLibreNative: nativeBridge } : {})
    });
    vm.runInContext(['config', 'places', 'state', 'geometry', 'model', 'journal', 'predict', 'events', 'ui']
      .map(file => fs.readFileSync(path.join(__dirname, '../public/js/' + file + '.js'), 'utf8')).join('\n') +
      '\nthis.T={getPos,copyText,startWatch,lienInvitation,isIosBrowser};', ctx);
    return { ctx, nodes, calls };
  }
  const native = app(true);
  assert.equal((await native.ctx.T.getPos()).lat, 43.57);
  native.ctx.T.startWatch(); native.ctx.T.startWatch();
  assert.equal(native.calls.filter(c => c === 'watch').length, 1);
  await native.ctx.T.copyText('test');
  assert.ok(native.calls.some(c => c[0] === 'copy'));
  assert.equal(native.ctx.T.isIosBrowser(), false);
  assert.equal(native.ctx.T.lienInvitation(), PUBLIC_URL + '?canal=test#cle=' + key);
  assert.equal(native.nodes.nativeGroup.hidden, false);
  await native.nodes.btnInvite.handlers.click();
  assert.ok(native.calls.some(c => c[0] === 'share' && c[1].startsWith('https://')));
  await native.nodes.btnCsv.handlers.click();
  assert.ok(native.calls.some(c => c[0] === 'csv' && c[1].endsWith('-test.csv')));
  native.ctx.document.getElementById('nativeInvitation').value = PUBLIC_URL + '?canal=test#cle=' + key;
  native.nodes.btnJoinNative.handlers.click();
  assert.equal(native.ctx.location.href, '/?canal=test#cle=' + key);
  const web = app(false);
  await web.ctx.T.copyText('web');
  assert.deepEqual(web.calls, [['webCopy', 'web']]);
  assert.equal(web.ctx.T.isIosBrowser(), true);
  assert.equal(web.ctx.T.lienInvitation(), PUBLIC_URL + '?canal=test#cle=' + key);
  console.log('OK : GPS natif, cycle arrière-plan, partage, export CSV, invitations et repli navigateur.');
})().catch(error => { console.error(error); process.exit(1); });
