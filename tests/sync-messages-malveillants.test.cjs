/* Messages malveillants ou abîmés reçus sur le canal : ils ne doivent ni casser l'affichage,
   ni gonfler le stockage du téléphone, ni fausser l'état des places. Aucun réseau. */
const assert = require('node:assert/strict');
const {telephone} = require('./aide-telephone.cjs');

const tel = telephone(), app = tel.app, place = app.PLACES[0].id, now = Date.now();
let n = 0;
const recevoir = ev => app.receive({event:'message', id:'m' + (++n), time:Math.floor(Date.now()/1000), message:JSON.stringify(ev)}, true);
const message = extra => Object.assign({v:1, id:'e' + (++n), slot:place, k:'free', ts:now - 1000, by:'Tom', src:'signalement'}, extra || {});

function refuser(ev){
  const avant = JSON.stringify(app.S);
  assert.equal(recevoir(ev), false, 'message invalide accepté : ' + ev.k);
  assert.equal(JSON.stringify(app.S), avant, 'un message refusé a modifié le journal ou l’état');
}

// 1. Champs trop longs : refusés ou coupés, le stockage ne gonfle pas
refuser(message({id:'x'.repeat(200000)}));
recevoir(message({by:'B'.repeat(200000)}));
recevoir(message({src:'S'.repeat(200000)}));
recevoir(message({dev:'D'.repeat(200000)}));
const taille = JSON.stringify(app.S).length;
assert.ok(taille < 50000, 'stockage gonflé par des champs énormes : ' + taille + ' caractères');
assert.ok(app.S.journal.every(e => String(e.id).length <= 64 && String(e.by).length <= 30), 'id ou prénom trop long conservé');

// 2. Types inattendus : pas de « [object Object] », pas de NaN dans l'état
recevoir(message({by:{a:1}, src:['x'], acc:'loin'}));
refuser(message({k:'soon', eta:'bientôt'}));
refuser(message({k:'soon', eta:now + 1e12}));                    // départ « dans 30 ans »
refuser(message({k:'soon', eta:now - 1000 + 15*60e3 + 1}));       // juste au-delà de la limite
const st = app.S.slotState[place] || {};
for(const [k, v] of Object.entries(st)) if(typeof v === 'number') assert.ok(Number.isFinite(v), 'état ' + k + ' non fini : ' + v);
assert.ok(!(st.soon > now + 3600e3), 'départ annoncé dans un futur absurde accepté : ' + st.soon);
assert.ok(app.S.journal.every(e => typeof e.by === 'string' && !/object/.test(e.by)), 'prénom non textuel conservé');
assert.ok(app.S.journal.every(e => e.acc == null || (Number.isFinite(e.acc) && e.acc >= 0)), 'précision GPS invalide conservée');
const s = app.slotState(place, now);
assert.ok(s.k && !Object.values(s).some(v => typeof v === 'number' && !Number.isFinite(v)), 'affichage cassé : ' + JSON.stringify(s));

// 3. Contrôles abîmés : résultat, horizon ou départ inconnus → refusés
refuser(message({k:'ctl', etat:'piraté', h:5, dep:'d1'}));
refuser(message({k:'ctl', etat:'libre', h:999, dep:'d1'}));
refuser(message({k:'ctl', etat:'libre', h:5, dep:{}}));
refuser(message({k:'ctl', etat:'libre', h:5, dep:'x'.repeat(65)}));

// 4. Un message valide passe toujours, et un prénom avec du HTML est gardé tel quel (échappé à l'affichage)
const r = recevoir(message({by:'<img src=x onerror=alert(1)>', id:'valide-1', ts:now - 500}));
assert.ok(r && r.applied, 'message valide refusé');
assert.equal(app.S.slotState[place].by, '<img src=x onerror=alert(1)>'.slice(0, 30));

// 5. Les vrais départs et contrôles valides passent aussi par receive().
const depart = recevoir(message({id:'depart-valide', k:'soon', ts:now, eta:now + 15*60e3}));
assert.ok(depart && depart.applied, 'départ valide refusé à la limite de 15 min');
assert.equal(depart.ev.k, 'soon');
assert.equal(depart.ev.eta, now + 15*60e3);
assert.equal(app.S.journal.find(e => e.id === 'depart-valide').type, 'depart');
for(const etat of ['libre', 'occupee', 'non_observe']){
  for(const h of [5, 10, 30]){
    const id = 'controle-' + etat + '-' + h;
    const controle = recevoir(message({id, k:'ctl', ts:now, etat, h, dep:'depart-valide'}));
    assert.ok(controle && controle.fresh, 'contrôle valide refusé : ' + etat + '/' + h);
    const ligne = app.S.journal.find(e => e.id === id);
    assert.equal(ligne.type, 'controle');
    assert.equal(ligne.etat, etat);
    assert.equal(ligne.horizon, h);
    assert.equal(ligne.departId, 'depart-valide');
  }
}

console.log('OK : champs trop longs, types inattendus, départs absurdes et contrôles abîmés sont neutralisés.');
