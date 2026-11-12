/* Coupure réseau : les signalements restent en attente avec leur heure d'origine,
   survivent à une fermeture de l'appli et partent dans l'ordre au retour du réseau. */
const assert = require('node:assert/strict');
const {telephone} = require('./aide-telephone.cjs');

(async () => {
  const tel = telephone(), app = tel.app, place = app.PLACES[0].id;
  assert.ok(app.BUS.endsWith('-test'), 'les tests doivent viser le canal de test');

  // 1. Hors ligne : deux signalements restent dans la file, avec leur heure d'origine.
  const e1 = app.share(place, 'occ', {src:'test'});
  await app.flushOutbox();
  const e2 = app.share(place, 'free', {src:'test'});
  await app.flushOutbox();
  assert.deepEqual(app.S.outbox.map(e => e.id), [e1.id, e2.id], 'file d’attente incorrecte');
  assert.equal(app.S.slotState[place].free, e2.ts, 'l’état local doit changer tout de suite');

  // 2. L'appli est fermée puis rouverte (même stockage) : la file est toujours là.
  const tel2 = telephone({store:tel.store}), app2 = tel2.app;
  assert.deepEqual(app2.S.outbox.map(e => e.id), [e1.id, e2.id], 'file perdue à la fermeture');

  // 3. Erreur du serveur (ex. 429) : rien n'est retiré.
  tel2.fetch = async () => ({ok:false, status:429});
  assert.equal(await app2.flushOutbox(), 0);
  assert.equal(app2.S.outbox.length, 2);

  // 4. Retour du réseau : envoi dans l'ordre, heure d'origine conservée, file vidée.
  const envoyes = [];
  tel2.fetch = async (url, o) => { envoyes.push({url, ev:JSON.parse(o.body)}); return {ok:true, status:200}; };
  await new Promise(r => setTimeout(r, 20));                          // le temps passe pendant la coupure
  assert.equal(await app2.flushOutbox(), 2);
  assert.deepEqual(envoyes.map(x => x.ev.id), [e1.id, e2.id], 'ordre d’envoi incorrect');
  assert.deepEqual(envoyes.map(x => x.ev.ts), [e1.ts, e2.ts], 'heure d’origine modifiée');
  assert.ok(envoyes.every(x => x.url === app2.BUS && x.url.endsWith('-test')), 'envoi hors du canal de test');
  assert.equal(app2.S.outbox.length, 0);

  // 5. Le message revient par le canal (écho) : doublon, ignoré.
  const echo = {event:'message', id:'n1', time:Math.floor(Date.now()/1000), message:JSON.stringify(envoyes[1].ev)};
  const r = app2.receive(echo, true);
  assert.ok(r && !r.applied && !r.fresh, 'l’écho ne doit rien changer');

  // 6. Un autre téléphone reçoit le message en retard : il garde l'heure d'origine.
  const autre = telephone().app;
  autre.receive({event:'message', id:'n2', time:Math.floor(Date.now()/1000), message:JSON.stringify(envoyes[0].ev)}, true);
  assert.equal(autre.S.slotState[place].occ, e1.ts, 'heure d’origine perdue à la réception');

  // 7. Le retour du réseau déclenche l'envoi tout seul (événement « online » du navigateur).
  const tel3 = telephone({store:tel.store});
  let enLigne = false, posts = 0;
  tel3.fetch = async (url, o) => {
    if(o && o.method === 'POST'){ if(!enLigne) throw new Error('hors ligne'); posts++; return {ok:true, status:200}; }
    return {ok:true, text:async () => ''};
  };
  tel3.EventSource = function(){ return {}; };
  tel3.app.S.outbox.push(Object.assign({}, e1, {id:'x-online'}));
  const n0 = tel3.app.S.outbox.length;
  require('node:vm').runInContext('syncStart()', tel3);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(posts, 0); assert.equal(tel3.app.S.outbox.length, n0, 'hors ligne : doit rester en attente');
  enLigne = true; (tel3.listeners.online || []).forEach(f => f());
  await new Promise(r => setTimeout(r, 20));
  assert.equal(posts, n0, 'pas d’envoi au retour du réseau'); assert.equal(tel3.app.S.outbox.length, 0);

  console.log('OK : file d’attente conservée, envoyée dans l’ordre au retour du réseau, heure d’origine préservée.');
})().catch(e => { console.error(e); process.exit(1); });
