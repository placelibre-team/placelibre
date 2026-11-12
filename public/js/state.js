/* PlaceLibre · état local (stockage du téléphone) et outils */
'use strict';

function clone(o){return JSON.parse(JSON.stringify(o));}
function load(){
  try{
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    const s = Object.assign(clone(DEF), r || {});
    s.model = Object.assign({}, DEF.model, s.model || {});
    return mergeBase(s);
  }catch(e){return mergeBase(clone(DEF));}
}
function mergeBase(s){
  s.removedBase = s.removedBase || [];
  BASE_SEGS.forEach(b => {
    const ex = s.segments.find(x => x.id === b.id);
    if(ex){ ex.type = b.type; ex.pts = b.pts; ex.name = b.name; }
    else if(!s.removedBase.includes(b.id)) s.segments.push(clone(b));
  });
  s.obs = s.obs || {};
  s.journal = Array.isArray(s.journal) ? s.journal : [];
  s.slotLog = s.slotLog && typeof s.slotLog === 'object' ? s.slotLog : {};
  s.outbox = Array.isArray(s.outbox) ? s.outbox : [];
  if(typeof s.dev !== 'string' || !s.dev) s.dev = Math.random().toString(36).slice(2, 12);   // identifiant aléatoire de ce téléphone
  return s;
}
let S = load();
function save(){try{localStorage.setItem(KEY, JSON.stringify(S));}catch(e){}}
(function prune(){
  const now = Date.now();
  S.loose = S.loose.filter(s => now - s.t < 2*3600e3);
  S.history = S.history.filter(h => now - h.t < 60*864e5).slice(-3000);
  S.journal = S.journal.filter(e => now - e.t < 30*864e5).slice(-5000);
  Object.keys(S.slotState).forEach(k => { const st = S.slotState[k]; if(Math.max(st.free||0, st.occ||0) < now - 7*864e5) delete S.slotState[k]; });
  Object.keys(S.slotLog).forEach(k => { S.slotLog[k] = S.slotLog[k].filter(e => now - e.ts < 48*3600e3); if(!S.slotLog[k].length) delete S.slotLog[k]; });
  S.outbox = S.outbox.filter(e => now - e.ts < 24*3600e3).slice(-300);
  save();
})();

let OSM_SEGS = [], SLOTS = [], SLOT_BY_ID = {}, PARKINGS = [];
let lastPos = null, pendingDepart = null, wake = null, mapReady = false;
let mode = 'view', draft = [], draftType = 'free';

/* ---------- Outils ---------- */
const $ = id => document.getElementById(id);
function dist(a, b){
  const R = 6371000, t = Math.PI/180;
  const dLat = (b.lat-a.lat)*t, dLng = (b.lng-a.lng)*t;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*t)*Math.cos(b.lat*t)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function fmtDist(m){return m < 1000 ? Math.round(m/10)*10 + ' m' : (m/1000).toFixed(1).replace('.', ',') + ' km';}
function fmtAge(sec){return sec < 60 ? Math.max(0, Math.round(sec)) + ' s' : Math.round(sec/60) + ' min';}
function hhmm(t){return new Date(t).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});}
function esc(s){return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
let toastTimer;
function toast(msg, ms){
  const el = $('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, ms || 4500);
}
function readCache(k, maxAge){
  try{const c = JSON.parse(localStorage.getItem(k)||'null'); if(c && Date.now()-c.t < maxAge) return c.v;}catch(e){}
  return null;
}
function writeCache(k, v){try{localStorage.setItem(k, JSON.stringify({t:Date.now(), v}));}catch(e){}}
async function requestWake(){try{ if(navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); }catch(e){}}
function releaseWake(){try{ if(wake) wake.release(); }catch(e){} wake = null;}
function getPos(timeout){
  return new Promise((res, rej) => {
    if(!navigator.geolocation) return rej(new Error('nogps'));
    navigator.geolocation.getCurrentPosition(
      p => res({lat:p.coords.latitude, lng:p.coords.longitude, acc:p.coords.accuracy}),
      rej, {enableHighAccuracy:true, timeout:timeout||12000, maximumAge:5000});
  });
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
