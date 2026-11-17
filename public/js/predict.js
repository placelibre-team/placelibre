/* PlaceLibre · prévision à l'arrivée : « à ton arrivée dans X min, N % de chances d'une place à moins de R m »
   Chaque pourcentage vient d'un calcul :
   1. places signalées : probabilité qu'elles soient encore libres à l'arrivée (courbe de survie mesurée) ;
   2. places d'état inconnu : part de places libres à cette heure = prévision de départ corrigée par les
      signalements réels de la même tranche horaire (loi bêta : plus il y a de mesures, moins la prévision pèse) ;
   3. les places voisines se ressemblent (même rue, même heure) : on ne les compte pas comme indépendantes ;
   4. chaque prévision affichée est enregistrée, puis comparée à ce qui s'est passé (fiabilité mesurée). */
'use strict';

const WALK = 1.2;                 // détour à pied
const RHO = 0.25;                 // corrélation entre places voisines
const BETA_K = 8;                 // poids de la prévision de départ (mesures fictives)
const RADII = [50, 100, 200];

// Part de places libres observées à cette heure (signalements + contrôles), par rue
function freeShare(street, d){
  const wk = dayOff(d) ? 1 : 0, h = d.getHours();
  let f = 0, o = 0;
  S.journal.forEach(e => {
    if(e.street !== street) return;
    const free = e.type === 'libre' || (e.type === 'controle' && e.etat === 'libre');
    const occ = e.type === 'occupee' || (e.type === 'controle' && e.etat === 'occupee');
    if(!free && !occ) return;
    const t = new Date(e.t); if((dayOff(t) ? 1 : 0) !== wk) return;
    let dh = Math.abs(t.getHours() - h); dh = Math.min(dh, 24 - dh); if(dh > 1) return;
    if(free) f++; else o++;
  });
  return {f, o, n:f + o};
}
function lamSlot(street, d){
  const pr = priorAt(street, d), L = learnedLam(street, d);
  return L != null ? (pr.lam + 2*L)/3 : pr.lam;
}
// Probabilité par place et indicateurs de preuve
function slotP(s, now, arrMs, M, eta){
  const st = slotState(s.id, now), arrD = new Date(arrMs);
  if(st.k === 'soon' || st.k === 'high' || st.k === 'mid' || st.k === 'low'){
    return {p:liveProbability(S.slotState[s.id], arrMs, M), kind:'live'};
  }
  if(st.k === 'occ'){
    const lam = lamSlot(s.name, arrD);
    return {p:(1 - Math.exp(-lam*eta/60)) * survAt(eta/2, M), kind:'occ'};
  }
  return {p:null, kind:'unk'};
}
function predictArrival(dest, etaMin, now, rhoOverride){
  now = now || Date.now();
  const arrMs = now + etaMin*60e3, arrD = new Date(arrMs), M = survModel(), rho = rhoOverride != null ? rhoOverride : currentRho();
  const cand = SLOTS.filter(s => s.type !== 'pmr').map(s => ({s, d:dist(dest, s)*WALK})).filter(x => x.d <= 300);
  let evid = 0;
  const share = {};
  const at = r => {
    let q = 1, nUnk = {}, live = 0, nearest = null, grp = [], qLive;
    cand.forEach(x => {
      if(x.d > r) return;
      const sp = slotP(x.s, now, arrMs, M, etaMin);
      if(sp.p != null){
        q *= 1 - sp.p*0.95; if(sp.kind === 'live') live++;
        if(sp.p >= 0.5 && (!nearest || x.d < nearest.d)) nearest = x;
      }else (nUnk[x.s.name] = nUnk[x.s.name] || []).push(x);
    });
    qLive = q;
    Object.keys(nUnk).forEach(name => {
      const n = nUnk[name].length, pr = priorAt(name, arrD);
      const sh = share[name] || (share[name] = freeShare(name, arrD));
      const qf = (sh.f + BETA_K*(1 - pr.occ)) / (sh.n + BETA_K);
      grp.push([n, qf]); q *= Math.pow(1 - qf, n/(1 + (n - 1)*rho));
    });
    return {r, p:Math.min(0.95, Math.max(0, 1 - q)), live, nearest, rec:{qLive, grp}};
  };
  const rows = RADII.map(at);
  const names = {}; cand.forEach(x => names[x.s.name] = 1);
  Object.keys(names).forEach(n => { evid += freeShare(n, arrD).n; });
  const liveN = rows[rows.length - 1].live;
  const quality = liveN >= 1 ? 'live' : evid >= 30 ? 'mesure' : evid >= 5 ? 'peu' : 'depart';
  // distance à laquelle on atteint 50 %
  let d50 = null;
  for(let r = 25; r <= 300; r += 25){ if(at(r).p >= 0.5){ d50 = r; break; } }
  return {eta:etaMin, arr:arrMs, rows, d50, quality, evid, liveN};
}
function qualityText(q){
  return {live:'Basé sur des places signalées en direct + les mesures de la rue.',
    mesure:'Basé sur des mesures réelles de cette tranche horaire.',
    peu:'Peu de mesures pour cette heure : estimation prudente.',
    depart:'Pas encore de mesures ici : estimation de départ (heure, jour, saison), pas encore vérifiée.'}[q];
}

/* ---------- Trajet ---------- */
async function routeEta(from, to){
  try{
    const c = new AbortController(), to_ = setTimeout(() => c.abort(), 4000);
    const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat + '?overview=false', {signal:c.signal});
    clearTimeout(to_);
    const j = await r.json();
    if(j.routes && j.routes[0]) return {min:j.routes[0].duration/60, src:'itinéraire'};
  }catch(e){}
  return {min:etaMin(from, to), src:'estimation à vol d’oiseau'};
}

/* ---------- Fiabilité mesurée : chaque prévision vs réalité ---------- */
function logPred(dest, pr){
  const row = pr.rows.find(x => x.r === 100);
  S.preds = S.preds || [];
  const id = uid();
  S.preds.push({id, t:Date.now(), arr:pr.arr, lat:dest.lat, lng:dest.lng, r:100, p:row.p, rec:row.rec, q:pr.quality, out:null});
  S.preds = S.preds.slice(-200); save();
  return id;
}
function answerPred(id, found){
  const p = (S.preds || []).find(x => x.id === id); if(!p) return;
  p.out = found ? 1 : 0; p.answeredAt = Date.now(); save(); render();
  toast('Merci : ça sert à mesurer la fiabilité des pourcentages.');
}
/* Apprentissage de la corrélation entre places voisines (ρ) : avec ≥ 30 réponses réelles, on choisit le ρ
   qui aurait donné les pourcentages les plus justes (score de Brier le plus bas) sur les prévisions passées. */
const FIT_MIN = 30;
function pWithRho(rec, rho){
  let q = rec.qLive;
  rec.grp.forEach(([n, qf]) => { q *= Math.pow(1 - qf, n/(1 + (n - 1)*rho)); });
  return Math.min(.95, Math.max(0, 1 - q));
}
function fitRho(preds){
  const P = (preds || []).filter(x => x.out != null && x.rec);
  if(P.length < FIT_MIN) return null;
  let best = null;
  for(let rho = 0; rho <= 0.8001; rho += .05){
    const br = P.reduce((a, x) => a + (pWithRho(x.rec, rho) - x.out)**2, 0)/P.length;
    if(!best || br < best.br) best = {rho, br};
  }
  return best.rho;
}
function currentRho(){ const f = fitRho(S.preds); return f != null ? f : RHO; }
function calibration(){
  const P = (S.preds || []).filter(x => x.out != null);
  if(!P.length) return {n:0};
  const brier = P.reduce((a, x) => a + (x.p - x.out)**2, 0)/P.length;
  const bins = [[0, .4], [.4, .7], [.7, 1.01]].map(([a, b]) => {
    const g = P.filter(x => x.p >= a && x.p < b);
    return {a, b, n:g.length, pred:g.length ? g.reduce((s, x) => s + x.p, 0)/g.length : null, real:g.length ? g.reduce((s, x) => s + x.out, 0)/g.length : null};
  });
  return {n:P.length, brier, bins};
}

// Mot simple pour la destination, d'après la chance à moins de 100 m
function difficulty(pr){
  const p = pr.rows.find(x => x.r === 100).p;
  return p >= .6 ? {cls:'ez', t:'Facile'} : p >= .3 ? {cls:'mid', t:'Moyen'} : {cls:'hard', t:'Difficile'};
}
// Nombre de contributions de la personne (signalements, départs, arrivées, contrôles)
function helpCount(){
  if(!S.me) return 0;
  return S.journal.filter(e => e.by === S.me && ['libre', 'occupee', 'depart', 'arrive', 'depart_confirme', 'controle'].includes(e.type)).length;
}
