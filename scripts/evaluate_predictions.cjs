/* Évaluation locale chronologique de l'apprentissage de rho. Aucun réseau.
   Usage : node scripts/evaluate_predictions.cjs fichier.json --cutoff DATE_ISO
   Démonstration : node scripts/evaluate_predictions.cjs --demo */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Réutiliser exactement les fonctions de l'application, sans charger son réseau ni son état.
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/predict.js'), 'utf8') +
  '\nthis.model = {fitRho, pWithRho, RHO, FIT_MIN};', ctx);
const {fitRho, pWithRho, RHO, FIT_MIN} = ctx.model;
const probability = p => Number.isFinite(p) && p >= 0 && p <= 1;
const timestamp = t => Number.isFinite(t) && t > 0 && t <= 8640000000000000;

function validRow(p){
  return p && typeof p.id === 'string' && p.id.length > 0 && timestamp(p.t) &&
    timestamp(p.arr) && p.arr >= p.t && timestamp(p.answeredAt) && p.answeredAt >= p.arr &&
    (p.out === 0 || p.out === 1) && p.rec && probability(p.rec.qLive) &&
    Array.isArray(p.rec.grp) && p.rec.grp.every(g => Array.isArray(g) && g.length === 2 &&
      Number.isInteger(g[0]) && g[0] > 0 && probability(g[1]));
}
function score(rows, rho){
  const values = rows.map(x => ({p:pWithRho(x.rec, rho), out:x.out}));
  const brier = values.reduce((s, x) => s + (x.p - x.out)**2, 0)/values.length;
  const bins = [[0,.4],[.4,.7],[.7,1.01]].map(([a,b]) => {
    const group = values.filter(x => x.p >= a && x.p < b);
    return {from:a, to:Math.min(1,b), n:group.length,
      predicted:group.length ? group.reduce((s,x)=>s+x.p,0)/group.length : null,
      observed:group.length ? group.reduce((s,x)=>s+x.out,0)/group.length : null};
  });
  return {rho, brier, bins};
}
function evaluate(input, cutoff){
  if(!timestamp(cutoff)) throw new Error('Date de coupure invalide.');
  const rows = Array.isArray(input) ? input : input && input.preds;
  if(!Array.isArray(rows)) throw new Error('Attendu : tableau JSON ou objet contenant preds.');
  const seen = new Set();
  let invalid = 0, late = 0;
  const train = [], test = [];
  for(const p of rows){
    if(!validRow(p)){ invalid++; continue; }
    if(seen.has(p.id)) throw new Error('Identifiant de prévision dupliqué : ' + p.id);
    seen.add(p.id);
    if(p.t >= cutoff) test.push(p);
    else if(p.answeredAt < cutoff) train.push(p);
    else late++; // La réponse n'était pas connue à la date de coupure.
  }
  train.sort((a,b)=>a.t-b.t); test.sort((a,b)=>a.t-b.t);
  const result = {scope:'Apprentissage de rho seulement, observations rec figées à chaque prévision',
    cutoff:new Date(cutoff).toISOString(), counts:{training:train.length, test:test.length,
      excludedInvalidOrUndated:invalid, excludedLateAnswers:late}, minimumTraining:FIT_MIN};
  if(train.length < FIT_MIN || !test.length){
    return {...result, status:'insufficient_data', conclusion:'Données insuffisantes : aucune amélioration démontrée.'};
  }
  // Les réponses de la période de test n'entrent jamais dans fitRho.
  const rho = fitRho(train);
  const baseline = score(test, RHO), learned = score(test, rho);
  const gain = baseline.brier - learned.brier;
  return {...result, status:'evaluated', baseline, learned, brierGain:gain,
    conclusion:gain > 1e-12 ? 'Erreur plus faible sur cet échantillon de test.' :
      gain < -1e-12 ? 'Erreur plus élevée sur cet échantillon de test.' : 'Pas de gain sur cet échantillon de test.',
    limitation:'Ce résultat ne prouve ni une amélioration générale ni la fiabilité sur le terrain.'};
}
function demo(){
  const start = Date.parse('2026-11-01T08:00:00Z');
  const rows = Array.from({length:60},(_,i) => ({id:'synthetic-'+i, t:start+i*3600e3,
    arr:start+i*3600e3+5*60e3, answeredAt:start+i*3600e3+6*60e3,
    rec:{qLive:1,grp:[[4+i%4,0.1+(i%3)*0.05]]}, out:i%4 === 0 ? 1 : 0}));
  return {rows, cutoff:start+40*3600e3};
}
if(require.main === module){
  try{
    const args = process.argv.slice(2);
    let report;
    if(args.length === 1 && args[0] === '--demo'){
      const d = demo(); report = {data:'SYNTHÉTIQUES — démonstration technique, pas un résultat terrain', ...evaluate(d.rows,d.cutoff)};
    }else{
      if(args.length !== 3 || args[1] !== '--cutoff' || !/(Z|[+-]\d{2}:\d{2})$/.test(args[2])){
        throw new Error('Usage : node scripts/evaluate_predictions.cjs fichier.json --cutoff 2026-11-20T00:00:00+01:00 (ou --demo)');
      }
      report = evaluate(JSON.parse(fs.readFileSync(args[0],'utf8')), Date.parse(args[2]));
    }
    console.log(JSON.stringify(report,null,2));
    if(report.status === 'insufficient_data') process.exitCode = 2;
  }catch(e){ console.error(e.message); process.exitCode = 1; }
}
module.exports = {evaluate, demo};
