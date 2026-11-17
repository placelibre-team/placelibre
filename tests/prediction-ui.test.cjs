'use strict';
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), path=require('node:path');
const nodes={};
const document={getElementById:id=>nodes[id]||(nodes[id]={addEventListener(){},hidden:true}),addEventListener(){},querySelectorAll:()=>[]};
const ctx=vm.createContext({console,URLSearchParams,location:{search:'?canal=test'},document,
  localStorage:{getItem:k=>k.startsWith('plj:welcome')?'1':null,setItem(){}},navigator:{userAgent:''},syncOk:false});
vm.runInContext(['config','places','state','geometry','model','predict','ui'].map(f=>fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8')).join('\n')+`
rebuildSlots(); this.T={S,slotLive,survModel,liveText,renderStatus,bestStreet,place:SLOTS.find(s=>s.type!=='pmr')};
`,ctx);
const t=ctx.T, now=Date.now(), p=t.place;
t.S.slotState[p.id]={ts:now,free:now+45000,soon:now+45000,by:'test'};
const before=t.slotLive(p,now,t.survModel(),p);
assert.equal(before.p,0);assert.equal(before.waitMs,45000);
assert.match(t.liveText(before),/45 s après ton arrivée/);
assert.match(t.liveText(before),/non confirmée/);
assert.doesNotMatch(t.liveText(before),/0 % encore libre/);
t.renderStatus();assert.match(nodes.status.innerHTML,/1 départ annoncé/);assert.doesNotMatch(nodes.status.innerHTML,/1 place libre/);
t.S.slotState[p.id]={ts:now-60000,free:now-60000,soon:null};
assert.match(t.liveText(t.slotLive(p,now,t.survModel(),p)),/% encore libre/);
t.renderStatus();assert.match(nodes.status.innerHTML,/1 place libre signalée/);
// Contrôle du bandeau avec un classement nul ou presque nul (arrondi utilisateur).
t.S.slotState={};
vm.runInContext('chanceNow=()=>({p:0});',ctx);
assert.equal(t.bestStreet(),null);t.renderStatus();assert.doesNotMatch(nodes.status.innerHTML,/Meilleure chance/);
vm.runInContext('chanceNow=()=>({p:0.004});',ctx);assert.equal(t.bestStreet(),null);
vm.runInContext('chanceNow=()=>({p:0.02});',ctx);assert.ok(t.bestStreet());
console.log('OK : départ annoncé, délai après arrivée, place confirmée et absence de meilleur résultat à 0 %.');
