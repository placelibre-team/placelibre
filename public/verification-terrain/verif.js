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
    const retiree = decision === 'garder-a' ? paire.b : decision === 'garder-b' ? paire.a : null;
    places.filter(p => p.seg === paire.a || p.seg === paire.b).forEach(p => {
      const cur = rel.places[p.id];
      if(p.seg === retiree) rel.places[p.id] = {etat:'absente', motif:'doublon de la file ' + (retiree === paire.a ? paire.b : paire.a), auto:cle, t:Date.now()};
      else if(cur && cur.auto === cle) delete rel.places[p.id];   // décision changée : on annule le retrait automatique
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
  function verifierExport(ex, places){
    const pb = [], ids = new Set(places.map(p => p.id));
    if(!ex || ex.format !== FORMAT) return ['ce fichier n’est pas un export de vérification PlaceLibre'];
    if(ex.v > VERSION) pb.push('export d’une version plus récente de l’outil (v' + ex.v + ')');
    (ex.places || []).forEach(v => {
      if(!ids.has(v.id)) pb.push(v.id + ' : place inconnue du registre');
      if(!ETATS.includes(v.etat)) pb.push(v.id + ' : état inconnu « ' + v.etat + ' »');
      if(v.type != null && !TYPES_PLACE.includes(v.type)) pb.push(v.id + ' : type inconnu « ' + v.type + ' »');
      if(v.etat === 'deplacee' && !(Number.isFinite(v.lat) && Number.isFinite(v.lng))) pb.push(v.id + ' : déplacée sans position');
      if(v.etat === 'absente' && !v.motif) pb.push(v.id + ' : retirée sans motif');
    });
    return pb;
  }

  const api = {FORMAT, VERSION, PRECISION_MAX, ETATS, TYPES_PLACE, dist, filesParalleles, parDistance,
    nouveauReleve, deciderFiles, resume, exporter, verifierExport};
  if(typeof module === 'object' && module.exports) module.exports = api; else root.VERIF = api;
})(this);
