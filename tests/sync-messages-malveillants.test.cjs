/* Messages malveillants ou abîmés reçus sur le canal : ils ne doivent ni casser l'affichage,
   ni gonfler le stockage du téléphone, ni fausser l'état des places. Aucun réseau. */
const assert = require('node:assert/strict');
const {telephone} = require('./aide-telephone.cjs');

const tel = telephone(), app = tel.app, place = app.PLACES[0].id, now = Date.now();
let n = 0;
const recevoir = ev => app.receive({event:'message', id:'m' + (++n), time:Math.floor(Date.now()/1000), message:JSON.stringify(ev)}, true);
const ok = (ev, extra) => Object.assign({v:1, id:'e' + (++n), slot:place, k:'free', ts:now - 1000, by:'Tom', src:'signalement'}, extra || {});

// 1. Champs trop longs : refusés ou coupés, le stockage ne gonfle pas
recevoir(ok({}, {id:'x'.repeat(200000)}));
recevoir(ok({}, {by:'B'.repeat(200000)}));
recevoir(ok({}, {src:'S'.repeat(200000)}));
recevoir(ok({}, {dev:'D'.repeat(200000)}));
const taille = JSON.stringify(app.S).length;
assert.ok(taille < 50000, 'stockage gonflé par des champs énormes : ' + taille + ' caractères');
assert.ok(app.S.journal.every(e => String(e.id).length <= 64 && String(e.by).length <= 30), 'id ou prénom trop long conservé');

// 2. Types inattendus : pas de « [object Object] », pas de NaN dans l'état
recevoir(ok({}, {by:{a:1}, src:['x'], acc:'loin'}));
recevoir(ok({k:'soon'}, {eta:'bientôt'}));
recevoir(ok({k:'soon'}, {eta:now + 1e12}));                       // départ « dans 30 ans »
const st = app.S.slotState[place] || {};
for(const [k, v] of Object.entries(st)) if(typeof v === 'number') assert.ok(Number.isFinite(v), 'état ' + k + ' non fini : ' + v);
assert.ok(!(st.soon > now + 3600e3), 'départ annoncé dans un futur absurde accepté : ' + st.soon);
assert.ok(app.S.journal.every(e => typeof e.by === 'string' && !/object/.test(e.by)), 'prénom non textuel conservé');
assert.ok(app.S.journal.every(e => e.acc == null || (Number.isFinite(e.acc) && e.acc >= 0)), 'précision GPS invalide conservée');
const s = app.slotState(place, now);
assert.ok(s.k && !Object.values(s).some(v => typeof v === 'number' && !Number.isFinite(v)), 'affichage cassé : ' + JSON.stringify(s));

// 3. Contrôles abîmés : résultat, horizon ou départ inconnus → refusés
const avant = app.S.journal.filter(e => e.type === 'controle').length;
recevoir(ok({k:'ctl'}, {etat:'piraté', h:5, dep:'d1'}));
recevoir(ok({k:'ctl'}, {etat:'libre', h:999, dep:'d1'}));
recevoir(ok({k:'ctl'}, {etat:'libre', h:5, dep:{}}));
assert.equal(app.S.journal.filter(e => e.type === 'controle').length, avant, 'contrôle invalide enregistré');

// 4. Un message valide passe toujours, et un prénom avec du HTML est gardé tel quel (échappé à l'affichage)
const r = recevoir(ok({}, {by:'<img src=x onerror=alert(1)>', id:'valide-1', ts:now - 500}));
assert.ok(r && r.applied, 'message valide refusé');
assert.equal(app.S.slotState[place].by, '<img src=x onerror=alert(1)>'.slice(0, 30));

console.log('OK : champs trop longs, types inattendus, départs absurdes et contrôles abîmés sont neutralisés.');
