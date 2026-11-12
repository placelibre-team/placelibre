/* PlaceLibre · modèles : délai Bluetooth, état des places, prévision par rue, durée de disponibilité */
'use strict';

function learnDelay(sec){
  const m = S.model;
  m.delay = m.delayN === 0 ? sec : m.delay*0.7 + sec*0.3;
  m.delay = Math.min(300, Math.max(5, m.delay)); m.delayN++;
}
function learnTau(ageSec, found){
  const m = S.model;
  const target = found ? Math.max(ageSec*1.5, 60) : Math.max(ageSec*0.7, 30);
  m.tau = Math.min(900, Math.max(30, m.tau*0.8 + target*0.2)); m.tauN++;
}
function freeLevel(fr, now){
  const age = (now - fr)/1000, c = Math.exp(-age / S.model.tau);
  if(c < 0.08) return null;
  return {k: c > 0.5 ? 'high' : c > 0.2 ? 'mid' : 'low', conf:c, age};
}
function slotState(id, now){
  const st = S.slotState[id];
  if(!st) return {k:'unk'};
  if(st.soon && now < st.soon) return {k:'soon', secs:Math.ceil((st.soon - now)/1000)};
  const fr = st.free || 0, oc = st.occ || 0;
  if(fr > oc){ const l = freeLevel(fr, now); if(l) return l; return {k:'unk'}; }
  if(oc && now - oc < 3*3600e3) return {k:'occ', age:(now - oc)/1000};
  return {k:'unk'};
}
function stateText(st){
  switch(st.k){
    case 'soon': return 'Voiture qui part · libre dans ~' + st.secs + ' s';
    case 'high': case 'mid': case 'low': return 'Libre depuis ' + fmtAge(st.age) + ' · ' + Math.round(st.conf*100) + ' % de chances';
    case 'occ': return 'Occupée (vue il y a ' + fmtAge(st.age) + ')';
    default: return 'État inconnu';
  }
}

function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
    h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
    mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;
  return new Date(y, mo-1, da);
}
function isHoliday(d){
  const key = (d.getMonth()+1) + '-' + d.getDate();
  if(['1-1','5-1','5-8','7-14','8-15','11-1','11-11','12-25'].includes(key)) return true;
  const e = easter(d.getFullYear());
  return [1,39,50].some(n => { const x = new Date(e); x.setDate(x.getDate()+n); return x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); });
}
function dayOff(d){ return d.getDay() === 0 || d.getDay() === 6 || isHoliday(d); }
function paidAt(rule, d){
  if(!rule || !rule.paid) return false;
  if(rule.freeWeekend && dayOff(d)) return false;
  const h = d.getHours() + d.getMinutes()/60;
  return rule.hours.some(([a,b]) => h >= a && h < b);
}
function ruleText(street, d){
  const rule = RULES[street]; if(!rule) return '';
  if(rule.paid == null) return 'Tarif à confirmer';
  if(!rule.paid) return 'Gratuit';
  const h = d.getHours() + d.getMinutes()/60;
  if(paidAt(rule, d)){ const end = rule.hours.find(([a,b]) => h >= a && h < b)[1]; return 'Payant jusqu’à ' + end + ' h' + (rule.firstHourFree ? ' · 1re heure gratuite' : ''); }
  if(!dayOff(d)){ const nx = rule.hours.find(([a]) => a > h); if(nx) return 'Gratuit maintenant · payant dès ' + nx[0] + ' h'; }
  return 'Gratuit maintenant';
}
// Modèle de départ (sans utilisateurs) : taux d'occupation typique d'une rue de centre balnéaire, heure par heure,
// corrigé par la saison, les week-ends, Jazz à Juan et les heures payantes (qui font tourner les voitures).
const BASE_OCC = [.95,.96,.96,.96,.95,.93,.90,.88,.88,.90,.90,.90,.93,.93,.90,.90,.90,.91,.94,.95,.95,.95,.95,.95];
const MONTH_ADJ = [-.03,-.03,-.02,-.01,0,.02,.04,.05,.02,-.01,-.03,-.02];
function jazzAJuan(d){ return d.getMonth() === 6 && d.getDate() >= 10 && d.getDate() <= 25 && d.getHours() >= 18; }
function priorAt(street, d){
  const h = d.getHours(), paid = paidAt(RULES[street], d);
  let occ = BASE_OCC[h] + MONTH_ADJ[d.getMonth()] + (dayOff(d) && h >= 10 && h < 20 ? .02 : 0) + (jazzAJuan(d) ? .03 : 0) - (paid ? .03 : 0);
  occ = Math.min(.99, Math.max(.6, occ));
  const lam = paid ? .6 : (h >= 7 && h < 21 ? .25 : .05);   // départs par place et par heure
  return {occ, lam};
}
function streetN(street){ return SLOTS.filter(s => s.name === street && s.type !== 'pmr').length; }
function learnedLam(street, d){
  const o = S.obs[street]; if(!o) return null;
  const c = o.c[d.getDay()*24 + d.getHours()] || 0;
  if(c < 3) return null;
  return c / Math.max(1, (o.d || []).length) / Math.max(1, streetN(street));
}
function chanceAt(street, d){
  const N = streetN(street); if(!N) return 0;
  const pr = priorAt(street, d); let lam = pr.lam;
  const L = learnedLam(street, d); if(L != null) lam = (lam + 2*L) / 3;
  const E = N*(1 - pr.occ)*0.2 + N*lam*(5/60)*0.15;   // places libres « trouvables » en 5 min
  return 1 - Math.exp(-0.35*E);
}

function recordObs(slotId, ts){
  const sl = SLOT_BY_ID[slotId]; if(!sl || !sl.name) return;
  const o = S.obs[sl.name] || (S.obs[sl.name] = {c:{}, d:[]}), d = new Date(ts), key = d.getDay()*24 + d.getHours();
  o.c[key] = (o.c[key] || 0) + 1;
  const day = d.toISOString().slice(0,10); if(!o.d.includes(day)){ o.d.push(day); if(o.d.length > 90) o.d.shift(); }
}

/* ---------- Durée de disponibilité après un départ ----------
   Pour chaque départ du journal, on cherche les preuves sur la même place :
   - contrôle « libre » à h min ou place signalée libre à l'âge a  → encore libre jusque-là ;
   - contrôle « occupée » à h min, arrivée ou place signalée occupée à l'âge a → prise avant.
   Pour chaque horizon (5, 10, 15, 30 min) : part des départs encore libres, mélangée avec
   l'estimation de départ exp(-h/τ) qui pèse comme SURV_PSEUDO mesures. */
function survivalCounts(){
  const J = S.journal.slice().sort((a, b) => a.t - b.t);
  const res = SURV_H.map(h => ({h, s:0, n:0}));
  const ctl = {};
  J.forEach(e => { if(e.type === 'controle' && e.departId) (ctl[e.departId] = ctl[e.departId] || []).push(e); });
  J.forEach((d, i) => {
    if(d.type !== 'depart' || !d.slot) return;
    let aFree = null, aOcc = null;
    const occ = a => { aOcc = aOcc == null ? a : Math.min(aOcc, a); };
    (ctl[d.id] || []).forEach(e => {
      if(e.etat === 'libre') aFree = Math.max(aFree || 0, +e.horizon);
      else if(e.etat === 'occupee') occ(+e.horizon);
    });
    for(let j = i + 1; j < J.length; j++){
      const e = J[j], age = (e.t - d.t)/60e3;
      if(age > 60) break;
      if(e.slot !== d.slot || e.type === 'controle') continue;
      if(e.type === 'depart') break;                       // un nouveau départ sur la place : on s'arrête
      if(e.type === 'arrive' || e.type === 'occupee') occ(age);
      else if(e.type === 'libre' && aOcc == null) aFree = Math.max(aFree || 0, age);
    }
    res.forEach(r => {
      if(aOcc != null && aOcc <= r.h){ r.n++; }
      else if(aFree != null && aFree >= r.h){ r.n++; r.s++; }
    });
  });
  return res;
}
function survModel(){
  const tauMin = Math.max(.5, S.model.tau/60);
  let prev = 1;
  return survivalCounts().map(r => {
    const prior = Math.exp(-r.h/tauMin);
    let p = (r.s + SURV_PSEUDO*prior) / (r.n + SURV_PSEUDO);
    p = Math.min(prev, p); prev = p;                        // une place ne peut pas « redevenir » libre
    return {h:r.h, s:r.s, n:r.n, prior, p, enough:r.n >= SURV_MIN_N};
  });
}
// Probabilité qu'une place libérée il y a `min` minutes le soit encore
function survAt(min, M){
  M = M || survModel();
  if(min <= 0) return 1;
  let ph = 0, pp = 1;
  for(const r of M){
    if(min <= r.h) return pp + (r.p - pp)*(min - ph)/(r.h - ph);
    ph = r.h; pp = r.p;
  }
  return pp*Math.exp(-(min - ph)/Math.max(.5, S.model.tau/60));
}
// Temps de trajet estimé (min) en ville
function etaMin(from, to){ return from ? dist(from, to)*DETOUR/(DRIVE_KMH/3.6)/60 : 0; }

/* ---------- Chances par rue : prévision + places signalées, estimées à l'heure d'arrivée ---------- */
function slotLive(s, now, M, from){
  const raw = S.slotState[s.id]; if(!raw || !raw.ts) return null;
  const st = slotState(s.id, now);
  if(st.k === 'unk' || st.k === 'occ') return null;
  const age = Math.max(0, (now - raw.ts)/60e3), eta = etaMin(from, s);
  return {slot:s, p:survAt(age + eta, M), age, eta, by:raw.by || '', src:raw.src || '', k:st.k};
}
function liveInfo(street, now, M, from){
  let q = 1, n = 0, best = null;
  SLOTS.forEach(s => {
    if(s.name !== street || s.type === 'pmr') return;
    const l = slotLive(s, now, M, from); if(!l) return;
    q *= 1 - l.p*0.95; if(l.p >= 0.2) n++;
    if(!best || l.p > best.p) best = l;
  });
  return {p:1 - q, n, best};
}
function chanceNow(street, from, M){
  const now = Date.now(), a = chanceAt(street, new Date(now)), b = liveInfo(street, now, M || survModel(), from);
  return {p:1 - (1 - a)*(1 - b.p), prior:a, live:b.p, nl:b.n, best:b.best};
}
