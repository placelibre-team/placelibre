/* PlaceLibre · vérification terrain : interface (page publique/verification-terrain).
   Les calculs sont dans verif.js. Le relevé est gardé dans ce téléphone (clé KEY_VERIF) jusqu'à l'export. */
'use strict';
const KEY_VERIF = 'plj:verif:v1';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SEG_TYPE = Object.fromEntries(BASE_SEGS.map(b => [b.id, b.type]));
const typeDe = p => p.type || SEG_TYPE[p.seg] || 'unk';
const typeLabel = t => (TYPES[t] || TYPES.unk).label;
const ETAT_TXT = {ok:'Existe', absente:'Pas une place', deplacee:'Déplacée'};

let rel = charger(), rue = 'Rue Bricka', pos = null, ouverte = null, watch = null;
const PAIRES = VERIF.filesParalleles(PLACES);

function charger(){
  try{ const r = JSON.parse(localStorage.getItem(KEY_VERIF) || 'null'); if(r && r.places) return Object.assign(VERIF.nouveauReleve(), r); }catch(e){}
  return VERIF.nouveauReleve();
}
function sauver(){ try{ localStorage.setItem(KEY_VERIF, JSON.stringify(rel)); }catch(e){ toast('Stockage plein ou bloqué : exporte le relevé maintenant.'); } }
let toastT;
function toast(t){ const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2800); }

/* ---------- Affichage ---------- */
function rendre(){
  const n = VERIF.resume(rel, PLACES);
  $('bar').style.width = Math.round(n.verifiees/n.total*100) + '%';
  $('progressText').textContent = n.verifiees + ' / ' + n.total + ' places vérifiées · ' + n.ok + ' existent · ' + n.absente +
    ' retirées · ' + n.deplacee + ' déplacées · ' + n.ajouts + ' ajout(s) · ' + n.regles + ' panneau(x)';
  rendrePaires(); rendrePlaces(); rendreAjouts(); rendreRegles();
}

function rendrePaires(){
  $('pairList').innerHTML = PAIRES.map((pr, i) => {
    const d = (rel.files[pr.a + '|' + pr.b] || {}).decision;
    const b = (val, txt) => '<button data-pair="' + i + '" data-dec="' + val + '" aria-pressed="' + (d === val) + '">' + txt + '</button>';
    return '<div class="pair"><b>' + esc(pr.rue) + ' : files ' + pr.a + ' (' + pr.nA + ' places) et ' + pr.b + ' (' + pr.nB + ' places)</b>' +
      '<small>Parallèles, à ~' + String(pr.distance).replace('.', ',') + ' m l’une de l’autre. ' + (pr.nA + pr.nB > 6 ? 'Repère les numéros de rue sur la carte de l’appli.' : '') + '</small>' +
      '<div class="choices">' + b('deux-cotes', 'Deux côtés de la rue') + b('garder-a', 'Doublon : garder ' + pr.a) + b('garder-b', 'Doublon : garder ' + pr.b) + '</div></div>';
  }).join('') || '<p class="hint">Aucune file parallèle à trancher.</p>';
}

function rendrePlaces(){
  const todo = $('onlyTodo').checked;
  const liste = VERIF.parDistance(PLACES.filter(p => p.rue === rue && (!todo || !rel.places[p.id])), pos);
  $('placeList').innerHTML = liste.map(({p, d}) => {
    const v = rel.places[p.id], etat = v ? v.etat : '', t = (v && v.type) || typeDe(p);
    const dTxt = d == null ? '' : '<span class="d">à ' + (d < 1000 ? Math.round(d) + ' m' : (d/1000).toFixed(1).replace('.', ',') + ' km') + '</span>';
    let body = '';
    if(ouverte === p.id){
      body = '<div class="body"><div class="acts">' +
        '<button data-act="ok" data-id="' + p.id + '">✓ Elle existe ici</button>' +
        '<button data-act="absente" data-id="' + p.id + '">✗ Pas une place</button>' +
        '<button class="wide" data-act="deplacee" data-id="' + p.id + '">📍 Elle est là où je suis (déplacer)</button></div>' +
        '<div class="row"><select data-type="' + p.id + '" aria-label="Type de la place ' + p.id + '">' + optionsType(t) + '</select>' +
        '<input data-note="' + p.id + '" placeholder="Remarque, motif si retirée" value="' + esc(v && (v.note || (v.auto ? '' : v.motif)) || '') + '" maxlength="120"></div>' +
        (v ? '<button data-act="annuler" data-id="' + p.id + '">Annuler ma réponse</button>' : '') +
        (v && v.motif ? '<p class="hint">Motif : ' + esc(v.motif) + '</p>' : '') + '</div>';
    }
    return '<li class="place"><button data-open="' + p.id + '" aria-expanded="' + (ouverte === p.id) + '"><span><span class="id">' + p.id + '</span>' + dTxt +
      '<br><small>' + esc(typeLabel(t)) + '</small></span><span class="state ' + etat + '">' + (ETAT_TXT[etat] || 'À vérifier') + '</span></button>' + body + '</li>';
  }).join('') || '<li class="hint">Tout est vérifié dans cette rue.</li>';
}
function optionsType(sel){ return VERIF.TYPES_PLACE.map(t => '<option value="' + t + '"' + (t === sel ? ' selected' : '') + '>' + esc(typeLabel(t)) + '</option>').join(''); }

function rendreAjouts(){
  $('addList').innerHTML = rel.ajouts.map((a, i) => '<li><span>' + esc(a.rue) + ' · ' + esc(typeLabel(a.type)) + ' · ±' + Math.round(a.acc) + ' m' +
    (a.note ? ' · ' + esc(a.note) : '') + '</span><button data-del-add="' + i + '">Retirer</button></li>').join('');
}
function rendreRegles(){
  $('ruleList').innerHTML = rel.regles.map((r, i) => '<li><span>' + esc(r.rue) + (r.troncon ? ' (' + esc(r.troncon) + ')' : '') + ' : ' + esc(r.regle) +
    (r.horaires ? ' · ' + esc(r.horaires) : '') + (r.tarif ? ' · ' + esc(r.tarif) : '') + (r.saison ? ' · saisonnier' : '') +
    '</span><button data-del-rule="' + i + '">Retirer</button></li>').join('');
}

/* ---------- Position ---------- */
function suivrePosition(){
  if(!navigator.geolocation){ toast('Pas de GPS sur cet appareil.'); return; }
  if(watch != null){ navigator.geolocation.clearWatch(watch); watch = null; pos = null; $('gpsBtn').textContent = '📍 Me localiser'; $('gpsText').textContent = 'Position arrêtée.'; rendre(); return; }
  $('gpsText').textContent = 'Recherche de la position…';
  watch = navigator.geolocation.watchPosition(p => {
    pos = {lat:p.coords.latitude, lng:p.coords.longitude, acc:p.coords.accuracy};
    $('gpsBtn').textContent = '⏹ Arrêter';
    $('gpsText').textContent = 'Précision ±' + Math.round(pos.acc) + ' m' + (pos.acc > VERIF.PRECISION_MAX ? ' : trop faible pour déplacer une place, attends un peu ou mets-toi à découvert.' : '. Places rangées de la plus proche à la plus loin.');
    rendrePlaces();
  }, e => { $('gpsText').textContent = 'Position indisponible (' + e.message + ').'; }, {enableHighAccuracy:true, maximumAge:5000, timeout:20000});
}

/* ---------- Actions ---------- */
function repondre(id, act){
  const p = PLACES.find(x => x.id === id); if(!p) return;
  const note = (document.querySelector('[data-note="' + id + '"]') || {}).value || '';
  const typeSel = (document.querySelector('[data-type="' + id + '"]') || {}).value;
  if(act === 'annuler'){ delete rel.places[id]; sauver(); rendre(); return; }
  const v = {etat:act, t:Date.now()};
  if(typeSel && typeSel !== typeDe(p)) v.type = typeSel;
  if(note.trim()) v.note = note.trim();
  if(act === 'absente') v.motif = note.trim() || 'pas une place de stationnement (vérification terrain)';
  if(act === 'deplacee'){
    if(!pos){ toast('Active « Me localiser » d’abord.'); return; }
    if(pos.acc > VERIF.PRECISION_MAX){ toast('Précision ±' + Math.round(pos.acc) + ' m : trop faible pour déplacer une place.'); return; }
    Object.assign(v, {lat:+pos.lat.toFixed(7), lng:+pos.lng.toFixed(7), acc:Math.round(pos.acc), ecart:Math.round(VERIF.dist(pos, p))});
  }
  rel.places[id] = v; sauver();
  const suite = VERIF.parDistance(PLACES.filter(x => x.rue === rue && !rel.places[x.id]), pos)[0];
  ouverte = suite ? suite.p.id : null;
  toast(id + ' : ' + ETAT_TXT[act].toLowerCase() + (suite ? ' · suivante : ' + suite.p.id : ''));
  rendre();
}

document.addEventListener('click', e => {
  const el = e.target.closest('button'); if(!el) return;
  if(el.dataset.open){ ouverte = ouverte === el.dataset.open ? null : el.dataset.open; rendrePlaces(); return; }
  if(el.dataset.act){ repondre(el.dataset.id, el.dataset.act); return; }
  if(el.dataset.pair != null){ VERIF.deciderFiles(rel, PAIRES[+el.dataset.pair], el.dataset.dec, PLACES); sauver(); rendre(); return; }
  if(el.dataset.rue){ rue = el.dataset.rue; document.querySelectorAll('[data-rue]').forEach(b => b.setAttribute('aria-pressed', b === el)); ouverte = null; rendrePlaces(); return; }
  if(el.dataset.delAdd != null){ rel.ajouts.splice(+el.dataset.delAdd, 1); sauver(); rendre(); return; }
  if(el.dataset.delRule != null){ rel.regles.splice(+el.dataset.delRule, 1); sauver(); rendre(); return; }
});
document.addEventListener('change', e => {
  const id = e.target.dataset.type || e.target.dataset.note;
  if(id && rel.places[id]){             // modification d'une place déjà vérifiée
    const v = rel.places[id], p = PLACES.find(x => x.id === id);
    if(e.target.dataset.type){ if(e.target.value !== typeDe(p)) v.type = e.target.value; else delete v.type; }
    else { const t = e.target.value.trim(); if(t) v.note = t; else delete v.note; if(v.etat === 'absente' && t && !v.auto) v.motif = t; }
    sauver(); rendre();
  }
});
$('onlyTodo').addEventListener('change', rendrePlaces);
$('gpsBtn').addEventListener('click', suivrePosition);
$('releveur').value = rel.releveur || '';
$('releveur').addEventListener('change', () => { rel.releveur = $('releveur').value.trim(); sauver(); });
$('addType').innerHTML = optionsType('pay');
$('addBtn').addEventListener('click', () => {
  if(!pos){ toast('Active « Me localiser » d’abord.'); return; }
  if(pos.acc > VERIF.PRECISION_MAX){ toast('Précision ±' + Math.round(pos.acc) + ' m : trop faible, attends un peu.'); return; }
  rel.ajouts.push({rue, type:$('addType').value, lat:+pos.lat.toFixed(7), lng:+pos.lng.toFixed(7), acc:Math.round(pos.acc), note:$('addNote').value.trim(), t:Date.now()});
  $('addNote').value = ''; sauver(); rendre(); toast('Place ajoutée (' + rue + ').');
});
$('ruleBtn').addEventListener('click', () => {
  const r = {rue:$('rRue').value, troncon:$('rTroncon').value.trim(), regle:$('rRegle').value.trim(), horaires:$('rHoraires').value.trim(),
    tarif:$('rTarif').value.trim(), saison:$('rSaison').checked, t:Date.now()};
  if(!r.regle){ toast('Indique au moins la règle du panneau.'); return; }
  rel.regles.push(r); ['rTroncon', 'rRegle', 'rHoraires', 'rTarif'].forEach(i => $(i).value = ''); $('rSaison').checked = false;
  sauver(); rendre(); toast('Panneau enregistré.');
});

function exportTexte(){ return JSON.stringify(VERIF.exporter(rel, PLACES), null, 1); }
function nomFichier(){ const d = new Date(), z = n => String(n).padStart(2, '0'); return 'placelibre-verification-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + '.json'; }
$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([exportTexte()], {type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nomFichier(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  $('exportText').textContent = 'Fichier ' + nomFichier() + ' téléchargé. Envoie-le à l’équipe.';
});
$('copyBtn').addEventListener('click', async () => {
  try{ await navigator.clipboard.writeText(exportTexte()); toast('Relevé copié : colle-le dans un message.'); }
  catch(e){ toast('Copie impossible : utilise « Télécharger ».'); }
});
let resetArme = 0;
$('resetBtn').addEventListener('click', () => {
  if(Date.now() - resetArme > 4000){ resetArme = Date.now(); $('resetBtn').textContent = 'Toucher encore pour effacer définitivement'; setTimeout(() => $('resetBtn').textContent = 'Effacer ce relevé', 4000); return; }
  rel = VERIF.nouveauReleve(); sauver(); ouverte = null; $('releveur').value = ''; $('resetBtn').textContent = 'Effacer ce relevé'; rendre(); toast('Relevé effacé.');
});

rendre();

/* Hors réseau : la page s'utilise dans la rue, parfois sans réseau. On enregistre le service worker du site
   (il garde une copie de chaque fichier servi) puis on précharge les fichiers de cette page. Après une
   première ouverture avec réseau, la page se rouvre hors ligne. */
const FICHIERS_PAGE = ['./', 'index.html', 'style.css', 'verif.js', 'app.js', '../js/config.js', '../js/places.js'];
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
if('serviceWorker' in navigator && (location.protocol === 'https:' || local)){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('../sw.js', {scope:'../'}).then(() => navigator.serviceWorker.ready)
      .then(() => navigator.serviceWorker.controller ? null : new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, {once:true})))
      .then(() => Promise.all(FICHIERS_PAGE.map(u => fetch(u, {cache:'no-cache'}).catch(() => {}))))
      .then(() => { document.body.dataset.horsLigne = 'pret'; })
      .catch(() => {});
  });
}
