/* PlaceLibre · simulateur : environnement isolé
   Charge les VRAIS fichiers de public/js dans un contexte Node, sans navigateur et sans Internet :
   - horloge simulée (on avance le temps à volonté) ;
   - stockage du téléphone en mémoire (rien n'est écrit sur le disque) ;
   - faux canal temps réel (ntfy) en mémoire, qui REFUSE tout canal autre que « -test ».
   Aucun fichier de l'application n'est modifié. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.resolve(__dirname, '..', '..');
// Par défaut on teste le code de ce dépôt. Pour essayer une autre version (par exemple une branche
// extraite dans /tmp/ma-branche/public) : PLACELIBRE_APP=/tmp/ma-branche node tests/simulateur/simulateur.cjs
const RACINE_APP = process.env.PLACELIBRE_APP ? path.resolve(process.env.PLACELIBRE_APP) : RACINE;
// Même ordre que public/index.html, sans la carte, l'interface et le démarrage (map.js, ui.js, main.js)
const MODULES = ['config', 'places', 'state', 'geometry', 'model', 'journal', 'predict', 'sync', 'events'];
const BASE_NTFY = 'https://ntfy.sh/';

/* ---------- Horloge simulée ---------- */
const ceder = () => new Promise(r => setImmediate(r));
function creerHorloge(debut) {
  let maintenant = +debut, suite = 0;
  let minuteries = [];
  const ajouter = (fn, ms, repeter) => {
    const m = {id: ++suite, t: maintenant + Math.max(0, +ms || 0), fn, repeter: repeter ? Math.max(1, +ms) : 0};
    minuteries.push(m);
    return m.id;
  };
  return {
    now: () => maintenant,
    setTimeout: (fn, ms) => ajouter(fn, ms, false),
    setInterval: (fn, ms) => ajouter(fn, ms, true),
    clear: id => { minuteries = minuteries.filter(m => m.id !== id); },
    /* Avance le temps de `ms` millisecondes en déclenchant, dans l'ordre, les minuteries échues.
       Entre deux minuteries on laisse l'appli terminer ses opérations asynchrones (envois, relectures),
       comme dans un vrai navigateur. À appeler avec `await`. */
    async avancer(ms) {
      const cible = maintenant + ms;
      for (;;) {
        minuteries.sort((a, b) => a.t - b.t || a.id - b.id);
        const prochaine = minuteries[0];
        if (!prochaine || prochaine.t > cible) break;
        minuteries.shift();
        maintenant = Math.max(maintenant, prochaine.t);
        if (prochaine.repeter) { prochaine.t += prochaine.repeter; minuteries.push(prochaine); }
        prochaine.fn();
        await ceder();
      }
      maintenant = cible;
      await ceder();
    },
    minutes(n) { return this.avancer(n * 60e3); },
    secondes(n) { return this.avancer(n * 1e3); }
  };
}

/* ---------- Faux ntfy en mémoire ---------- */
function creerBus(horloge) {
  const sujets = {};
  let numero = 0;
  const bus = {
    base: BASE_NTFY,
    violations: [],      // tentatives vers un canal autre que « -test » ou vers un site externe
    envois: [],          // tout ce qui a été publié {sujet, corps}
    nom: url => String(url).slice(BASE_NTFY.length).split('/')[0].split('?')[0],
    sujet(url) { const n = bus.nom(url); return sujets[n] || (sujets[n] = {msgs: [], abonnes: new Set()}); },
    publier(url, corps) {
      const nom = bus.nom(url);
      if (!/-test$/.test(nom)) {
        bus.violations.push(String(url));
        throw new Error('Simulation : écriture refusée sur un canal qui n’est pas un canal de test (' + nom + ')');
      }
      const message = {id: 'm' + (++numero), time: Math.floor(horloge.now() / 1000), event: 'message', topic: nom, message: String(corps)};
      const s = bus.sujet(url);
      s.msgs.push(message);
      bus.envois.push({sujet: nom, corps: String(corps)});
      s.abonnes.forEach(cb => cb(message));
      return message;
    },
    historique: url => bus.sujet(url).msgs.slice(),
    abonner(url, cb) { bus.sujet(url).abonnes.add(cb); return () => bus.sujet(url).abonnes.delete(cb); },
    bloquer(url) { bus.violations.push(String(url)); }
  };
  return bus;
}

/* ---------- Un téléphone virtuel qui fait tourner l'application ---------- */
function creerTelephone({nom = 'Anthony', horloge, bus, canal = 'test'} = {}) {
  const stockage = new Map();
  const localStorage = {
    getItem: k => (stockage.has(k) ? stockage.get(k) : null),
    setItem: (k, v) => { stockage.set(k, String(v)); },
    removeItem: k => { stockage.delete(k); }
  };
  const reseau = {actif: true};
  const rien = () => {};
  const element = () => ({textContent: '', innerHTML: '', hidden: false, style: {}, classList: {add() {}, remove() {}, toggle() {}},
    setAttribute() {}, addEventListener() {}});

  class DateSim extends Date {
    constructor(...a) { if (a.length === 0) super(horloge.now()); else super(...a); }
    static now() { return horloge.now(); }
  }
  async function fetchSim(url, options = {}) {
    if (!reseau.actif) throw new TypeError('Réseau coupé (simulation)');
    if (typeof url !== 'string' || !url.startsWith(BASE_NTFY)) {
      bus.bloquer(url);
      throw new Error('Requête externe bloquée en simulation : ' + url);
    }
    if (options.method === 'POST') { bus.publier(url, options.body); return {ok: true, text: async () => '', json: async () => ({})}; }
    if (/poll=1/.test(url)) {
      const depuis = (/since=([^&]+)/.exec(url) || [])[1];
      const ms = bus.historique(url).filter(m => !depuis || depuis === 'all' || m.time >= Number(depuis));
      const lignes = ms.map(m => JSON.stringify(m)).join('\n');
      return {ok: true, text: async () => lignes, json: async () => ({})};
    }
    return {ok: true, text: async () => '', json: async () => ({})};
  }
  const flux = new Set();          // connexions temps réel ouvertes par l'appli
  const ecouteurs = {};            // addEventListener('online', ...) de l'appli
  class EventSourceSim {
    constructor(url) {
      this.onopen = this.onerror = this.onmessage = null;
      this._stop = bus.abonner(url, m => { if (reseau.actif && this.onmessage) this.onmessage({data: JSON.stringify(m)}); });
      flux.add(this);
      queueMicrotask(() => { if (this.onopen) this.onopen(); });
    }
    close() { this._stop(); flux.delete(this); }
  }

  const bac = {
    console, URLSearchParams, queueMicrotask, JSON, Math,
    location: {search: canal === 'test' ? '?canal=test' : '', pathname: '/'},
    localStorage,
    document: {getElementById: element, createElement: element, visibilityState: 'visible', addEventListener: rien},
    addEventListener: (type, fn) => { (ecouteurs[type] = ecouteurs[type] || []).push(fn); },
    navigator: {geolocation: {watchPosition: () => 1, clearWatch: rien, getCurrentPosition: (ok, ko) => ko(new Error('Simulation : pas de GPS'))}},
    fetch: fetchSim, EventSource: EventSourceSim, Date: DateSim,
    setTimeout: (fn, ms) => horloge.setTimeout(fn, ms), clearTimeout: id => horloge.clear(id),
    setInterval: (fn, ms) => horloge.setInterval(fn, ms), clearInterval: id => horloge.clear(id),
    // Fonctions de la carte et de l'interface (map.js, ui.js) : sans effet en simulation
    render: rien, renderList: rien, renderStatus: rien, renderChecks: rien, renderMapData: rien, renderSettings: rien,
    fly: rien, drawMe: rien, setData: rien
  };
  const ctx = vm.createContext(bac);
  for (const m of MODULES) {
    const f = path.join(RACINE_APP, 'public', 'js', m + '.js');
    new vm.Script(fs.readFileSync(f, 'utf8'), {filename: f}).runInContext(ctx);
  }

  const evalIn = code => vm.runInContext(code, ctx);
  // Les objets viennent d'un autre contexte : on les copie par JSON pour les comparer sans surprise
  const lire = code => { const j = vm.runInContext('JSON.stringify(' + code + ')', ctx); return j === undefined ? undefined : JSON.parse(j); };
  const passer = (nomVar, valeur) => { bac[nomVar] = valeur; };
  const centre = id => { const p = lire('(function(){const s = SLOT_BY_ID[' + JSON.stringify(id) + '];' +
    ' return s ? {lat:s.lat, lng:s.lng} : null;})()'); if (!p) throw new Error('Place inconnue : ' + id); return p; };

  const t = {
    nom, horloge, bus, reseau, evalIn, lire,
    async demarrer() {
      evalIn('S.me = ' + JSON.stringify(nom) + '; rebuildSlots();');
      await evalIn('syncStart()');
    },
    /* Coupe ou rétablit le réseau comme le ferait un navigateur : à la coupure la connexion temps réel
       signale une erreur ; au retour elle se rouvre et l'événement « online » est envoyé à l'appli. */
    couperReseau(coupe) {
      if (!!coupe === !reseau.actif) return;
      reseau.actif = !coupe;
      for (const es of [...flux]) { const f = coupe ? es.onerror : es.onopen; if (f) f.call(es, {}); }
      if (!coupe) (ecouteurs.online || []).forEach(f => f({}));
    },
    reseauActif: () => reseau.actif,
    diagnostic: () => ({connexionsTempsReel: flux.size, ecouteursOnline: (ecouteurs.online || []).length}),
    /* Laisse l'appli terminer ses envois asynchrones (file d'attente, relecture du canal) */
    laisserFaire: () => new Promise(r => setImmediate(r)).then(() => new Promise(r => setImmediate(r))),
    centre,
    places: () => lire('SLOTS.map(s => ({id:s.id, name:s.name, type:s.type, lat:s.lat, lng:s.lng}))'),
    placesDeRue: rue => t.places().filter(p => p.name === rue),
    /* Actions de l'utilisateur */
    async partir(idPlace) { passer('__pos', {...centre(idPlace), acc: 5}); await evalIn('startDepart("manuel", __pos)'); },
    confirmerDepart() { evalIn('confirmMove()'); },
    async arriver(idPlace) { passer('__pos', {...centre(idPlace), acc: 5}); await evalIn('doArrive("manuel", __pos)'); },
    signaler(idPlace, libre) { passer('__id', idPlace); passer('__libre', !!libre); evalIn('report(__id, __libre)'); },
    controlesEnAttente: () => lire('pendingChecks(Date.now()).map(c => ({dep:c.dep.id, slot:c.dep.slot, h:c.h}))'),
    repondreControle(idDepart, h, etat) { passer('__d', idDepart); passer('__h', h); passer('__e', etat); evalIn('answerCheck(__d, __h, __e)'); },
    /* Lectures */
    etatPlace(idPlace) {
      passer('__id', idPlace);
      return lire('(function(){const st = slotState(__id, Date.now()); return Object.assign({}, st, {texte: stateText(st)});})()');
    },
    etatBrut: idPlace => { passer('__id', idPlace); return lire('S.slotState[__id] || null'); },
    journal: () => lire('S.journal'),
    /* Nombre d'envois en attente (file de la PR « signalements fiables »), ou null si l'appli n'en a pas */
    envoisEnAttente: () => lire('typeof S.outbox === "undefined" ? null : S.outbox.length'),
    possede: nomFonction => !!lire('typeof ' + nomFonction + ' === "function"'),
    modele: () => lire('S.model'),
    survie: () => lire('survModel()'),
    prevision(dest, minutesAvantArrivee) {
      passer('__dest', dest); passer('__eta', minutesAvantArrivee);
      return lire('predictArrival(__dest, __eta)');
    },
    probaPlace(idPlace, minutesAvantArrivee) {
      passer('__id', idPlace); passer('__eta', minutesAvantArrivee);
      return lire('(function(){const now = Date.now(), M = survModel();' +
        ' return slotP(SLOT_BY_ID[__id], now, now + __eta*60e3, M, __eta);})()');
    }
  };
  return t;
}

module.exports = {creerHorloge, creerBus, creerTelephone, RACINE, RACINE_APP};
