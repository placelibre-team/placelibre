'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
function app(store={}){
  const nodes={}, listeners={}, shares=[];
  const document={getElementById:id=>nodes[id]||(nodes[id]={addEventListener(){},hidden:true}),querySelectorAll:()=>[],
    addEventListener:(kind,fn)=>(listeners[kind]||(listeners[kind]=[])).push(fn)};
  const ctx=vm.createContext({console,URLSearchParams,location:{search:'?canal=test'},document,navigator:{userAgent:''},
    localStorage:{getItem:k=>k.startsWith('plj:welcome')?'1':store[k]||null,setItem:(k,v)=>store[k]=v},
    setTimeout:()=>0,clearTimeout(){},syncOk:false,fly(){},fetch(){throw Error('No network');},
    share:(...args)=>shares.push(args)});
  vm.runInContext(['config','places','state','geometry','model','predict','events','ui'].map(f=>fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8')).join('\n')+`
rebuildSlots(); render=()=>{};
this.T={get S(){return S;},get slots(){return SLOTS;},get conf(){return CONF;},get pending(){return pendingDepart;},
  doArrive,startDepart,askSlot,closeConfirm,slotStateWord,streetSamples,originText,renderList,renderStatus,
  setGps(p){getPos=async()=>p;},remove(id){delete SLOT_BY_ID[id];SLOTS=SLOTS.filter(s=>s.id!==id);},
  isolate(list){SLOTS=list;},map(ready){mapReady=ready;}};
`,ctx);
  return {T:ctx.T,nodes,listeners,shares,store};
}
(async()=>{
  const a=app(), t=a.T, gps=t.slots[0], selected=t.slots[1];t.setGps(gps);
  await t.doArrive('manuel',gps,selected.id);
  assert.equal(t.S.parked.slotId,selected.id);
  assert.equal(t.S.parked.lat,selected.lat);
  assert.equal(a.shares.at(-1)[0],selected.id);
  // Reload local storage then depart automatically from the remembered manual choice.
  const parkedStore={...a.store}, b=app({...parkedStore});b.T.setGps(gps);
  await b.T.askSlot('depart');assert.equal(b.T.conf.pick,selected.id);
  assert.match(b.nodes.confBody.innerHTML,new RegExp(selected.id));assert.match(b.nodes.confBody.innerHTML,/ici/);
  b.listeners.keydown.forEach(f=>f({key:'Escape'}));assert.equal(b.T.conf,null);assert.equal(b.nodes.confirmSlot.hidden,true);
  await b.T.startDepart('bluetooth',gps);assert.equal(b.shares.at(-1)[0],selected.id);
  // A new explicit departure choice takes priority over remembered parking.
  const c=app({...parkedStore});assert.equal(c.T.S.parked.slotId,selected.id);
  await c.T.startDepart('manuel',gps,gps.id);assert.equal(c.shares.at(-1)[0],gps.id);
  // A removed place must never be emitted from stale saved state.
  const d=app({...parkedStore});assert.equal(d.T.S.parked.slotId,selected.id);
  d.T.remove(selected.id);await d.T.startDepart('bluetooth',gps);assert.notEqual(d.shares.at(-1)[0],selected.id);
  // A temporary GPS failure still allows an automatic departure from saved parking.
  const e=app({...parkedStore});e.T.setGps(null);await e.T.startDepart('bluetooth');
  assert.equal(e.shares.at(-1)[0],selected.id);
  // A distant current position must not reuse a stale remembered parking place.
  const f=app({...parkedStore});await f.T.startDepart('bluetooth',{lat:gps.lat+0.02,lng:gps.lng});
  assert.equal(f.shares.length,0);assert.ok(f.T.pending.looseId);
  const now=Date.now();t.S.slotState[selected.id]={ts:now,free:now+45000,soon:now+45000};
  assert.match(t.slotStateWord(selected.id),/départ annoncé/);assert.doesNotMatch(t.slotStateWord(selected.id),/signalée libre/);
  t.S.journal=[
    {street:'A',type:'controle',etat:'non_observe',src:'auto'},
    {street:'A',type:'controle',etat:'non_observe',src:'manuel'},
    {street:'A',type:'controle',etat:'libre',src:'auto'},
    {street:'A',type:'controle',etat:'libre',src:'manuel'},
    {street:'A',type:'controle',etat:'occupee',src:'manuel'},
    {street:'A',type:'libre',src:'signalement'},
    {street:'A',type:'occupee',src:'signalement'},
    {street:'B',type:'libre',src:'signalement'}];
  assert.equal(t.streetSamples('A'),4);
  t.S.journal.push({street:'A',type:'libre',src:'manuel'});
  assert.doesNotMatch(t.originText({name:'A',live:0}),/à cette heure/);
  assert.match(t.originText({name:'A',live:0}),/dans cette rue/);
  t.isolate([]);t.map(false);t.renderList();t.renderStatus();
  assert.doesNotMatch(a.nodes.list.innerHTML,/<b>Carto<\/b>/);assert.doesNotMatch(a.nodes.status.innerHTML,/touche Carto/);
  // Grand public : jamais de mention de Carto. Mode équipe : l'explication de cartographie revient.
  t.map(true);t.renderList();assert.doesNotMatch(a.nodes.list.innerHTML,/Carto/);assert.doesNotMatch(a.nodes.status.innerHTML,/Carto/);
  assert.match(a.nodes.list.innerHTML,/rue Bricka et rue Saint-Honorat/);
  a.store['plj:equipe']='1';t.renderList();t.renderStatus();assert.match(a.nodes.list.innerHTML,/<b>Carto<\/b>/);
  console.log('OK : choix conservé après rechargement, départ automatique, présélection, suppression, état annoncé, observations et mode liste.');
})().catch(e=>{console.error(e);process.exit(1);});
