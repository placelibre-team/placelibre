/* PlaceLibre · détection automatique « voiture garée / voiture qui repart » (app iPhone)
   Le téléphone enregistre trois sortes de signaux horodatés (voir ios/App/App/ParkingSignalsPlugin.swift) :
     { type:'motion',   t, activity:'automotive'|'walking'|'running'|'cycling'|'stationary'|'unknown', conf:0|1|2 }
     { type:'audio',    t, connected:bool, kind:'carplay'|'bluetooth'|'other', dev:'a1b2c3d4' }   (dev = empreinte, jamais un nom)
     { type:'position', t, lat, lng, acc, speed }                                              (speed en m/s, null si inconnue)
   Le moteur ci-dessous est pur : il ne touche ni à l'écran ni au réseau, et rejouer les mêmes signaux dans
   le même ordre donne les mêmes décisions (important : l'iPhone peut suspendre la page en arrière-plan).
   Une voiture est « garée » seulement si au moins deux indices concordent :
     A. le Bluetooth/CarPlay de LA voiture se déconnecte (0,50) ;
     B. le téléphone détecte de la marche après la conduite (0,35) ;
     C. la personne s'éloigne à pied du point d'arrêt (0,15).
   Seuil 0,60 : A+B, A+C ou A+B+C. La marche seule (bus, taxi, feu rouge) ne suffit jamais.
   Les chiffres ci-dessous sont des réglages de départ, à ajuster avec les essais réels. */
'use strict';

const DET_CFG = {
  driveSpeed: 4,          // m/s (≈ 15 km/h) : au-dessus, on considère que la voiture roule
  driveMinSec: 60,        // il faut rouler au moins 1 min pour que « conduite » commence
  driveGapSec: 90,        // sans indice de conduite pendant 90 s, une conduite en préparation est abandonnée
  walkConfirmSec: 15,     // marche détectée pendant au moins 15 s
  walkMaxSpeed: 2.5,      // m/s : au-dessus, ce n'est plus de la marche
  awayMeters: 25,         // éloignement à pied du point d'arrêt
  windowSec: 240,         // après la sortie de voiture, 4 min pour rassembler les indices
  minConf: 0.6,
  weights: {audio: 0.5, walk: 0.35, away: 0.15},
  learnDriveSec: 120,     // une conduite d'au moins 2 min compte pour reconnaître le Bluetooth de la voiture
  learnDrives: 2,         // …deux conduites avec le même appareil : c'est la voiture
  personalWalkSec: 120,   // appareil connecté pendant 2 min de marche : écouteurs, pas la voiture
  departWithinM: 80,      // « repart » : le téléphone doit être à moins de 80 m de la voiture garée
  recentPosSec: 180,      // position utilisable pour ce contrôle : moins de 3 min
  keepMin: 20             // durée de conservation des positions en mémoire
};

function makeDetector(opts){
  opts = opts || {};
  const cfg = Object.assign({}, DET_CFG, opts.cfg || {});
  const cars = opts.cars || {}, personal = opts.personal || {};      // objets partagés : l'appelant les enregistre
  const emit = opts.emit || (() => {}), changed = opts.changed || (() => {});
  const R = 6371000, rad = Math.PI/180;
  const dist = (a, b) => {
    const dLat = (b.lat - a.lat)*rad, dLng = (b.lng - a.lng)*rad;
    const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(x));
  };
  const isCar = (dev, kind) => kind === 'carplay' || (!!cars[dev] && cars[dev].n >= cfg.learnDrives && !personal[dev]);

  let pos = [];                       // positions récentes
  let act = {kind:'unknown', conf:0, t:0};
  const devs = {};                    // dev -> {kind, since}
  let phase = 'idle';                 // idle | driving | parked | departing
  let ev0 = null, evLast = 0;         // début / dernier indice de conduite
  let drive = null;                   // {since, devs:{dev:true}}
  let out = null;                     // sortie de voiture : {audioOff, walkSince}
  let parkedAt = null;                // {lat, lng, t}
  let lastT = 0;
  const personalSec = {};

  const driveEvidence = s => (s.type === 'motion' && s.activity === 'automotive' && s.conf >= 1) ||
    (s.type === 'position' && typeof s.speed === 'number' && s.speed >= cfg.driveSpeed);

  function recentPos(t){
    for(let i = pos.length - 1; i >= 0; i--) if(t - pos[i].t <= cfg.recentPosSec*1000) return pos[i]; else break;
    return null;
  }
  function reset(p){ phase = p || 'idle'; ev0 = null; drive = null; out = null; }

  function beginDrive(t){
    phase = 'driving'; out = null;
    drive = {since: ev0, devs: {}, off: {}, kinds: {}, learned: false};
    Object.keys(devs).forEach(d => { if(devs[d].since <= ev0 + 30e3){ drive.devs[d] = true; drive.kinds[d] = devs[d].kind; } });
    emit({type:'drive-start', t});
  }
  function endDriveLearning(tWalk){
    // Appareil connecté pendant toute une vraie conduite, encore connecté (ou déconnecté juste à l'arrêt) : candidat « voiture ».
    if(!drive || drive.learned || (tWalk - drive.since)/1000 < cfg.learnDriveSec) return;
    drive.learned = true;
    Object.keys(drive.devs).forEach(d => {
      const off = drive.off[d];
      const still = !!devs[d] || (off && off >= tWalk - 120e3 && off <= tWalk + 60e3);
      if(!still || personal[d] || (devs[d] ? devs[d].kind : drive.kinds[d]) !== 'bluetooth') return;
      const c = cars[d] || (cars[d] = {n:0});
      c.n++; c.last = tWalk; changed();
    });
  }
  // Meilleure estimation du point où la voiture s'est arrêtée, avec une marge d'erreur.
  function carPoint(tStop){
    let p = null;
    for(let i = pos.length - 1; i >= 0; i--) if(pos[i].t <= tStop){ p = pos[i]; break; }
    if(!p) return null;
    const gap = Math.min((tStop - p.t)/1000, 120), v = Math.max(p.speed > 0 ? p.speed : 0, 0.5);
    const acc = Math.max(p.acc || 15, 5);
    return {lat:p.lat, lng:p.lng, t:p.t, margin: Math.round(Math.sqrt(acc*acc + (gap*v)*(gap*v)))};
  }
  function score(t){
    if(!out) return null;
    const tStop = Math.min(out.audioOff || Infinity, out.walkSince || Infinity);
    if(!isFinite(tStop)) return null;
    const pt = carPoint(tStop); if(!pt) return null;
    const why = [];
    let conf = 0;
    if(out.audioOff){ conf += cfg.weights.audio; why.push('bluetooth'); }
    const walking = act.kind === 'walking' || act.kind === 'running';
    if(out.walkSince && walking && t - out.walkSince >= cfg.walkConfirmSec*1000){ conf += cfg.weights.walk; why.push('marche'); }
    // Éloignement : seulement des positions à vitesse de marche, jamais celles d'une voiture qui roule encore.
    const last = pos.length ? pos[pos.length - 1] : null;
    const aPied = last && last.t > tStop && act.kind !== 'automotive' && (last.speed === null || last.speed <= cfg.walkMaxSpeed);
    if(aPied && dist(last, pt) >= cfg.awayMeters){ conf += cfg.weights.away; why.push('éloignement'); }
    return {conf:Math.round(conf*100)/100, why, pt, tStop};
  }

  function feed(s){
    const t = s.t;
    if(!Number.isFinite(t)) return;
    const dt = Math.max(0, Math.min(t - lastT, 60e3)); // pour apprendre les appareils « personnels »
    if(lastT && (act.kind === 'walking' || act.kind === 'running') && act.conf >= 1){
      Object.keys(devs).forEach(d => {
        if(devs[d].kind !== 'bluetooth') return;
        personalSec[d] = (personalSec[d] || 0) + dt/1000;
        if(personalSec[d] >= cfg.personalWalkSec && !personal[d]){ personal[d] = true; delete cars[d]; changed(); }
      });
    }
    lastT = Math.max(lastT, t);

    if(s.type === 'position'){
      if(Number.isFinite(s.lat) && Number.isFinite(s.lng)){
        pos.push({t, lat:s.lat, lng:s.lng, acc:s.acc, speed: typeof s.speed === 'number' && s.speed >= 0 ? s.speed : null});
        pos = pos.filter(p => t - p.t <= cfg.keepMin*60e3).slice(-400);
      }
    } else if(s.type === 'motion'){
      act = {kind:s.activity, conf:s.conf == null ? 1 : s.conf, t};
    } else if(s.type === 'audio' && s.dev){
      if(s.connected){
        devs[s.dev] = {kind:s.kind, since:t};
        if(phase === 'parked' && isCar(s.dev, s.kind)){
          const p = recentPos(t);
          if(p && parkedAt && dist(p, parkedAt) <= cfg.departWithinM){
            emit({type:'departing', t, lat:parkedAt.lat, lng:parkedAt.lng, margin:10, conf:0.8, why:['bluetooth']});
            phase = 'departing'; ev0 = null; evLast = t;
          }
        }
      } else {
        const was = devs[s.dev]; delete devs[s.dev];
        if(phase === 'driving' && drive && was){
          drive.off[s.dev] = t;
          if(isCar(s.dev, was.kind || s.kind) && !(out && out.audioOff)){ out = out || {}; out.audioOff = t; }
        }
      }
    }

    // Indices de conduite
    if(driveEvidence(s)){
      evLast = t;
      if(phase === 'idle' || phase === 'parked' || phase === 'departing'){
        if(phase === 'parked'){
          const p = recentPos(t);
          if(parkedAt && p && dist(p, parkedAt) <= cfg.departWithinM*2){
            emit({type:'departing', t, lat:parkedAt.lat, lng:parkedAt.lng, margin:20, conf:0.6, why:['mouvement']});
          }
          phase = 'idle';
        }
        if(ev0 === null) ev0 = t;
        if(t - ev0 >= cfg.driveMinSec*1000) beginDrive(t);
      } else if(phase === 'driving'){
        // la voiture roule encore : une sortie en préparation était une fausse alerte
        if(out && (s.type === 'motion' || (s.type === 'position' && s.speed >= cfg.driveSpeed))){
          if(out.walkSince && t - out.walkSince > 20e3) out = null;
          else if(out.audioOff && t - out.audioOff > 30e3) out = null;
        }
      }
    } else if(ev0 !== null && phase === 'idle' && t - evLast > cfg.driveGapSec*1000){
      ev0 = null;
    }

    // Sortie de voiture : marche détectée après la conduite
    if(phase === 'driving' && s.type === 'motion' && (s.activity === 'walking' || s.activity === 'running') && s.conf >= 1){
      out = out || {};
      if(!out.walkSince) out.walkSince = t;
    }

    // Décision
    if(phase === 'driving' && out){
      if(out.walkSince && t - out.walkSince >= cfg.walkConfirmSec*1000 && (act.kind === 'walking' || act.kind === 'running')) endDriveLearning(out.walkSince);
      const first = Math.min(out.audioOff || Infinity, out.walkSince || Infinity);
      if(isFinite(first) && t - first > cfg.windowSec*1000){
        out = null;                                           // trop tard : indices insuffisants, on laisse tomber
      } else {
        const r = score(t);
        if(r && r.conf >= cfg.minConf){
          parkedAt = {lat:r.pt.lat, lng:r.pt.lng, t:r.tStop};
          emit({type:'parked', t:r.tStop, lat:r.pt.lat, lng:r.pt.lng, margin:r.pt.margin, conf:r.conf, why:r.why});
          reset('parked');
        }
      }
    }
    if(phase === 'driving' && t - evLast > 10*60e3 && !out) reset('idle');
    if(phase === 'departing' && t - evLast > 10*60e3) reset('idle');
  }

  return {
    feed,
    state: () => ({phase, activity: act.kind, parkedAt, cars: Object.keys(cars).filter(d => cars[d].n >= cfg.learnDrives && !personal[d]).length}),
    reset: () => { reset('idle'); parkedAt = null; pos = []; }
  };
}

/* ---------- Liaison avec l'app iPhone et l'écran (inactif dans le navigateur) ----------
   Rien n'est partagé sans l'accord de la personne : par défaut, une détection ouvre la fenêtre
   « Tu te gares sur quelle place ? » avec le point deviné et sa marge d'erreur. Chaque réponse
   (oui / non) est gardée dans l'historique du téléphone pour mesurer la fiabilité. */
const DETECT = {det:null, ready:false, waiting:null, dirty:false};
function detApi(){ const n = typeof nativeApp === 'function' ? nativeApp() : null; return n && n.parkingSignals ? n.parkingSignals : null; }
function detFeed(sig){
  if(!DETECT.det || !sig || !(sig.seq > S.det.seq)) return;
  S.det.seq = sig.seq; DETECT.dirty = true;
  DETECT.det.feed(sig);
}
async function detDrain(){
  const api = detApi(); if(!api || !DETECT.det) return;
  try{ const r = await api.drain(S.det.seq); (r.signals || []).forEach(detFeed); }catch(e){}
  if(DETECT.dirty){ DETECT.dirty = false; save(); }
  detShowWaiting();
}
function detOnEvent(ev){
  if(ev.type !== 'parked' && ev.type !== 'departing') return;
  const kind = ev.type === 'parked' ? 'arrive' : 'depart';
  if(Date.now() - ev.t > (kind === 'depart' ? 30*60e3 : 4*3600e3)) return;      // trop ancien pour servir
  S.history.push({type:'detect_' + kind, lat:ev.lat, lng:ev.lng, t:ev.t, conf:ev.conf, margin:ev.margin, ok:null});
  save();
  const cur = {lat:ev.lat, lng:ev.lng, acc:ev.margin};
  if(S.det.auto && ev.conf >= 0.8 && ev.margin <= 25){
    detAnswer(true);
    kind === 'arrive' ? doArrive('detection', cur) : startDepart('detection', cur);
    return;
  }
  DETECT.waiting = {kind, ev, cur};
  detShowWaiting();
}
function detShowWaiting(){
  const w = DETECT.waiting;
  if(!w || (typeof CONF !== 'undefined' && CONF) || document.visibilityState !== 'visible') return;
  DETECT.waiting = null;
  const when = hhmm(w.ev.t), m = Math.max(10, Math.round(w.ev.margin/5)*5);
  askSlot(w.kind, {src:'detection', cur:w.cur, margin:w.ev.margin,
    note: (w.kind === 'arrive' ? 'Voiture garée détectée à ' : 'Départ détecté à ') + when + ' (position à ±' + m + ' m environ). Vérifie la place avant de valider.'});
}
function detAnswer(ok){
  for(let i = S.history.length - 1; i >= 0; i--){
    const h = S.history[i];
    if(h.type && h.type.indexOf('detect_') === 0 && h.ok === null){ h.ok = !!ok; break; }
  }
  save();
}
async function detStart(){
  const api = detApi(); if(!api || !S.det.on) return;
  if(!DETECT.det) DETECT.det = makeDetector({cars:S.det.cars, personal:S.det.personal, emit:detOnEvent, changed:() => { DETECT.dirty = true; }});
  try{ await api.start(); }catch(e){ detStatus('La détection n’a pas pu démarrer : ' + (e && e.message || 'erreur inconnue')); return; }
  if(!DETECT.ready){ DETECT.ready = true; api.onSignal(detFeed); document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') detDrain(); }); setInterval(() => { if(DETECT.dirty){ DETECT.dirty = false; save(); } }, 15000); }
  detDrain(); detRender();
}
async function detStop(){ const api = detApi(); if(api) try{ await api.stop(); }catch(e){} detRender(); }
function detStatus(msg){ const el = $('detEtat'); if(el) el.textContent = msg; }
async function detRender(){
  $('detOn').textContent = S.det.on ? 'Désactiver la détection' : 'Activer la détection';
  $('detOn').setAttribute('aria-pressed', S.det.on ? 'true' : 'false');
  $('detAuto').hidden = !S.det.on;
  $('detAuto').textContent = S.det.auto ? 'Partage automatique : activé (très sûr seulement)' : 'Partage automatique : désactivé (je valide chaque détection)';
  $('detAuto').setAttribute('aria-pressed', S.det.auto ? 'true' : 'false');
  const api = detApi(); if(!api) return;
  try{
    const st = await api.status();
    const parts = [];
    parts.push(S.det.on ? (st.running ? 'Détection active.' : 'Détection en attente.') : 'Détection désactivée.');
    if(S.det.on){
      if(st.location === 'denied') parts.push('Position refusée : active-la dans Réglages iPhone > PlaceLibre.');
      else if(st.location !== 'always') parts.push('Pour détecter quand l’app est fermée, choisis « Toujours » pour la position.');
      if(st.motion === 'denied') parts.push('Mouvement refusé : active « Mouvement et forme » dans Réglages iPhone.');
      const n = DETECT.det ? DETECT.det.state().cars : 0;
      parts.push(n ? 'Bluetooth de ta voiture reconnu.' : 'Bluetooth de ta voiture pas encore reconnu : il l’est après 2 trajets.');
    }
    detStatus(parts.join(' '));
  }catch(e){ detStatus('Détection indisponible dans cette version de l’app.'); }
}
if(detApi() && $('detectCard')){
  $('detectCard').hidden = false;
  $('detOn').addEventListener('click', async () => {
    S.det.on = !S.det.on; save();
    if(S.det.on){
      const api = detApi();
      try{ await api.requestAccess(); }catch(e){}
      await detStart();
    } else detStop();
    detRender();
  });
  $('detAuto').addEventListener('click', () => { S.det.auto = !S.det.auto; save(); detRender(); });
  detRender();
  if(S.det.on) detStart();
}

if(typeof module !== 'undefined') module.exports = {makeDetector, DET_CFG};
