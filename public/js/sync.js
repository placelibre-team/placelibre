/* PlaceLibre · temps réel partagé (ntfy.sh) pour les places de la rue Bricka et de la rue Saint-Honorat
   Le canal dépend de ?canal=test (voir config.js). */
'use strict';

/* Seules les places du registre (places.js) passent par le canal partagé */
const SHARED_IDS = new Set(PLACES.map(p => p.id));
const isShared = id => SHARED_IDS.has(id);

/* Format des événements : voir docs/format-evenements.md */
const EV_V = 1;
const EV_KINDS = new Set(['soon', 'free', 'occ', 'ctl']);
const EV_MAX_AHEAD = 10*60e3;   // tolérance d'horloge entre téléphones
function validEv(ev){
  return !!ev && typeof ev.slot === 'string' && isShared(ev.slot) && EV_KINDS.has(ev.k) &&
    Number.isFinite(ev.ts) && ev.ts > 0 && ev.ts <= Date.now() + EV_MAX_AHEAD &&
    (ev.v == null || (Number.isInteger(ev.v) && ev.v >= 1 && ev.v <= EV_V));
}
let syncOk = false;

/* ---------- État des places : identique sur tous les téléphones ----------
   Chaque place garde la liste de ses derniers événements (S.slotLog), sans doublon (même id = même
   événement) et triée par heure d'origine puis par id. L'état affiché est recalculé à partir de cette
   liste : il ne dépend pas de l'ordre d'arrivée des messages, ni des retards, ni des renvois.
   Contradiction : une place signalée occupée puis, moins de CONFLICT_MS après, libre ou « je pars »
   par une autre personne reste occupée (on évite d'envoyer quelqu'un vers une place prise) et
   l'état porte conflict:true. Voir docs/format-evenements.md. */
const LOG_MAX = 40;                 // événements gardés par place
const LOG_AGE = 48*3600e3;          // et pas plus vieux que 48 h
const CONFLICT_MS = 60e3;           // fenêtre où deux signalements opposés se contredisent
const evKind = e => e.k !== 'ctl' ? e.k : e.etat === 'libre' ? 'free' : e.etat === 'occupee' ? 'occ' : null;
const evOrder = (a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
// Le téléphone prime sur le prénom ; le prénom reste un recours pour les anciens messages sans dev.
const samePerson = (a, b) => a.dev && b.dev ? a.dev === b.dev : !!a.by && a.by === b.by;

function foldSlot(log){
  const st = {}; let lastOcc = null;
  log.forEach(e => {
    const k = evKind(e); if(!k) return;
    if(k !== 'occ' && lastOcc && e.ts - lastOcc.ts <= CONFLICT_MS && !samePerson(e, lastOcc)) return;
    st.ts = e.ts; st.by = e.by || ''; st.src = e.src || '';
    if(k === 'soon'){ st.free = e.eta; st.soon = e.eta; }
    else if(k === 'free'){ st.free = e.ts; st.soon = null; }
    else { st.occ = e.ts; st.soon = null; lastOcc = e; }
  });
  if(st.ts == null) return null;
  // Contradiction : parmi les derniers signalements (fenêtre qui finit au plus récent), une place dite
  // occupée puis libre / « je pars » au même moment ou juste après, par deux personnes différentes.
  const last = log[log.length - 1].ts, recent = log.filter(e => evKind(e) && e.ts >= last - CONFLICT_MS);
  st.conflict = recent.some(a => evKind(a) === 'occ' &&
    recent.some(b => evKind(b) !== 'occ' && b.ts >= a.ts && !samePerson(a, b)));
  return st;
}

// Ajoute un événement à l'historique de sa place et recalcule l'état. Renvoie true si l'événement est nouveau.
function applyEv(ev){
  if(!ev || !ev.slot || !SLOT_BY_ID[ev.slot] || !Number.isFinite(ev.ts) || !ev.id) return false;
  if(!evKind(ev)) return false;
  const log = S.slotLog[ev.slot] || (S.slotLog[ev.slot] = []);
  const id = String(ev.id);
  if(log.some(e => e.id === id)) return false;                       // doublon : déjà reçu
  const now = Date.now();
  // Trop ancien pour l'historique (sorti par l'âge ou par le nombre) : ignoré, pour ne pas le recompter
  if(now - ev.ts > LOG_AGE || (log.length >= LOG_MAX && evOrder({ts:ev.ts, id}, log[0]) < 0)) return false;
  log.push({id, ts:ev.ts, k:ev.k, eta:ev.eta != null ? ev.eta : null, by:ev.by || '', dev:typeof ev.dev === 'string' ? ev.dev.slice(0, 16) : '', src:ev.src || '', etat:ev.etat || ''});
  log.sort(evOrder);
  while(log.length > LOG_MAX || (log.length > 1 && now - log[0].ts > LOG_AGE)) log.shift();
  if(ev.k === 'soon' || ev.k === 'free') recordObs(ev.slot, ev.ts);   // compté une fois par événement, quel que soit l'ordre
  const st = foldSlot(log);
  if(st) S.slotState[ev.slot] = st; else delete S.slotState[ev.slot];
  return true;
}

/* Nettoyage d'un événement reçu : le canal est ouvert à quiconque le connaît (voir docs/canal-prive.md).
   On ne garde que les champs connus, de bon type, de longueur bornée et de valeur plausible : un message
   abîmé ou malveillant ne doit ni gonfler le stockage du téléphone, ni fausser l'état, ni casser l'affichage. */
const EV_SRC = new Set(['', 'bluetooth', 'manuel', 'signalement', 'confirmation', 'controle', 'test']);
const EV_ETATS = new Set(['libre', 'occupee', 'non_observe']);
const EV_ID = /^[A-Za-z0-9_.:-]{1,64}$/, EV_DEV = /^[A-Za-z0-9_-]{1,32}$/;
const EV_ETA_MAX = 15*60e3;     // un départ annoncé se libère au plus 15 min après l'annonce
const texteCourt = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
function nettoyerEv(ev){
  if(!validEv(ev)) return null;
  const id = typeof ev.id === 'string' || typeof ev.id === 'number' ? String(ev.id) : '';
  if(!EV_ID.test(id)) return null;
  const acc = typeof ev.acc === 'number' || typeof ev.acc === 'string' ? Number(ev.acc) : NaN;
  const out = {v:ev.v == null ? undefined : ev.v, id, slot:ev.slot, k:ev.k, ts:ev.ts, eta:null,
    by:texteCourt(ev.by, 30), dev:typeof ev.dev === 'string' && EV_DEV.test(ev.dev) ? ev.dev : '',
    src:EV_SRC.has(ev.src) ? ev.src : '', acc:Number.isFinite(acc) && acc >= 0 && acc <= 5000 ? Math.round(acc) : null};
  if(ev.k === 'soon'){
    const eta = ev.eta == null ? ev.ts + S.model.delay*1000 : Number(ev.eta);
    if(!Number.isFinite(eta) || eta > ev.ts + EV_ETA_MAX) return null;
    out.eta = Math.max(eta, ev.ts);
  }
  if(ev.k === 'ctl'){
    const h = Number(ev.h), dep = typeof ev.dep === 'string' ? ev.dep : '';
    if(!EV_ETATS.has(ev.etat) || !CHECK_H.includes(h) || !EV_ID.test(dep)) return null;
    Object.assign(out, {etat:ev.etat, h, dep});
  }
  return out;
}

// Message ntfy → événement. Le Raccourci iPhone (Bluetooth) envoie {k:'depart'|'arrive', lat, lng, by}.
const num = v => parseFloat(String(v == null ? '' : v).replace(',', '.'));
function fromMsg(m){
  let ev; try{ ev = JSON.parse(m.message); }catch(e){ return null; }
  if(!ev || typeof ev !== 'object') return null;
  if(!ev.ts) ev.ts = (m.time || 0)*1000;
  ev.ts = Number(ev.ts);
  if(!ev.id) ev.id = m.id;
  if(ev.k === 'depart' || ev.k === 'arrive'){
    const p = {lat:num(ev.lat), lng:num(ev.lng)};
    if(!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
    // La recherche porte sur le registre commun : une place locale plus proche ne doit pas masquer le pilote.
    let sl = null, distance = 35;
    PLACES.forEach(place => { const d = dist(p, place); if(d < distance){ sl = place; distance = d; } });
    if(!sl) return null;
    const base = {v:ev.v, id:ev.id, slot:sl.id, ts:ev.ts, by:ev.by || '', dev:ev.dev, src:'bluetooth', acc:num(ev.acc)};
    const conv = ev.k === 'depart' ? Object.assign(base, {k:'soon', eta:ev.ts + S.model.delay*1000}) : Object.assign(base, {k:'occ'});
    return nettoyerEv(conv);   // même contrôle (place du registre, date, champs) que les autres événements
  }
  return nettoyerEv(ev);
}
/* ---------- Envois : file d'attente en cas de coupure réseau ----------
   Chaque signalement partagé entre dans S.outbox (conservé dans le téléphone) avec son heure d'origine.
   La file est envoyée dans l'ordre ; un envoi raté reste en attente et repart au retour du réseau,
   à la réouverture de l'appli ou toutes les 30 s. Un renvoi éventuel est sans effet chez les autres :
   même id, donc ignoré comme doublon. */
const OUTBOX_MAX = 300, OUTBOX_AGE = 24*3600e3, RETRY_MS = 30e3;
let flushing = null;
function post(ev){
  if(!isShared(ev.slot)) return;
  if(!S.outbox.some(e => e.id === ev.id)) S.outbox.push(ev);
  save(); flushOutbox();
}
function flushOutbox(){
  if(flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    while(S.outbox.length){
      const now = Date.now();
      S.outbox = S.outbox.filter(e => now - e.ts < OUTBOX_AGE).slice(-OUTBOX_MAX);
      const ev = S.outbox[0]; if(!ev) break;
      let ok = false;
      try{ const r = await fetch(BUS, {method:'POST', body:JSON.stringify(ev)}); ok = r.ok; }catch(e){}
      if(!ok) break;
      S.outbox.shift(); sent++;
    }
    save(); if(typeof renderStatus === 'function') renderStatus();
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}
function share(slotId, k, extra){
  const ev = Object.assign({v:EV_V, id:uid(), slot:slotId, k, ts:Date.now(), eta:null, by:S.me || '', dev:S.dev, src:''}, extra || {});
  logEv(ev, null); applyEv(ev); post(ev);
  return ev;
}
function receive(m, live){
  if(m.event !== 'message') return false;
  const ev = fromMsg(m); if(!ev) return false;
  const fresh = logEv(ev, live ? Date.now() - ev.ts : null);
  const applied = applyEv(ev);
  return {ev, fresh, applied};
}
/* Lecture du canal : tout l'historique au démarrage, puis en direct. Après une coupure, on relit
   ce qui a été publié pendant l'absence (depuis le dernier message reçu, avec une marge). */
let lastMsgSec = 0;
function track(m){ if(m && m.time > lastMsgSec) lastMsgSec = m.time; }
async function pollBus(fromSec = lastMsgSec){
  const since = fromSec ? String(Math.max(0, fromSec - 120)) : 'all';
  const r = await fetch(BUS + '/json?poll=1&since=' + since);
  if(!r.ok) throw new Error('poll ' + r.status);
  const txt = await r.text(); let ch = false;
  txt.split('\n').forEach(l => {
    if(!l.trim()) return;
    try{ const m = JSON.parse(l); track(m); const x = receive(m, false); if(x && (x.fresh || x.applied)) ch = true; }catch(e){}
  });
  return ch;
}
async function syncStart(){
  // La borne de coupure reste figée jusqu'à une relecture réussie, même si le direct reçoit du nouveau.
  let missingSince = lastMsgSec, generation = 0, recovering = null, streamOpen = false;
  function markGap(){
    if(missingSince === null) missingSince = lastMsgSec;
    generation++;
    syncOk = false;
  }
  function recover(){
    if(recovering) return recovering;
    if(missingSince === null) return Promise.resolve();
    const started = generation, fromSec = missingSince;
    recovering = (async () => {
      try{
        const ch = await pollBus(fromSec);
        // Une autre coupure pendant la requête exige sa propre relecture.
        if(generation === started) missingSince = null;
        if(ch){ save(); render(); }
      }catch(e){ /* La borne est gardée pour le prochain essai. */ }
      syncOk = streamOpen && missingSince === null;
      renderStatus();
    })().finally(() => { recovering = null; });
    return recovering;
  }
  await recover();
  flushOutbox();
  try{
    const es = new EventSource(BUS + '/sse');
    es.onopen = () => {
      streamOpen = true; syncOk = missingSince === null;
      renderStatus(); flushOutbox(); recover();
    };
    es.onerror = () => { streamOpen = false; markGap(); renderStatus(); };
    es.onmessage = e => {
      try{
        const m = JSON.parse(e.data); track(m);
        const x = receive(m, true); if(!x) return;
        if(x.fresh || x.applied){ save(); render(); }
        const ev = x.ev;
        if(x.fresh && x.applied && ev.k !== 'occ' && ev.k !== 'ctl'){
          const sl = SLOT_BY_ID[ev.slot], who = ev.by && ev.by !== S.me ? ev.by : (ev.by ? '' : 'Quelqu’un');
          if(who) toast(who + ' : une place se libère ' + (sl && sl.name ? sl.name.replace(/^Rue/, 'rue') : 'dans la rue') + '.');
        }
      }catch(err){}
    };
  }catch(e){}
  addEventListener('online', () => { flushOutbox(); recover(); });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible'){ flushOutbox(); recover(); }
  });
  setInterval(() => { if(S.outbox.length) flushOutbox(); recover(); }, RETRY_MS);
}
