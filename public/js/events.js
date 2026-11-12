/* PlaceLibre · départ, arrivée, signalements et suivi de position */
'use strict';

function markFree(p, when, soonUntil, extra, forcedId){
  const slot = (forcedId && SLOT_BY_ID[forcedId]) || nearestSlot(p);
  if(slot){
    if(soonUntil) share(slot.id, 'soon', Object.assign({eta:soonUntil}, extra)); else share(slot.id, 'free', extra);
    return {slotId:slot.id};
  }
  const l = {id:'l' + Date.now(), lat:p.lat, lng:p.lng, t:Date.now(), free:when, soon:soonUntil || null};
  S.loose.push(l); return {looseId:l.id};
}
async function startDepart(src, paramPos, forcedId){
  const now = Date.now();
  if(pendingDepart && now - pendingDepart.t < 60000){ toast('Départ déjà en cours.'); return; }
  let cur = paramPos || null;
  if(!cur){ try{ cur = await getPos(8000); }catch(e){} }
  let spot = null;
  if(S.parked && (!cur || dist(S.parked, cur) < 300)) spot = {lat:S.parked.lat, lng:S.parked.lng};
  else if(cur) spot = {lat:cur.lat, lng:cur.lng};
  if(!spot){ toast('Position introuvable : autorise la localisation pour ce site.'); return; }
  const eta = now + S.model.delay*1000;
  const ref = markFree(spot, eta, eta, {src, acc:cur && cur.acc != null ? cur.acc : null}, forcedId);
  S.history.push({type:'depart', lat:spot.lat, lng:spot.lng, t:now});
  S.parked = null; save();
  pendingDepart = Object.assign({spot, t:now}, ref);
  requestWake(); startWatch();
  toast(ref.slotId ? 'Départ détecté : ta place passe en libre dans ~' + Math.round(S.model.delay) + ' s.'
                   : 'Départ détecté, mais aucune place cartographiée ici : un point est ajouté.');
  fly(spot, 18);
  render();
  const myT = now;
  setTimeout(() => { if(pendingDepart && pendingDepart.t === myT){ pendingDepart = null; releaseWake(); render(); } }, 10*60*1000);
}
function confirmMove(){
  const now = Date.now(), measured = (now - pendingDepart.t)/1000 - 5;
  if(measured > 2 && measured < 600) learnDelay(measured);
  if(pendingDepart.slotId) share(pendingDepart.slotId, 'free', {src:'confirmation'});
  if(pendingDepart.looseId){ const l = S.loose.find(x => x.id === pendingDepart.looseId); if(l){ l.free = now; l.soon = null; } }
  pendingDepart = null; releaseWake(); save(); render();
  toast('Tu roules : place libérée. Délai mesuré : ' + Math.max(0, Math.round(measured)) + ' s.');
}
async function doArrive(src, paramPos, forcedId){
  let cur = paramPos || null;
  if(!cur){ try{ cur = await getPos(); }catch(e){ toast('Position introuvable : autorise la localisation pour ce site.'); return; } }
  const now = Date.now();
  if(pendingDepart){ pendingDepart = null; releaseWake(); }
  const slot = (forcedId && SLOT_BY_ID[forcedId]) || nearestSlot(cur);
  if(slot){
    const st = S.slotState[slot.id] || (S.slotState[slot.id] = {});
    if(st.free && st.free > (st.occ||0)) learnTau(Math.max(0, (now - st.free)/1000), true);
    share(slot.id, 'occ', {src, acc:cur.acc != null ? cur.acc : null});
  }
  S.loose.forEach(l => { if(dist(l, cur) < LINK_M) l.done = true; });
  S.parked = {lat:cur.lat, lng:cur.lng, t:now};
  S.history.push({type:'arrive', lat:cur.lat, lng:cur.lng, t:now});
  save(); render();
  toast('Voiture garée' + (slot ? ' sur une place cartographiée.' : '. Aucune place cartographiée ici : dessine-la avec Carto.'));
}
function report(slotId, isFree){
  const now = Date.now(), st = S.slotState[slotId] || (S.slotState[slotId] = {});
  if(!isFree && st.free && st.free > (st.occ||0) && now - st.free < 3600e3) learnTau((now - st.free)/1000, false);
  share(slotId, isFree ? 'free' : 'occ', {src:'signalement'});
  const s = SLOT_BY_ID[slotId];
  if(s) S.history.push({type:isFree ? 'report_free' : 'report_occ', lat:s.lat, lng:s.lng, t:now, seg:s.segId});
  save(); render();
}

let watchId = null, meMarker = null;
function startWatch(){
  if(watchId !== null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(p => {
    lastPos = {lat:p.coords.latitude, lng:p.coords.longitude, acc:p.coords.accuracy, speed:p.coords.speed};
    if(pendingDepart){
      const d = dist(lastPos, pendingDepart.spot);
      if(d > MOVE_M || (lastPos.speed != null && lastPos.speed > 2.5 && d > 15)) confirmMove();
    }
    drawMe(); renderList();
  }, () => {}, {enableHighAccuracy:true, maximumAge:3000, timeout:20000});
}

/* ---------- Confirmer la place avant « Je pars » / « Je me gare ici » ----------
   Le GPS se trompe de quelques mètres : on propose les places voisines et on laisse choisir.
   Bluetooth et Raccourci (automatiques) ne passent pas par là. */
const COMPASS = ['le nord', 'le nord-est', 'l’est', 'le sud-est', 'le sud', 'le sud-ouest', 'l’ouest', 'le nord-ouest'];
function bearingWord(a, b){
  const dy = b.lat - a.lat, dx = (b.lng - a.lng)*Math.cos(a.lat*Math.PI/180);
  const deg = (Math.atan2(dx, dy)*180/Math.PI + 360) % 360;
  return COMPASS[Math.round(deg/45) % 8];
}
let CONF = null;
function slotStateWord(id){
  const k = slotState(id, Date.now()).k;
  return k === 'occ' ? 'occupée' : (k === 'high' || k === 'mid' || k === 'low' || k === 'soon') ? 'signalée libre' : 'état inconnu';
}
async function askSlot(kind){
  if(CONF) return;
  let cur = null; try{ cur = await getPos(8000); lastPos = cur; }catch(e){}
  if(!cur){ toast('Position introuvable : autorise la localisation pour ce site.'); return; }
  let ref = cur;
  if(kind === 'depart' && S.parked && dist(S.parked, cur) < 300) ref = {lat:S.parked.lat, lng:S.parked.lng};
  const near = nearSlots(ref, 30, 4);
  if(!near.length){ kind === 'depart' ? startDepart('manuel', cur) : doArrive('manuel', cur); return; }
  CONF = {kind, cur, ref, near, pick:near[0].s.id};
  drawConfirm();
  fly(near[0].s, 19);
}
function drawConfirm(){
  const c = CONF, box = $('confBody'); if(!c) return;
  const leave = c.kind === 'depart';
  box.innerHTML = '<h2>' + (leave ? 'Tu pars de quelle place ?' : 'Tu te gares sur quelle place ?') + '</h2>' +
    '<p>Le GPS peut se tromper de quelques mètres. Choisis la bonne place.</p>' +
    '<div class="opts">' + c.near.map((x, i) => '<button class="opt' + (x.s.id === c.pick ? ' on' : '') + '" data-slot="' + esc(x.s.id) + '">' +
      '<b>' + esc(x.s.name || 'Place') + (x.s.type === 'pmr' ? ' · PMR' : '') + (i === 0 ? ' <em>la plus proche</em>' : '') + '</b>' +
      '<span>à ' + Math.max(1, Math.round(x.d)) + ' m vers ' + bearingWord(c.ref, x.s) + ' · ' + slotStateWord(x.s.id) + '</span></button>').join('') + '</div>' +
    '<div class="row2"><button class="btn" id="confNo">Annuler</button><button class="btn primary" id="confOk">' + (leave ? 'Je pars de cette place' : 'Je me gare ici') + '</button></div>';
  $('confirmSlot').hidden = false;
}
function closeConfirm(){ CONF = null; $('confirmSlot').hidden = true; }
document.addEventListener('click', e => {
  if(!CONF) return;
  const o = e.target.closest('#confBody [data-slot]');
  if(o){ CONF.pick = o.dataset.slot; drawConfirm(); const s = SLOT_BY_ID[CONF.pick]; if(s) fly(s, 19); return; }
  if(e.target.closest('#confNo') || e.target === $('confirmSlot')){ closeConfirm(); return; }
  if(e.target.closest('#confOk')){
    const c = CONF; closeConfirm();
    c.kind === 'depart' ? startDepart('manuel', c.cur, c.pick) : doArrive('manuel', c.cur, c.pick);
  }
});
