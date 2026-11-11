/* PlaceLibre · départ, arrivée, signalements et suivi de position */
'use strict';

function markFree(p, when, soonUntil, extra){
  const slot = nearestSlot(p);
  if(slot){
    if(soonUntil) share(slot.id, 'soon', Object.assign({eta:soonUntil}, extra)); else share(slot.id, 'free', extra);
    return {slotId:slot.id};
  }
  const l = {id:'l' + Date.now(), lat:p.lat, lng:p.lng, t:Date.now(), free:when, soon:soonUntil || null};
  S.loose.push(l); return {looseId:l.id};
}
async function startDepart(src, paramPos){
  const now = Date.now();
  if(pendingDepart && now - pendingDepart.t < 60000){ toast('Départ déjà en cours.'); return; }
  let cur = paramPos || null;
  if(!cur){ try{ cur = await getPos(8000); }catch(e){} }
  let spot = null;
  if(S.parked && (!cur || dist(S.parked, cur) < 300)) spot = {lat:S.parked.lat, lng:S.parked.lng};
  else if(cur) spot = {lat:cur.lat, lng:cur.lng};
  if(!spot){ toast('Position introuvable : autorise la localisation pour ce site.'); return; }
  const eta = now + S.model.delay*1000;
  const ref = markFree(spot, eta, eta, {src, acc:cur && cur.acc != null ? cur.acc : null});
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
async function doArrive(src, paramPos){
  let cur = paramPos || null;
  if(!cur){ try{ cur = await getPos(); }catch(e){ toast('Position introuvable : autorise la localisation pour ce site.'); return; } }
  const now = Date.now();
  if(pendingDepart){ pendingDepart = null; releaseWake(); }
  const slot = nearestSlot(cur);
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
