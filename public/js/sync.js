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
    (ev.v == null || ev.v <= EV_V);
}
let syncOk = false;

// Applique un événement à l'état des places (le plus récent gagne)
function applyEv(ev){
  if(!ev || !ev.slot || !SLOT_BY_ID[ev.slot] || !ev.ts) return false;
  let k = ev.k;
  if(k === 'ctl'){ if(ev.etat === 'libre') k = 'free'; else if(ev.etat === 'occupee') k = 'occ'; else return false; }
  const st = S.slotState[ev.slot] || (S.slotState[ev.slot] = {});
  if(ev.ts <= (st.ts || 0)) return false;
  st.ts = ev.ts; st.by = ev.by || ''; st.src = ev.src || '';
  if(ev.k === 'soon' || ev.k === 'free') recordObs(ev.slot, ev.ts);
  if(k === 'soon'){ st.free = ev.eta; st.soon = ev.eta; }
  else if(k === 'free'){ st.free = ev.ts; st.soon = null; }
  else if(k === 'occ'){ st.occ = ev.ts; st.soon = null; }
  return true;
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
    if(isNaN(p.lat) || isNaN(p.lng)) return null;
    const sl = nearestSlot(p, 35); if(!sl) return null;
    const base = {id:ev.id, slot:sl.id, ts:ev.ts, by:ev.by || '', src:'bluetooth', acc:num(ev.acc)};
    const conv = ev.k === 'depart' ? Object.assign(base, {k:'soon', eta:ev.ts + S.model.delay*1000}) : Object.assign(base, {k:'occ'});
    return validEv(conv) ? conv : null;   // même contrôle (place du registre, date) que les autres événements
  }
  return validEv(ev) ? ev : null;
}
function post(ev){
  if(isShared(ev.slot)) fetch(BUS, {method:'POST', body:JSON.stringify(ev)}).catch(() => {});
}
function share(slotId, k, extra){
  const ev = Object.assign({v:EV_V, id:uid(), slot:slotId, k, ts:Date.now(), eta:null, by:S.me || '', src:''}, extra || {});
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
async function syncStart(){
  try{
    const r = await fetch(BUS + '/json?poll=1&since=all');
    const txt = await r.text(); let ch = false;
    txt.split('\n').forEach(l => { if(!l.trim()) return; try{ const x = receive(JSON.parse(l), false); if(x && (x.fresh || x.applied)) ch = true; }catch(e){} });
    syncOk = true; if(ch) save(); render();
  }catch(e){}
  try{
    const es = new EventSource(BUS + '/sse');
    es.onopen = () => { syncOk = true; renderStatus(); };
    es.onerror = () => { syncOk = false; renderStatus(); };
    es.onmessage = e => {
      try{
        const x = receive(JSON.parse(e.data), true); if(!x) return;
        if(x.fresh || x.applied){ save(); render(); }
        const ev = x.ev;
        if(x.fresh && x.applied && ev.k !== 'occ' && ev.k !== 'ctl'){
          const sl = SLOT_BY_ID[ev.slot], who = ev.by && ev.by !== S.me ? ev.by : (ev.by ? '' : 'Quelqu’un');
          if(who) toast(who + ' : une place se libère ' + (sl && sl.name ? sl.name.replace(/^Rue/, 'rue') : 'dans la rue') + '.');
        }
      }catch(err){}
    };
  }catch(e){}
}
