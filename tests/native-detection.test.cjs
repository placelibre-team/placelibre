'use strict';
// Adaptateur JavaScript du plugin natif et cohérence du projet Xcode pour la détection du stationnement.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const racine = path.resolve(__dirname, '..');

(async () => {
  const { parkingSignals } = await import('../native/services.mjs');
  const listeners = [], statuses = [{ location: 'unknown', motion: 'unknown' }, { location: 'whenInUse', motion: 'authorized' }];
  const plugin = {
    start: async () => 'start', stop: async () => 'stop', requestAccess: async () => {},
    status: async () => statuses.length > 1 ? statuses.shift() : statuses[0],
    drain: async ({ after }) => ({ signals: [{ seq: after + 1 }] }),
    addListener: (name, cb) => { assert.equal(name, 'signal'); listeners.push(cb); return Promise.resolve({}); }
  };
  const api = parkingSignals(plugin);
  const realTimeout = global.setTimeout; global.setTimeout = fn => realTimeout(fn, 0);
  const status = await api.requestAccess();
  global.setTimeout = realTimeout;
  assert.equal(status.location, 'whenInUse');
  assert.deepEqual(await api.drain(41), { signals: [{ seq: 42 }] });
  assert.deepEqual(await api.drain(NaN), { signals: [{ seq: 1 }] });
  api.onSignal(() => {}); assert.equal(listeners.length, 1);
  const vide = parkingSignals({ drain: async () => null });
  assert.deepEqual(await vide.drain(0), { signals: [] });

  // Projet Xcode : fichiers référencés et compilés, contrôleur principal, permissions et arrière-plan.
  const xcode = fs.readFileSync(path.join(racine, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  for (const f of ['ParkingSignalsPlugin.swift', 'MainViewController.swift']) {
    assert.ok(fs.existsSync(path.join(racine, 'ios/App/App', f)), f + ' absent');
    assert.ok(xcode.includes(f + ' in Sources'), f + ' n’est pas compilé par Xcode');
    assert.ok(xcode.includes('path = ' + f), f + ' n’est pas dans le groupe du projet');
  }
  const storyboard = fs.readFileSync(path.join(racine, 'ios/App/App/Base.lproj/Main.storyboard'), 'utf8');
  assert.match(storyboard, /customClass="MainViewController" customModule="App"/);
  const plist = fs.readFileSync(path.join(racine, 'ios/App/App/Info.plist'), 'utf8');
  for (const cle of ['NSMotionUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSLocationWhenInUseUsageDescription'])
    assert.ok(plist.includes('<key>' + cle + '</key>'), cle + ' manque dans Info.plist');
  assert.match(plist, /<key>UIBackgroundModes<\/key>\s*<array>\s*<string>location<\/string>\s*<\/array>/);
  const swift = fs.readFileSync(path.join(racine, 'ios/App/App/ParkingSignalsPlugin.swift'), 'utf8');
  assert.ok(swift.includes('jsName = "ParkingSignals"') && fs.readFileSync(path.join(racine, 'native/bridge.mjs'), 'utf8').includes("registerPlugin('ParkingSignals')"));
  // Le plugin n'envoie rien sur le réseau et ne garde aucun nom d'appareil.
  assert.ok(!/URLSession|URLRequest|http:\/\/|https:\/\//.test(swift), 'le plugin ne doit pas accéder au réseau');
  assert.ok(!/portName|\.name\b/.test(swift), 'aucun nom d’appareil Bluetooth ne doit être lu');
  console.log('OK : adaptateur natif de détection et projet Xcode cohérents (plugin, contrôleur, permissions, aucun accès réseau).');
})().catch(e => { console.error(e); process.exit(1); });
