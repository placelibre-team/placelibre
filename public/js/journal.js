/* PlaceLibre · journal des observations et contrôles à 5, 10 et 30 min
   Une ligne par événement, sans coordonnées GPS : id, heure, type, place, rue, source, auteur,
   précision GPS, délai de réception, départ lié, horizon et résultat du contrôle. */
'use strict';

let JIDS = new Set(S.journal.map(e => e.id));
function jAdd(e){
  if(!e.id || JIDS.has(e.id)) return false;
  JIDS.add(e.id); S.journal.push(e);
  if(S.journal.length > 5000) S.journal.shift();
  return true;
}
function evType(ev){
  if(ev.k === 'soon') return 'depart';
  if(ev.k === 'ctl') return 'controle';
  if(ev.k === 'occ') return ev.src === 'signalement' ? 'occupee' : 'arrive';
  if(ev.k === 'free') return ev.src === 'confirmation' ? 'depart_confirme' : 'libre';
  return String(ev.k || '');
}
// recvMs : délai entre l'envoi et la réception (null pour un événement local ou rattrapé au démarrage)
function logEv(ev, recvMs){
  if(!ev || !ev.id || !ev.ts) return false;
  const sl = SLOT_BY_ID[ev.slot];
  return jAdd({id:String(ev.id), t:ev.ts, type:evType(ev), slot:ev.slot || '', street:sl ? sl.name : '',
    src:ev.src || '', by:ev.by || '', acc:ev.acc != null && !isNaN(ev.acc) ? Math.round(ev.acc) : null,
    recvMs:recvMs != null ? Math.max(0, Math.round(recvMs)) : null,
    departId:ev.dep || '', horizon:ev.h || '', etat:ev.etat || ''});
}

/* Contrôles attendus : pour chaque départ récent sur une place cartographiée, à 5, 10 et 30 min.
   Passé la fenêtre de réponse, le contrôle est noté « non observé » (localement, même id partout). */
function pendingChecks(now){
  const done = new Set();
  S.journal.forEach(e => { if(e.type === 'controle') done.add(e.departId + '|' + e.horizon); });
  const out = []; let changed = false;
  S.journal.forEach(d => {
    if(d.type !== 'depart' || !d.slot || now - d.t > 24*3600e3) return;
    CHECK_H.forEach(h => {
      if(done.has(d.id + '|' + h)) return;
      const due = d.t + h*60e3;
      if(now < due - CHECK_EARLY) return;
      if(now > due + CHECK_LATE){
        changed = jAdd({id:d.id + '-h' + h + '-auto', t:due + CHECK_LATE, type:'controle', slot:d.slot, street:d.street,
          src:'auto', by:'', acc:null, recvMs:null, departId:d.id, horizon:h, etat:'non_observe'}) || changed;
        return;
      }
      out.push({dep:d, h, due});
    });
  });
  if(changed) save();
  return out.sort((a, b) => a.due - b.due);
}
function answerCheck(depId, h, etat){
  const d = S.journal.find(e => e.id === depId && e.type === 'depart'); if(!d) return;
  const ev = {v:EV_V, id:uid(), dev:S.dev, k:'ctl', slot:d.slot, ts:Date.now(), by:S.me || '', src:'controle', dep:depId, h:+h, etat};
  logEv(ev, null); applyEv(ev);
  post(ev);
  save(); render();
  toast(etat === 'non_observe' ? 'Contrôle noté : non observé.' : 'Contrôle à ' + h + ' min noté : place ' + (etat === 'libre' ? 'libre.' : 'occupée.'));
}

/* Statistiques et export */
function journalStats(){
  const J = S.journal, c = t => J.filter(e => e.type === t).length;
  const ctl = J.filter(e => e.type === 'controle');
  const rec = J.filter(e => e.recvMs != null).map(e => e.recvMs).sort((a, b) => a - b);
  const med = rec.length ? rec[Math.floor(rec.length/2)] : null;
  return {total:J.length, depart:c('depart'), arrive:c('arrive'), signal:c('libre') + c('occupee'),
    ctlOk:ctl.filter(e => e.etat === 'libre' || e.etat === 'occupee').length,
    ctlNo:ctl.filter(e => e.etat === 'non_observe').length, recvN:rec.length, recvMed:med,
    recvMax:rec.length ? rec[rec.length - 1] : null};
}
function journalCSV(){
  const cols = ['id','date','heure','type','place','rue','source','par','precision_m','delai_reception_ms','depart_id','horizon_min','etat'];
  const q = v => { const s = v == null ? '' : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = S.journal.slice().sort((a, b) => a.t - b.t).map(e => {
    const d = new Date(e.t), p = n => String(n).padStart(2, '0');
    return [e.id, d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()), p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()),
      e.type, e.slot, e.street, e.src, e.by, e.acc, e.recvMs, e.departId, e.horizon, e.etat].map(q).join(';');
  });
  return '﻿' + cols.join(';') + '\n' + rows.join('\n') + '\n';
}
