/* Relecture après coupure : le direct ne doit pas déplacer la borne d'un rattrapage en échec.
   HTTP et EventSource sont simulés ; aucune requête réseau n'est envoyée. */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {telephone} = require('./aide-telephone.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const T0 = Math.floor(Date.now()/1000) - 1800;
const response = messages => ({ok:true, text:async () => messages.map(JSON.stringify).join('\n')});

function receiver(){
  const ctx = telephone(), intervals = [], visibility = [], urls = [];
  let stream;
  ctx.EventSource = function(url){ assert.equal(url, ctx.app.BUS + '/sse'); stream = this; };
  ctx.setInterval = (fn, delay) => { assert.equal(delay, 30000); intervals.push(fn); };
  ctx.document.addEventListener = (event, fn) => { assert.equal(event, 'visibilitychange'); visibility.push(fn); };
  const queue = [];
  ctx.fetch = async (url, options) => {
    assert.equal(options, undefined, 'ce test ne doit pas envoyer de signalement');
    assert.ok(url.startsWith(ctx.app.BUS + '/json?poll=1&since='));
    urls.push(url);
    assert.ok(queue.length, 'relecture inattendue');
    const next = queue.shift();
    if(next instanceof Error) throw next;
    return await next;
  };
  const message = (id, time, index = 0) => ({event:'message', id, time,
    message:JSON.stringify({v:1, id, slot:ctx.app.PLACES[index].id, k:'free', ts:time*1000, dev:'other'})});
  return {ctx, queue, urls, intervals, visibility, message,
    start:() => vm.runInContext('syncStart()', ctx),
    get stream(){ return stream; },
    get synced(){ return vm.runInContext('syncOk', ctx); },
    has:(index, id) => (ctx.app.S.slotLog[ctx.app.PLACES[index].id] || []).some(e => e.id === id)};
}

(async () => {
  // Démarrage hors ligne, deuxième échec à l'ouverture SSE, puis message direct récent.
  // Un retour dans l'appli doit encore relire « all », puis arrêter les retries après le succès.
  {
    const r = receiver();
    r.queue.push(new Error('hors ligne'), {ok:false, status:503});
    await r.start();
    r.stream.onopen(); await tick();
    assert.equal(r.synced, false, 'le direct seul ne prouve pas que le rattrapage a réussi');
    r.stream.onmessage({data:JSON.stringify(r.message('live', T0 + 600, 1))});
    r.queue.push(response([r.message('missed', T0), r.message('live', T0 + 600, 1)]));
    r.visibility[0](); await tick();
    assert.equal(r.urls.length, 3);
    assert.ok(r.urls.every(url => url.endsWith('since=all')), 'la borne initiale a été perdue');
    assert.ok(r.has(0, 'missed') && r.has(1, 'live'));
    assert.equal(r.ctx.app.S.slotLog[r.ctx.app.PLACES[1].id].length, 1, 'écho de rattrapage dupliqué');
    assert.equal(r.synced, true);
    r.intervals[0](); await tick();
    assert.equal(r.urls.length, 3, 'relecture inutile après succès');
  }
  // Après une vraie coupure, échec HTTP puis reprise périodique depuis la borne de coupure,
  // et non depuis le dernier message direct (qui est dix minutes plus récent).
  {
    const r = receiver();
    r.queue.push(response([r.message('initial', T0)])); await r.start(); r.stream.onopen();
    r.stream.onerror();
    r.queue.push(new Error('réseau')); r.stream.onopen(); await tick();
    r.stream.onmessage({data:JSON.stringify(r.message('recent', T0 + 600, 1))});
    r.queue.push(response([r.message('during-gap', T0 + 30)]));
    r.intervals[0](); await tick();
    assert.ok(r.urls.slice(1).every(url => url.endsWith('since=' + (T0 - 120))));
    assert.ok(r.has(0, 'during-gap'));
    assert.equal(r.synced, true);
  }
  // Une seconde coupure pendant une relecture ne doit pas être effacée par sa réponse tardive.
  // Les déclencheurs simultanés partagent la même requête ; le retour réseau retente ensuite.
  {
    const r = receiver(); let finish;
    r.queue.push(response([r.message('initial', T0)])); await r.start(); r.stream.onopen();
    r.stream.onerror();
    r.queue.push(new Promise(resolve => { finish = resolve; }));
    r.stream.onopen(); r.visibility[0](); r.intervals[0]();
    assert.equal(r.urls.length, 2, 'plusieurs rattrapages simultanés');
    r.stream.onerror(); r.stream.onopen();
    finish(response([r.message('partial', T0 + 30)])); await tick();
    assert.equal(r.synced, false, 'la deuxième coupure a été oubliée');
    r.queue.push(response([r.message('last-gap', T0 + 60)]));
    r.ctx.listeners.online.forEach(fn => fn()); await tick();
    assert.ok(r.has(0, 'last-gap'));
    assert.equal(r.urls[2], r.urls[1], 'la borne de la seconde coupure a avancé trop tôt');
    assert.equal(r.synced, true);
  }
  console.log('OK : rattrapage réessayé sans perdre la borne, sans doublons ni courses entre coupures.');
})().catch(error => { console.error(error); process.exitCode = 1; });
