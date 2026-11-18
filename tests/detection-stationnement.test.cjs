'use strict';
// Détection automatique « voiture garée / repart » : scénarios sans iPhone, signaux simulés et horodatés.
const assert = require('node:assert/strict');
const { makeDetector, DET_CFG } = require('../public/js/detection.js');

const T0 = Date.UTC(2026, 10, 18, 9, 0, 0);
const M = 1 / 111320;                         // degrés de latitude par mètre
const sec = n => n * 1000;

function banc(opts) {
  const events = [], cars = (opts && opts.cars) || {}, personal = (opts && opts.personal) || {};
  const det = makeDetector({ cars, personal, emit: e => events.push(e) });
  let clock = T0, lat = 43.5700, lng = 7.1100;
  const api = {
    events, cars, personal, det,
    get clock() { return clock; }, get lat() { return lat; },
    at(s) { clock = s; return api; },
    wait(s) { clock += sec(s); return api; },
    motion(activity, conf = 2) { det.feed({ type: 'motion', t: clock, activity, conf }); return api; },
    audio(connected, dev = 'carA', kind = 'bluetooth') { det.feed({ type: 'audio', t: clock, connected, kind, dev }); return api; },
    pos(speed, acc = 8, dLat = 0) { lat += dLat * M; det.feed({ type: 'position', t: clock, lat, lng, acc, speed }); return api; },
    // Conduite de n secondes à 10 m/s, un point toutes les 5 s.
    roule(n) { this.motion('automotive'); for (let i = 0; i < n / 5; i++) { this.wait(5); this.pos(10, 8, 50); } return api; },
    // Arrêt, sortie de voiture, puis marche qui s'éloigne (m par pas de 5 s).
    marche(n, pas = 7) { this.motion('walking'); for (let i = 0; i < n / 5; i++) { this.wait(5); this.pos(1.4, 8, pas); } return api; }
  };
  return api;
}
const parked = b => b.events.filter(e => e.type === 'parked');
const departing = b => b.events.filter(e => e.type === 'departing');

// 1. Cycle complet : la voiture est reconnue après 2 conduites, puis garée = Bluetooth coupé + marche.
{
  const b = banc();
  for (let i = 0; i < 2; i++) {                       // 2 trajets d'apprentissage (déconnexion ignorée : voiture pas encore connue)
    b.audio(true, 'carA').roule(150).pos(0).wait(10).audio(false, 'carA').marche(40);
    assert.equal(parked(b).length, 0, 'pas de détection tant que le Bluetooth de la voiture n’est pas appris');
    b.motion('stationary').wait(600).pos(0);
    b.det.reset();
  }
  assert.equal(b.cars.carA.n, 2, 'carA est reconnue comme voiture après 2 conduites');
  b.wait(300).audio(true, 'carA').roule(150).pos(0, 6);
  const arret = b.clock;
  b.wait(5).audio(false, 'carA').wait(5).marche(40);
  const p = parked(b);
  assert.equal(p.length, 1);
  assert.ok(p[0].conf >= 0.6 && p[0].why.includes('bluetooth') && p[0].why.includes('marche'));
  assert.ok(p[0].margin >= 6 && p[0].margin <= 25, 'marge ' + p[0].margin);
  assert.ok(p[0].t <= arret + sec(11) && p[0].t >= arret - sec(1));
  assert.ok(Math.abs(p[0].lat - b.lat) > 0, 'la position est celle de l’arrêt, pas celle de la marche');
  // Pas de doublon si la marche continue.
  b.marche(60);
  assert.equal(parked(b).length, 1);
}

// 2. La marche seule (bus, taxi, sortie à un feu) ne déclenche jamais.
{
  const b = banc();
  b.roule(300).pos(0).wait(10).marche(120);
  assert.equal(parked(b).length, 0);
}

// 3. Bluetooth seul sans mouvement de marche ni éloignement : pas assez d'indices.
{
  const b = banc({ cars: { carA: { n: 2 } } });
  b.audio(true, 'carA').roule(150).pos(0).wait(5).audio(false, 'carA').wait(200).pos(0);
  assert.equal(parked(b).length, 0, 'une coupure Bluetooth seule ne suffit pas');
}

// 4. Bluetooth qui saute pendant que la voiture roule encore : fausse alerte ignorée.
{
  const b = banc({ cars: { carA: { n: 2 } } });
  b.audio(true, 'carA').roule(150).audio(false, 'carA').roule(120).marche(0);
  assert.equal(parked(b).length, 0);
}

// 5. Des écouteurs (appareil connecté pendant la marche) ne sont jamais pris pour la voiture.
{
  const b = banc();
  b.audio(true, 'pods', 'bluetooth').marche(200);
  assert.equal(b.personal.pods, true);
  for (let i = 0; i < 3; i++) { b.audio(true, 'pods').roule(150).pos(0).wait(10).audio(false, 'pods').marche(40); b.motion('stationary').wait(600).pos(0); b.det.reset(); }
  assert.equal(b.cars.pods, undefined);
  assert.equal(parked(b).length, 0);
}

// 6. CarPlay est reconnu tout de suite, sans apprentissage.
{
  const b = banc();
  b.audio(true, 'cp', 'carplay').roule(120).pos(0).wait(5).audio(false, 'cp', 'carplay').wait(5).marche(40);
  assert.equal(parked(b).length, 1);
}

// 7. Départ : la voiture garée « repart » quand son Bluetooth se reconnecte à côté d'elle.
{
  const b = banc({ cars: { carA: { n: 2 } } });
  b.audio(true, 'carA').roule(150).pos(0).wait(5).audio(false, 'carA').wait(5).marche(40);
  const garee = parked(b)[0];
  assert.ok(garee);
  b.motion('stationary').wait(1800);
  b.det.feed({ type: 'position', t: b.clock, lat: garee.lat + 20 * M, lng: 7.1100, acc: 10, speed: 0 });  // à 20 m
  b.wait(20).audio(true, 'carA');
  const d = departing(b);
  assert.equal(d.length, 1);
  assert.ok(d[0].conf >= 0.8 && Math.abs(d[0].lat - garee.lat) < 1e-9);
}

// 8. Même reconnexion Bluetooth loin de la voiture garée (ex. voiture de quelqu'un d'autre) : pas de départ.
{
  const b = banc({ cars: { carA: { n: 2 } } });
  b.audio(true, 'carA').roule(150).pos(0).wait(5).audio(false, 'carA').wait(5).marche(40);
  const garee = parked(b)[0];
  b.motion('stationary').wait(1800);
  b.det.feed({ type: 'position', t: b.clock, lat: garee.lat + 2000 * M, lng: 7.1100, acc: 10, speed: 0 });
  b.wait(20).audio(true, 'carA');
  assert.equal(departing(b).length, 0);
}

// 9. Rejouer les mêmes signaux (arrière-plan, puis ouverture de l'app) donne les mêmes décisions.
{
  const a = banc({ cars: { carA: { n: 2 } } });
  const log = [];
  const brut = makeDetector({ cars: { carA: { n: 2 } }, emit: e => log.push(e) });
  const origFeed = a.det.feed;
  const signaux = [];
  a.det.feed = s => { signaux.push(s); return origFeed(s); };
  a.audio(true, 'carA').roule(150).pos(0).wait(5).audio(false, 'carA').wait(5).marche(40);
  signaux.forEach(s => brut.feed(s));
  assert.equal(a.events.length, log.length);
  assert.deepEqual(log.filter(e => e.type === 'parked').map(e => [e.lat, e.lng, e.margin]),
                   a.events.filter(e => e.type === 'parked').map(e => [e.lat, e.lng, e.margin]));
}

// 10. Hors de la fenêtre de 4 min, pas de détection tardive.
{
  const b = banc({ cars: { carA: { n: 2 } } });
  b.audio(true, 'carA').roule(150).pos(0).wait(5).audio(false, 'carA').wait(DET_CFG.windowSec + 60).marche(40);
  assert.equal(parked(b).length, 0);
}

// 11. Signaux invalides ou désordonnés : aucune exception.
{
  const b = banc();
  b.det.feed({ type: 'position', t: NaN });
  b.det.feed({ type: 'position', t: T0, lat: 'x', lng: null });
  b.det.feed({ type: 'audio', t: T0 });
  b.det.feed({ type: 'inconnu', t: T0 });
  b.det.feed({ type: 'motion', t: T0 - 5000, activity: 'walking', conf: 2 });
  assert.equal(b.events.length, 0);
}

console.log('OK : détection du stationnement (apprentissage de la voiture, signaux combinés, départ, rejeu, fausses alertes).');
