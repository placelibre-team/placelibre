/* Deux téléphones reçoivent les mêmes signalements dans des ordres différents, avec doublons :
   ils doivent afficher exactement le même état (et compter les mêmes observations). */
const assert = require('node:assert/strict');
const {telephone} = require('./aide-telephone.cjs');

const ref = telephone().app, [p1, p2, p3] = ref.PLACES.map(p => p.id);
const T0 = Date.now() - 3600e3;

// Petit générateur pseudo-aléatoire reproductible
let seed = 42; const rnd = () => (seed = (seed*1103515245 + 12345) % 2147483648)/2147483648;
const shuffle = a => { a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd()*(i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function lot(n){
  const people = ['Tom', 'Shad', 'Stan', 'Anthony', ''], kinds = ['soon', 'free', 'occ', 'ctl'], evs = [];
  for(let i = 0; i < n; i++){
    const k = kinds[Math.floor(rnd()*4)], ts = T0 + Math.floor(rnd()*20)*30e3;   // heures souvent égales ou proches
    const ev = {v:1, id:'e' + i, slot:[p1, p2, p3][Math.floor(rnd()*3)], k, ts, by:people[Math.floor(rnd()*5)], dev:'tel' + Math.floor(rnd()*3), src:'test'};
    if(k === 'soon') ev.eta = ts + 45e3;
    if(k === 'ctl'){ ev.etat = ['libre', 'occupee', 'non_observe'][Math.floor(rnd()*3)]; ev.dep = 'd'; ev.h = 5; }
    evs.push(ev);
  }
  return evs;
}
const trie = o => o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().reduce((r, k) => (r[k] = trie(o[k]), r), {}) : o;
const etat = app => JSON.stringify(trie({st:app.S.slotState, obs:app.S.obs}));

for(let essai = 0; essai < 200; essai++){
  const evs = lot(25), a = telephone().app, b = telephone().app;
  evs.forEach(e => a.applyEv(Object.assign({}, e)));
  const recu = shuffle(evs.concat(evs.slice(0, 8)));                 // ordre différent + doublons
  recu.forEach(e => b.applyEv(Object.assign({}, e)));
  assert.equal(etat(b), etat(a), 'états différents à l’essai ' + essai);
}

// Message plus ancien reçu en retard : pris en compte comme s'il était arrivé à l'heure.
{
  const a = telephone().app, b = telephone().app;
  const occ = {v:1, id:'o1', slot:p1, k:'occ', ts:T0, by:'Tom'}, free = {v:1, id:'f1', slot:p1, k:'free', ts:T0 + 600e3, by:'Shad'};
  a.applyEv(occ); a.applyEv(free); b.applyEv(free); b.applyEv(occ);
  assert.equal(JSON.stringify(trie(b.S.slotState[p1])), JSON.stringify(trie(a.S.slotState[p1])));
  assert.equal(b.S.slotState[p1].occ, T0, 'arrivée ancienne perdue');
}

// Contradiction : occupée puis « libre » 30 s après par quelqu'un d'autre → reste occupée, signalée.
{
  const a = telephone().app;
  a.applyEv({v:1, id:'c1', slot:p2, k:'occ', ts:T0, by:'Tom'});
  a.applyEv({v:1, id:'c2', slot:p2, k:'free', ts:T0 + 30e3, by:'Shad'});
  const st = a.S.slotState[p2];
  assert.ok(st.occ === T0 && !(st.free > st.occ), 'la place devrait rester occupée');
  assert.equal(st.conflict, true, 'contradiction non signalée');
  // La même personne qui se corrige n'est pas une contradiction.
  const b = telephone().app;
  b.applyEv({v:1, id:'s1', slot:p2, k:'occ', ts:T0, by:'Tom'});
  b.applyEv({v:1, id:'s2', slot:p2, k:'free', ts:T0 + 30e3, by:'Tom'});
  assert.ok(b.S.slotState[p2].free > b.S.slotState[p2].occ && !b.S.slotState[p2].conflict);
  // Sans prénom, le même téléphone (dev) qui se corrige n'est pas non plus une contradiction.
  const c = telephone().app;
  c.applyEv({v:1, id:'t1', slot:p2, k:'occ', ts:T0, by:'', dev:'tel-a'});
  c.applyEv({v:1, id:'t2', slot:p2, k:'free', ts:T0 + 30e3, by:'', dev:'tel-a'});
  assert.ok(c.S.slotState[p2].free > c.S.slotState[p2].occ && !c.S.slotState[p2].conflict, 'correction sans prénom ignorée');
  // Deux téléphones anonymes différents : contradiction.
  const d = telephone().app;
  d.applyEv({v:1, id:'u1', slot:p2, k:'occ', ts:T0, by:'', dev:'tel-a'});
  d.applyEv({v:1, id:'u2', slot:p2, k:'free', ts:T0 + 30e3, by:'', dev:'tel-b'});
  assert.equal(d.S.slotState[p2].conflict, true);
  // Un signalement net 10 min plus tard lève la contradiction.
  a.applyEv({v:1, id:'c3', slot:p2, k:'free', ts:T0 + 600e3, by:'Anthony'});
  assert.ok(a.S.slotState[p2].free === T0 + 600e3 && !a.S.slotState[p2].conflict);
}

// Libérée puis reprise par une autre voiture : enchaînement normal, pas une contradiction.
{
  const a = telephone().app;
  a.applyEv({v:1, id:'n1', slot:p3, k:'free', ts:T0, by:'Tom'});
  a.applyEv({v:1, id:'n2', slot:p3, k:'occ', ts:T0 + 20e3, by:'Shad'});
  assert.ok(a.S.slotState[p3].occ === T0 + 20e3 && !a.S.slotState[p3].conflict);
}

// Doublon : renvoyé ou reçu deux fois, compté une seule fois.
{
  const a = telephone().app, ev = {v:1, id:'d1', slot:p1, k:'free', ts:T0, by:'Tom'};
  assert.equal(a.applyEv(Object.assign({}, ev)), true);
  assert.equal(a.applyEv(Object.assign({}, ev)), false);
  assert.equal(a.S.slotLog[p1].length, 1);
}

// Historique plein : un très vieux signalement relu plus tard (relecture du canal) n'est pas recompté.
{
  const a = telephone().app;
  for(let i = 0; i < 45; i++) a.applyEv({v:1, id:'h' + String(i).padStart(2, '0'), slot:p3, k:'free', ts:T0 + i*1000, by:'Tom'});
  const avant = JSON.stringify(a.S.obs);
  assert.equal(a.S.slotLog[p3].length, 40);
  assert.equal(a.applyEv({v:1, id:'h00', slot:p3, k:'free', ts:T0, by:'Tom'}), false, 'vieux signalement réintégré');
  assert.equal(JSON.stringify(a.S.obs), avant, 'observation comptée deux fois');
}

console.log('OK : 200 ordres d’arrivée différents donnent le même état ; retards, doublons et contradictions gérés.');
