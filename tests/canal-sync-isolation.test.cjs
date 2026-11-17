/* Intégration canaux + synchronisation : six canaux sur le même stockage navigateur.
   Le vrai state.js/sync.js s'exécute en VM ; tous les fetch sont simulés, aucun réseau. */
const fs = require('node:fs'), vm = require('node:vm');
const assert = require('node:assert/strict');
const SOURCE = ['config.js', 'places.js', 'state.js', 'geometry.js', 'model.js', 'journal.js', 'sync.js']
  .map(f => fs.readFileSync('public/js/' + f, 'utf8')).join('\n');
const store = {};
const cleA = 'aaaaaaaaaaaaaaaaaaaaaaaa', cleB = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function ouvrir({cle = '', test = false}){
  // Effacer seulement la sélection de canal simule le retour au public, sans toucher aux données.
  if(!cle){ delete store['plj:cle']; delete store['plj:cle:test']; }
  const essais = [];
  let online = false;
  const ctx = vm.createContext({URLSearchParams, console, Date, Math, JSON,
    location:{search:test ? '?canal=test' : '', hash:cle ? '#cle=' + cle : '', pathname:'/'},
    history:{replaceState:() => {}},
    localStorage:{getItem:k => store[k] ?? null, setItem:(k, v) => { store[k] = v; }},
    document:{getElementById:() => ({}), addEventListener:() => {}, visibilityState:'visible'},
    addEventListener:() => {}, setInterval:() => 0, setTimeout, clearTimeout,
    render:() => {}, renderStatus:() => {}, toast:() => {},
    fetch:async (url, opts) => {
      assert.equal(opts.method, 'POST');
      const ev = JSON.parse(opts.body); essais.push({url, ev, online});
      if(!online) throw new Error('hors ligne simulé');
      return {ok:true};
    }
  });
  vm.runInContext(SOURCE + '\nrebuildSlots(); this.app = {S, KEY, BUS, share, flushOutbox, PLACES};', ctx);
  return {app:ctx.app, essais, connecter:() => { online = true; }};
}

(async () => {
  const cas = [
    {id:'public', cle:'', test:false}, {id:'public-test', cle:'', test:true},
    {id:'groupe-a', cle:cleA, test:false}, {id:'groupe-a-test', cle:cleA, test:true},
    {id:'groupe-b', cle:cleB, test:false}, {id:'groupe-b-test', cle:cleB, test:true}
  ];
  const telephones = cas.map(c => ouvrir(c));
  assert.equal(new Set(telephones.map(t => t.app.KEY)).size, cas.length);
  assert.equal(new Set(telephones.map(t => t.app.BUS)).size, cas.length);

  // Après les changements d'invitation, les onglets déjà ouverts gardent leur propre canal.
  for(let i = 0; i < cas.length; i++){
    const {app, essais} = telephones[i], c = cas[i];
    app.share(app.PLACES[0].id, 'free', {id:c.id, by:'Test fictif', src:'test'});
    await app.flushOutbox();
    assert.equal(app.S.journal.length, 1);
    assert.equal(app.S.outbox.length, 1);
    assert.equal(app.S.slotLog[app.PLACES[0].id].length, 1);
    assert.equal(app.S.journal[0].id, c.id);
    assert.ok(essais.every(e => e.url === app.BUS && e.ev.id === c.id));
    assert.equal(JSON.parse(store[app.KEY]).outbox[0].id, c.id);
  }

  // Rouvrir chacun des canaux retrouve uniquement sa file/journal. Les envois des autres attendent.
  for(let i = 0; i < cas.length; i++){
    const tel = ouvrir(cas[i]), {app} = tel, c = cas[i];
    assert.equal(app.S.journal.length, 1);
    assert.equal(app.S.journal[0].id, c.id);
    assert.equal(app.S.outbox.length, 1);
    assert.equal(app.S.outbox[0].id, c.id);
    assert.equal(app.S.slotLog[app.PLACES[0].id][0].id, c.id);
    tel.connecter();
    assert.equal(await app.flushOutbox(), 1);
    assert.equal(tel.essais.length, 1);
    assert.equal(tel.essais[0].url, telephones[i].app.BUS);
    assert.equal(tel.essais[0].ev.id, c.id);
    assert.equal(app.S.outbox.length, 0);
    for(let j = i + 1; j < cas.length; j++){
      const autre = JSON.parse(store[telephones[j].app.KEY]);
      assert.equal(autre.outbox.length, 1);
      assert.equal(autre.outbox[0].id, cas[j].id);
    }
  }
  console.log('OK : vrai journal/outbox isolés entre public, deux groupes et leurs trois canaux de test ; reprises sans fuite.');
})().catch(e => { console.error(e); process.exitCode = 1; });
