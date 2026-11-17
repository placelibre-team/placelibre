/* PlaceLibre · analyse d'un essai à plusieurs téléphones (tâche V0 : délai de réception et erreurs de localisation)
   Usage :
     node outils/analyser-essai.js journal-tom.csv journal-stan.csv [--sortie compte-rendu.md]
   Chaque fichier est le journal exporté par un téléphone (Réglages → Exporter le journal CSV),
   idéalement sur ?canal=test. Le nom du téléphone est celui du fichier (sans extension), ou --noms Tom,Stan.

   Mesures :
   - réception : pour chaque signalement partagé, quel téléphone l'a envoyé, si les autres l'ont reçu,
     et en combien de temps (délai mesuré par le téléphone qui reçoit) ;
   - pertes : signalement présent sur un téléphone et absent d'un autre ;
   - doublons : deux signalements du même type, sur la même place, à moins de 30 s d'écart ;
   - précision GPS au moment du signalement ;
   - contrôles à 5, 10 et 30 min : place encore libre, reprise, non observée.
   Les journaux ne contiennent aucune coordonnée GPS : l'erreur de localisation se mesure par la précision
   annoncée et par les corrections de place (voir le compte rendu). */
'use strict';
const fs = require('fs'), path = require('path');

const PARTAGES = new Set(['depart', 'depart_confirme', 'arrive', 'libre', 'occupee', 'controle']);
const LENT_MS = 10e3, DOUBLON_MS = 30e3;

/* ---------- Lecture du CSV exporté par l'appli (séparateur ;, guillemets, BOM) ---------- */
function lireCSV(texte){
  texte = texte.replace(/^﻿/, '');
  const lignes = [];
  let cur = '', dans = false, ligne = [];
  for(let i = 0; i < texte.length; i++){
    const c = texte[i];
    if(dans){
      if(c === '"' && texte[i + 1] === '"'){ cur += '"'; i++; }
      else if(c === '"') dans = false;
      else cur += c;
    }else if(c === '"') dans = true;
    else if(c === ';'){ ligne.push(cur); cur = ''; }
    else if(c === '\n' || c === '\r'){
      if(c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(cur); cur = '';
      if(ligne.some(x => x !== '')) lignes.push(ligne);
      ligne = [];
    }else cur += c;
  }
  if(cur !== '' || ligne.length){ ligne.push(cur); if(ligne.some(x => x !== '')) lignes.push(ligne); }
  if(!lignes.length) return [];
  const tete = lignes[0].map(h => h.trim());
  const attendu = ['id', 'date', 'heure', 'type', 'place'];
  if(!attendu.every(h => tete.includes(h))) throw new Error('ce fichier ne ressemble pas à un journal PlaceLibre (colonnes ' + attendu.join(', ') + ' attendues)');
  return lignes.slice(1).map(l => Object.fromEntries(tete.map((h, i) => [h, (l[i] ?? '').trim()])));
}

const nombre = s => s === '' || s == null ? null : Number(s);
function evenement(r){
  const [a, mo, j] = (r.date || '').split('-').map(Number), [h, mi, s] = (r.heure || '').split(':').map(Number);
  return {id:r.id, t:new Date(a, mo - 1, j, h, mi, s || 0).getTime(), type:r.type, place:r.place, rue:r.rue,
    source:r.source, par:r.par, precision:nombre(r.precision_m), recu:nombre(r.delai_reception_ms),
    depart:r.depart_id, horizon:nombre(r.horizon_min), etat:r.etat};
}

/* ---------- Statistiques ---------- */
function quantile(v, q){
  if(!v.length) return null;
  const s = v.slice().sort((a, b) => a - b), i = (s.length - 1)*q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo])*(i - lo);
}
const sec = ms => ms == null ? '—' : (ms < 10e3 ? (ms/1000).toFixed(1) : Math.round(ms/1000)).toString().replace('.', ',') + ' s';
const pct = (a, b) => b ? Math.round(a/b*100) + ' %' : '—';

function analyser(telephones){
  // telephones : [{nom, evenements:[...]}]
  const noms = telephones.map(t => t.nom), parId = new Map();
  telephones.forEach(tel => tel.evenements.forEach(e => {
    if(!PARTAGES.has(e.type) || e.source === 'auto' || /-auto$/.test(e.id)) return;   // contrôles automatiques : locaux
    if(!parId.has(e.id)) parId.set(e.id, {id:e.id, e, vus:{}});
    parId.get(e.id).vus[tel.nom] = e;
  }));

  const recus = [], pertes = [], rattrapes = [], parEmetteur = {};
  let enDirect = 0;
  parId.forEach(x => {
    const vus = Object.keys(x.vus), locaux = vus.filter(n => x.vus[n].recu == null);
    const emetteur = locaux.length === 1 ? locaux[0] : '?';
    x.emetteur = emetteur;
    parEmetteur[emetteur] = (parEmetteur[emetteur] || 0) + 1;
    noms.filter(n => !x.vus[n]).forEach(n => pertes.push({id:x.id, type:x.e.type, place:x.e.place, t:x.e.t, absent:n, emetteur}));
    vus.forEach(n => {
      const r = x.vus[n].recu;
      if(r != null){ recus.push({id:x.id, type:x.e.type, place:x.e.place, t:x.e.t, recepteur:n, ms:r}); enDirect++; }
    });
    if(locaux.length > 1 && vus.length > 1) rattrapes.push(x);    // reçu au démarrage / à la reconnexion, délai inconnu
  });

  const delais = recus.map(r => r.ms);
  const zeros = recus.filter(r => r.ms === 0).length;

  // Doublons : même type, même place, < 30 s, ids différents (sur l'ensemble des téléphones)
  const tous = [...parId.values()].map(x => x.e).sort((a, b) => a.t - b.t), doublons = [];
  for(let i = 0; i < tous.length; i++) for(let j = i + 1; j < tous.length && tous[j].t - tous[i].t < DOUBLON_MS; j++){
    const a = tous[i], b = tous[j];
    if(a.type === b.type && a.place && a.place === b.place && a.type !== 'controle') doublons.push({a, b, ecart:b.t - a.t});
  }

  // Précision GPS (signalements avec position)
  const precisions = tous.filter(e => e.precision != null).map(e => e.precision);

  // Contrôles : réponses (partagées) et non observés (locaux, une fois par départ)
  const ctl = {};
  telephones.forEach(tel => tel.evenements.filter(e => e.type === 'controle').forEach(e => {
    const k = e.depart + '|' + e.horizon, c = ctl[k] = ctl[k] || {horizon:e.horizon, depart:e.depart, etats:new Set()};
    c.etats.add(e.etat);
  }));
  const parHorizon = {};
  Object.values(ctl).forEach(c => {
    const h = parHorizon[c.horizon] = parHorizon[c.horizon] || {libre:0, occupee:0, non_observe:0, contradictoire:0};
    const reel = [...c.etats].filter(x => x === 'libre' || x === 'occupee');
    if(reel.length > 1) h.contradictoire++;
    else if(reel.length) h[reel[0]]++;
    else h.non_observe++;
  });

  return {noms, nbTelephones:telephones.length, lignes:telephones.map(t => ({nom:t.nom, n:t.evenements.length})),
    partages:parId.size, parEmetteur, enDirect, recus, delais, zeros, pertes, rattrapes, doublons, precisions, parHorizon,
    debut:tous.length ? tous[0].t : null, fin:tous.length ? tous[tous.length - 1].t : null};
}

/* ---------- Compte rendu Markdown ---------- */
function compteRendu(a){
  const d = a.delais, l = [];
  const heure = t => new Date(t).toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'});
  l.push('# Essai à ' + a.nbTelephones + ' téléphones' + (a.debut ? ' du ' + heure(a.debut) + ' au ' + heure(a.fin) : ''), '');
  l.push('Journaux : ' + a.lignes.map(x => x.nom + ' (' + x.n + ' lignes)').join(', ') + '. ' + a.partages + ' signalements partagés distincts.', '');
  if(a.nbTelephones < 2) l.push('> Un seul journal : les délais de réception et les pertes ne peuvent pas être mesurés. Ajouter le journal de l’autre téléphone.', '');

  l.push('## Réception', '');
  l.push('| Mesure | Valeur |', '| --- | --- |');
  l.push('| Réceptions mesurées en direct | ' + a.enDirect + ' |');
  l.push('| Délai médian | ' + sec(quantile(d, .5)) + ' |');
  l.push('| Délai 90 % des cas | ' + sec(quantile(d, .9)) + ' |');
  l.push('| Délai maximal | ' + sec(d.length ? Math.max(...d) : null) + ' |');
  l.push('| Réceptions de plus de ' + LENT_MS/1000 + ' s | ' + d.filter(x => x > LENT_MS).length + ' |');
  l.push('| Reçus au démarrage ou à la reconnexion (délai inconnu) | ' + a.rattrapes.length + ' |');
  l.push('| Signalements absents d’au moins un téléphone | ' + new Set(a.pertes.map(p => p.id)).size + ' |', '');
  if(a.zeros > 0 && a.zeros >= a.recus.length/3)
    l.push('> ⚠ ' + a.zeros + ' réceptions à 0 s : l’horloge d’un téléphone est probablement en avance sur l’autre. Mettre les deux en heure automatique et refaire la mesure.', '');
  const lents = a.recus.filter(r => r.ms > LENT_MS).sort((x, y) => y.ms - x.ms).slice(0, 10);
  if(lents.length){
    l.push('Réceptions lentes :', '', '| Heure | Type | Place | Reçu par | Délai |', '| --- | --- | --- | --- | --- |');
    lents.forEach(r => l.push('| ' + heure(r.t) + ' | ' + r.type + ' | ' + (r.place || '—') + ' | ' + r.recepteur + ' | ' + sec(r.ms) + ' |'));
    l.push('');
  }
  if(a.pertes.length){
    l.push('Signalements absents :', '', '| Heure | Type | Place | Envoyé par | Absent de |', '| --- | --- | --- | --- | --- |');
    a.pertes.slice(0, 20).forEach(p => l.push('| ' + heure(p.t) + ' | ' + p.type + ' | ' + (p.place || '—') + ' | ' + p.emetteur + ' | ' + p.absent + ' |'));
    l.push('', 'Un signalement absent peut venir d’un téléphone hors ligne au moment de l’export, ou d’un journal exporté trop tôt : vérifier avant de conclure à une perte.', '');
  }

  l.push('## Localisation', '');
  const p = a.precisions;
  if(p.length){
    l.push('| Mesure | Valeur |', '| --- | --- |');
    l.push('| Signalements avec précision GPS | ' + p.length + ' |');
    l.push('| Précision médiane | ±' + Math.round(quantile(p, .5)) + ' m |');
    l.push('| Précision 90 % des cas | ±' + Math.round(quantile(p, .9)) + ' m |');
    l.push('| Précision ≤ 10 m | ' + pct(p.filter(x => x <= 10).length, p.length) + ' |');
    l.push('| Précision > 25 m (place probablement fausse) | ' + pct(p.filter(x => x > 25).length, p.length) + ' |', '');
  }else l.push('Aucune précision GPS dans les journaux (signalements manuels ou Raccourci sans position).', '');
  l.push('Les places sont espacées d’environ 6 m : au-delà de ±6 m, la place proposée peut être la voisine. L’erreur réelle se mesure sur place : noter la place où est vraiment la voiture et la comparer à celle du journal (colonne `place`).', '');

  l.push('## Doublons', '');
  if(a.doublons.length){
    l.push('| Heure | Type | Place | Écart |', '| --- | --- | --- | --- |');
    a.doublons.slice(0, 20).forEach(x => l.push('| ' + heure(x.a.t) + ' | ' + x.a.type + ' | ' + x.a.place + ' | ' + sec(x.ecart) + ' |'));
    l.push('');
  }else l.push('Aucun signalement en double (même type, même place, moins de 30 s).', '');

  l.push('## Contrôles après un départ', '');
  const hs = Object.keys(a.parHorizon).map(Number).sort((x, y) => x - y);
  if(hs.length){
    l.push('| Horizon | Encore libre | Reprise | Non observé | Réponses contradictoires | Part encore libre (réponses) |', '| --- | --- | --- | --- | --- | --- |');
    hs.forEach(h => { const c = a.parHorizon[h];
      l.push('| ' + h + ' min | ' + c.libre + ' | ' + c.occupee + ' | ' + c.non_observe + ' | ' + c.contradictoire + ' | ' + pct(c.libre, c.libre + c.occupee) + ' |'); });
    l.push('', 'Peu de réponses = résultat fragile : il faut plusieurs dizaines de départs contrôlés par horizon avant d’en tirer une règle.', '');
  }else l.push('Aucun contrôle dans les journaux.', '');

  l.push('## Envois par téléphone', '');
  Object.keys(a.parEmetteur).sort().forEach(n => l.push('- ' + (n === '?' ? 'émetteur inconnu (reçu partout au rattrapage)' : n) + ' : ' + a.parEmetteur[n]));
  l.push('');
  return l.join('\n');
}

function main(){
  const args = process.argv.slice(2);
  const sortie = args.includes('--sortie') ? args[args.indexOf('--sortie') + 1] : null;
  const nomsOpt = args.includes('--noms') ? args[args.indexOf('--noms') + 1].split(',') : null;
  const fichiers = args.filter((x, i) => !x.startsWith('--') && args[i - 1] !== '--sortie' && args[i - 1] !== '--noms');
  if(!fichiers.length){ console.error('Usage : node outils/analyser-essai.js journal-1.csv journal-2.csv [--noms Tom,Stan] [--sortie compte-rendu.md]'); process.exit(2); }
  const tels = fichiers.map((f, i) => {
    let ev;
    try{ ev = lireCSV(fs.readFileSync(f, 'utf8')).map(evenement); }
    catch(e){ console.error(f + ' : ' + e.message); process.exit(1); }
    return {nom:(nomsOpt && nomsOpt[i]) || path.basename(f).replace(/\.csv$/i, ''), evenements:ev};
  });
  const cr = compteRendu(analyser(tels));
  if(sortie){ fs.writeFileSync(sortie, cr); console.log('Compte rendu écrit : ' + sortie); }
  else console.log(cr);
}

module.exports = {lireCSV, evenement, analyser, compteRendu, quantile};
if(require.main === module) main();
