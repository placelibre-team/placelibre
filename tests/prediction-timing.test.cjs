'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const path = require('node:path');
const ctx = vm.createContext({location:{search:'?canal=test'},URLSearchParams,console,
  localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({})}});
vm.runInContext(['config','places','state','geometry','model','predict'].map(f =>
  fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8')).join('\n') + `
rebuildSlots();
this.T = {S, slotP, slotLive, survModel, survAt, predictArrival, pWithRho,
  place:SLOTS.find(s=>s.type!=='pmr'), isolate(s){ SLOTS=[s]; }, answerPred};
save=()=>{}; render=()=>{}; toast=()=>{};
`,ctx);
const t=ctx.T, now=Date.now(), s=t.place, M=t.survModel();
const departure=now+3*60e3;
t.S.slotState[s.id]={ts:now,free:departure,soon:departure};
const forecast=(at,arrival)=>t.slotP(s,at,arrival,M,(arrival-at)/60e3).p;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10, `${a} != ${b}`);
assert.equal(forecast(now,now+60e3),0,'arrivée avant départ');
close(forecast(now,departure),0.9);
close(forecast(now,departure+2*60e3),0.9*t.survAt(2,M));
// Même heure d'arrivée, calcul avant ou après le départ prévu : pas de saut artificiel.
close(forecast(now,departure+2*60e3),forecast(departure+30e3,departure+2*60e3));
assert.equal(t.slotLive(s,now,M,s).p,0,'la liste des rues ne compte pas la place déjà libre');
close(t.slotLive(s,departure+60e3,M,s).p,0.9*t.survAt(1,M));
// Confirmation d'un départ anticipé : la date confirmée remplace l'annonce.
t.S.slotState[s.id]={ts:now+30e3,free:now+30e3,soon:null};
close(forecast(now+30e3,now+90e3),t.survAt(1,M));
// Une réoccupation après l'annonce n'est plus traitée comme un départ.
t.S.slotState[s.id]={ts:now+30e3,free:now+10e3,occ:now+30e3,soon:null};
assert.equal(t.slotP(s,now+30e3,now+30e3,M,0).kind,'occ');
assert.equal(forecast(now+30e3,now+30e3),0);
// Pas de plancher arbitraire de 3 % quand la seule place est indisponible.
t.isolate(s); t.S.slotState[s.id]={ts:now,free:departure,soon:departure};
const prediction=t.predictArrival(s,1,now);
assert.ok(prediction.rows.every(r=>r.p===0 && r.nearest===null));
assert.equal(prediction.d50,null);
prediction.rows.forEach(r=>close(r.p,t.pWithRho(r.rec,0.25)));
// Horodater les réponses (y compris une correction) pour l'évaluation chronologique.
t.S.preds=[{id:'p',t:now-60e3,arr:now-30e3,out:null}];
t.answerPred('p',true);
assert.equal(t.S.preds[0].out,1);
assert.ok(t.S.preds[0].answeredAt>=now);
console.log('OK : avant/après départ, confirmation, occupation, liste, agrégation et horodatage.');
