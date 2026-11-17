/* PlaceLibre · vérification terrain : calculs sans interface (aussi utilisés par les tests et par
   outils/appliquer-verification.js). Aucune donnée ne quitte le téléphone : tout reste dans le navigateur
   jusqu'à l'export. */
'use strict';
(function(root){
  const R = 6371e3;
  const FORMAT = 'placelibre-verification', VERSION = 1;
  const PRECISION_MAX = 8;          // m : au-delà, une position GPS ne sert pas à déplacer une place
  const ETATS = ['ok', 'absente', 'deplacee'];
  const TYPES_PLACE = ['pay', 'free', 'blue', 'res', 'deliv', 'pmr', 'unk'];

  function dist(a, b){
    const x = (b.lng - a.lng)*Math.PI/180*Math.cos((a.lat + b.lat)/2*Math.PI/180), y = (b.lat - a.lat)*Math.PI/180;
    return Math.hypot(x, y)*R;
  }

  /* Files parallèles proches : même rue, orientation voisine, places à moins de `maxM` mètres en moyenne.
     Sur place : soit les deux côtés de la rue, soit la même file dessinée deux fois (doublon). */
  function filesParalleles(places, maxM = 8, maxDeg = 15){
    const parSeg = {};
    places.forEach(p => (parSeg[p.seg] = parSeg[p.seg] || []).push(p));
    const segs = Object.keys(parSeg).sort(), out = [];
    const angle = (a, b) => { let d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
    for(let i = 0; i < segs.length; i++) for(let j = i + 1; j < segs.length; j++){
      const A = parSeg[segs[i]], B = parSeg[segs[j]];
      if(A[0].rue !== B[0].rue || angle(A[0].cap, B[0].cap) > maxDeg) continue;
      const proches = A.map(a => Math.min(...B.map(b => dist(a, b)))).filter(d => d <= maxM);
      if(proches.length < Math.min(2, A.length)) continue;
      out.push({a:segs[i], b:segs[j], rue:A[0].rue, nA:A.length, nB:B.length,
        distance:Math.round(proches.reduce((s, d) => s + d, 0)/proches.length*10)/10, communes:proches.length});
    }
    return out;
  }

  // Places triées de la plus proche à la plus éloignée d'une position
  function parDistance(places, pos){
    return places.map(p => ({p, d:pos ? dist(pos, p) : null}))
      .sort((x, y) => x.d == null || y.d == null ? x.p.id.localeCompare(y.p.id, 'fr', {numeric:true}) : x.d - y.d);
  }

  function nouveauReleve(){ return {debut:Date.now(), releveur:'', places:{}, files:{}, ajouts:[], regles:[]}; }

  // Décision sur une paire de files : 'deux-cotes', 'garder-a', 'garder-b'
  function deciderFiles(rel, paire, decision, places){
    const cle = paire.a + '|' + paire.b;
    rel.files[cle] = {decision, t:Date.now()};
    // Recalculer l'ensemble des décisions : une file peut participer à plusieurs paires.
    // Les observations individuelles restent prioritaires sur les décisions groupées.
    const retraits = new Map();
    Object.entries(rel.files).forEach(([k, f]) => {
      const [a, b] = k.split('|');
      const retiree = f.decision === 'garder-a' ? b : f.decision === 'garder-b' ? a : null;
      if(!retiree) return;
      if(!retraits.has(retiree)) retraits.set(retiree, []);
      retraits.get(retiree).push({cle:k, gardee:retiree === a ? b : a, t:f.t});
    });
    places.forEach(p => {
      const cur = rel.places[p.id];
      if(cur && !cur.auto) return;
      const causes = retraits.get(p.seg);
      if(causes) rel.places[p.id] = Object.assign({}, cur, {etat:'absente',
        motif:'doublon de la file ' + causes.map(c => c.gardee).join(', '),
        auto:causes.map(c => c.cle).sort().join(','), t:Math.max(...causes.map(c => c.t))});
      else if(cur && cur.auto) delete rel.places[p.id];
    });
    return rel;
  }

  function resume(rel, places){
    const n = {total:places.length, verifiees:0, ok:0, absente:0, deplacee:0, type:0};
    places.forEach(p => { const v = rel.places[p.id]; if(!v) return; n.verifiees++; n[v.etat]++; if(v.type) n.type++; });
    n.ajouts = rel.ajouts.length; n.regles = rel.regles.length;
    return n;
  }

  // Export : uniquement ce qui a été relevé, avec la version du registre utilisée
  function exporter(rel, places){
    const ids = new Set(places.map(p => p.id));
    return {
      format:FORMAT, v:VERSION, exporte:new Date().toISOString(), debut:new Date(rel.debut).toISOString(),
      releveur:rel.releveur || '', nbPlacesRegistre:places.length,
      places:Object.keys(rel.places).filter(id => ids.has(id)).sort().map(id => Object.assign({id}, rel.places[id])),
      files:Object.keys(rel.files).sort().map(k => Object.assign({paire:k}, rel.files[k])),
      ajouts:rel.ajouts.slice(), regles:rel.regles.slice()
    };
  }

  // Contrôle d'un export (avant de l'appliquer au registre). Renvoie la liste des problèmes.
  function verifierExport(ex, places, bbox){
    const pb = [], ids = new Set(places.map(p => p.id)), segs = new Set(places.map(p => p.seg));
    const rues = new Set(places.map(p => p.rue));
    const objet = x => x !== null && typeof x === 'object' && !Array.isArray(x);
    if(!objet(ex) || ex.format !== FORMAT) return ['ce fichier n’est pas un export de vérification PlaceLibre'];
    if(ex.v !== VERSION) pb.push('version d’export non prise en charge : attendu v' + VERSION);
    const dateISO = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
      Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
    for(const k of ['debut', 'exporte']) if(!dateISO(ex[k])) pb.push(k + ' : date ISO invalide');
    if(!Number.isSafeInteger(ex.nbPlacesRegistre) || ex.nbPlacesRegistre < 1) pb.push('nombre de places du registre invalide');
    const texte = (v, k, at, obligatoire = false) => {
      if(v[k] == null && !obligatoire) return;
      if(typeof v[k] !== 'string' || (obligatoire && !v[k].trim())) pb.push(at + ' : ' + k + ' doit être un texte' + (obligatoire ? ' non vide' : ''));
    };
    texte(ex, 'releveur', 'relevé');
    const horodatage = (v, at) => {
      if(!Number.isSafeInteger(v.t) || v.t < 0 || v.t > 8640000000000000) pb.push(at + ' : horodatage invalide');
    };
    const position = (v, at) => {
      if(!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || v.lat <= -90 || v.lat >= 90 || v.lng < -180 || v.lng > 180)
        pb.push(at + ' : coordonnées invalides');
      else if(bbox && !(+v.lat.toFixed(7) > bbox[0] && +v.lat.toFixed(7) < bbox[2] && +v.lng.toFixed(7) > bbox[1] && +v.lng.toFixed(7) < bbox[3]))
        pb.push(at + ' : coordonnées hors de la zone du pilote');
      if(!Number.isFinite(v.acc) || v.acc < 0) pb.push(at + ' : précision GPS absente ou invalide');
    };
    const tableau = k => {
      if(!Array.isArray(ex[k])){ pb.push(k + ' : tableau attendu'); return []; }
      return ex[k].filter((v, i) => {
        if(objet(v)) return true;
        pb.push(k + '[' + i + '] : objet attendu'); return false;
      });
    };
    const vus = new Set();
    tableau('places').forEach(v => {
      const at = typeof v.id === 'string' ? v.id : 'place sans identifiant';
      if(!ids.has(v.id)) pb.push(at + ' : place inconnue du registre');
      if(vus.has(v.id)) pb.push(at + ' : identifiant répété');
      vus.add(v.id);
      if(!ETATS.includes(v.etat)) pb.push(at + ' : état inconnu');
      if(v.type != null && !TYPES_PLACE.includes(v.type)) pb.push(at + ' : type inconnu');
      if(v.etat === 'deplacee') position(v, at);
      texte(v, 'motif', at, v.etat === 'absente'); texte(v, 'note', at); texte(v, 'auto', at);
      horodatage(v, at);
    });
    const pairesVues = new Set();
    tableau('files').forEach(f => {
      const paire = typeof f.paire === 'string' ? f.paire.split('|') : [];
      if(paire.length !== 2 || paire[0] === paire[1] || paire.some(s => !segs.has(s))) pb.push('files : paire inconnue');
      const cle = paire.slice().sort().join('|');
      if(pairesVues.has(cle)) pb.push('files : paire répétée');
      pairesVues.add(cle);
      if(!['deux-cotes', 'garder-a', 'garder-b'].includes(f.decision)) pb.push('files : décision inconnue');
      horodatage(f, 'files');
    });
    tableau('ajouts').forEach((a, i) => {
      const at = 'ajout ' + (i + 1);
      if(!rues.has(a.rue)) pb.push(at + ' : rue inconnue');
      if(!TYPES_PLACE.includes(a.type)) pb.push(at + ' : type inconnu');
      position(a, at); horodatage(a, at); texte(a, 'note', at);
    });
    tableau('regles').forEach((r, i) => {
      const at = 'panneau ' + (i + 1);
      if(!rues.has(r.rue)) pb.push(at + ' : rue inconnue');
      texte(r, 'regle', at, true);
      for(const k of ['troncon', 'horaires', 'tarif']) texte(r, k, at);
      if(r.saison != null && typeof r.saison !== 'boolean') pb.push(at + ' : saison doit être un booléen');
      horodatage(r, at);
    });
    return pb;
  }

  const api = {FORMAT, VERSION, PRECISION_MAX, ETATS, TYPES_PLACE, dist, filesParalleles, parDistance,
    nouveauReleve, deciderFiles, resume, exporter, verifierExport};
  if(typeof module === 'object' && module.exports) module.exports = api; else root.VERIF = api;
})(this);
