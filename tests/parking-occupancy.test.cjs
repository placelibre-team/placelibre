'use strict';
const assert=require('node:assert/strict');
const {validate,availability,demo}=require('../public/parkings-pilotes/occupancy.js');
const now=Date.parse('2026-11-14T10:00:00Z');
const fixture=demo(now), p={...fixture.parkings[0],kind:'manual'};
const check=changes=>validate({version:1,parkings:[{...p,...changes}]},now);
assert.equal(availability(p,now).free,36);
assert.equal(availability({...p,occupied:0},now).free,120,'zéro occupée est une observation valide');
assert.equal(availability({...p,occupied:120},now).free,0);
assert.equal(availability(fixture.parkings[1],now).free,null,'comptage ancien masqué');
assert.equal(availability(fixture.parkings[2],now).free,null,'capacité seule ne donne pas de disponibilité');
assert.equal(availability(p,Date.parse(p.observedAt)+15*60000).status,'stale','seuil exact');
assert.equal(availability(p,Date.parse(p.observedAt)+15*60000-1).status,'recent');
assert.equal(availability(p,Date.parse(p.observedAt)-1).status,'unknown','recul d’horloge');
for(const changes of [{capacity:0},{occupied:121},{occupied:-1},{occupied:1.5},{capacity:'120'},
  {maxAgeMinutes:0},{maxAgeMinutes:61},{observedAt:'demain'},{observedAt:'2026-11-14T11:00:00Z'},
  {observedAt:'2026-11-14T09:00:00'},{source:''},{access:'private'},{occupied:null}]){
  assert.throws(()=>check(changes),JSON.stringify(changes));
}
assert.equal(check({occupied:null,observedAt:null}).parkings[0].occupied,null);
assert.throws(()=>validate({version:2,parkings:[]},now));
assert.throws(()=>validate({version:1,parkings:[p,p]},now),/dupliqué/);
assert.throws(()=>validate({version:1,parkings:Array(201).fill(p)},now));
assert.deepEqual(validate({version:1,parkings:[]},now),{version:1,parkings:[]});
const extra=check({plate:'FAKE',lat:1,driver:'FAKE'}).parkings[0];
assert.ok(!('plate' in extra)&&!('lat' in extra)&&!('driver' in extra));
assert.equal(check({observedAt:'2026-11-14T10:30:00+01:00'}).parkings[0].observedAt,'2026-11-14T09:30:00.000Z');
const input={version:1,parkings:[p]}, before=JSON.stringify(input);
assert.deepEqual(validate(JSON.parse(JSON.stringify(validate(input,now))),now),validate(input,now));
assert.equal(JSON.stringify(input),before,'validation sans mutation');
console.log('OK : limites, fraîcheur, inconnus, dates, import/export et champs autorisés.');
