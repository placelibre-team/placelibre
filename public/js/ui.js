/* PlaceLibre · interface : état, contrôles, liste des rues, réglages */
'use strict';

function renderStatus(){
  const now = Date.now(); let main, sub;
  if(pendingDepart){
    const st = pendingDepart.slotId ? slotState(pendingDepart.slotId, now) : null;
    main = 'Départ en cours';
    sub = st && st.k === 'soon' ? 'Ta place passe en libre dans ~' + st.secs + ' s · garde l’appli ouverte pour confirmer' : 'En attente que la voiture bouge pour confirmer';
  }else if(mode === 'draw'){
    main = 'Mode cartographie';
    sub = draft.length ? draft.length + ' point' + (draft.length > 1 ? 's' : '') + ' posé' + (draft.length > 1 ? 's' : '') : 'Touche le début de la file de places';
  }else{
    let free = 0; SLOTS.forEach(s => { const k = slotState(s.id, now).k; if(k === 'high' || k === 'mid' || k === 'soon') free++; });
    main = SLOTS.length ? (free ? free + ' place' + (free > 1 ? 's' : '') + ' libre' + (free > 1 ? 's' : '') + ' en ce moment' : 'Aucune place libre signalée') : 'Aucune place cartographiée ici';
    sub = S.parked ? 'Garé depuis ' + hhmm(S.parked.t) + ' · ' + SLOTS.length + ' places sur la carte' : SLOTS.length + ' places sur la carte · touche Carto pour en ajouter';
  }
  if(!S.me) sub = 'Choisis ton prénom dans ⚙︎ pour que les autres voient qui signale · ' + sub;
  const live = syncOk ? '<span style="color:var(--free);font-weight:600">● ' + (TEST ? 'Canal de test' : 'En direct') + '</span> · ' : '';
  $('status').innerHTML = '<strong>' + esc(main) + '</strong><small>' + live + esc(sub) + '</small>';
}

/* Contrôles à 5, 10 et 30 min après un départ */
let checksKey = '';
function renderChecks(){
  const list = pendingChecks(Date.now()).slice(0, 2);
  const key = list.map(c => c.dep.id + c.h).join(',') + '|' + Math.floor(Date.now()/30e3);
  if(key === checksKey) return; checksKey = key;
  const box = $('checks'); box.innerHTML = '';
  list.forEach(c => {
    const d = c.dep, sl = SLOT_BY_ID[d.slot], mins = Math.max(0, Math.round((Date.now() - d.t)/60e3));
    const el = document.createElement('div'); el.className = 'check';
    el.innerHTML = '<p><b>Contrôle à ' + c.h + ' min</b> · ' + esc((sl && sl.name) || d.street || 'Place') +
      '<br><small>Départ signalé ' + (d.by ? 'par ' + esc(d.by) + ' ' : '') + 'il y a ' + mins + ' min. La place est-elle encore libre ?</small></p>' +
      '<div class="row3"><button class="ok" data-act="chk" data-dep="' + esc(d.id) + '" data-h="' + c.h + '" data-etat="libre">Libre</button>' +
      '<button class="ko" data-act="chk" data-dep="' + esc(d.id) + '" data-h="' + c.h + '" data-etat="occupee">Occupée</button>' +
      '<button data-act="chk" data-dep="' + esc(d.id) + '" data-h="' + c.h + '" data-etat="non_observe">Pas vu</button></div>';
    box.appendChild(el);
  });
}

let openStreet = null;
function chanceColor(p){ return p >= .5 ? 'var(--free)' : p >= .25 ? 'var(--mid)' : 'var(--soon)'; }
function sparkSVG(street){
  const d = new Date(), pts = [];
  for(let h = 0; h < 24; h++){ const x = new Date(d); x.setHours(h, 30, 0, 0); pts.push(chanceAt(street, x)); }
  const W = 280, H = 64, px = h => 6 + h*(W - 12)/23, py = p => H - 16 - p*(H - 24);
  const line = pts.map((p, h) => px(h).toFixed(1) + ',' + py(p).toFixed(1)).join(' ');
  const area = px(0).toFixed(1) + ',' + py(0) + ' ' + line + ' ' + px(23).toFixed(1) + ',' + py(0);
  const nh = d.getHours() + d.getMinutes()/60;
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Chances de trouver une place au fil de la journée">' +
    '<polygon points="' + area + '" fill="var(--accent)" opacity=".12"/>' +
    '<polyline points="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2"/>' +
    '<line x1="' + px(nh) + '" x2="' + px(nh) + '" y1="4" y2="' + (H - 16) + '" stroke="var(--fg)" stroke-dasharray="3 3" stroke-width="1"/>' +
    [0, 6, 12, 18, 23].map(h => '<text x="' + px(h) + '" y="' + (H - 2) + '" font-size="10" text-anchor="middle" fill="var(--muted)">' + h + 'h</text>').join('') +
    '</svg>';
}
function liveText(b){
  const who = b.by || 'quelqu’un', how = b.src === 'bluetooth' ? ' (Bluetooth)' : '';
  const what = b.src === 'signalement' || b.src === 'controle' ? 'Vue libre' : 'Départ signalé';
  return what + ' par ' + who + ' il y a ' + fmtAge(b.age*60) + how + ' · ' + Math.round(b.p*100) + ' % encore libre à ton arrivée' +
    (b.eta >= 0.5 ? ' (~' + Math.round(b.eta) + ' min)' : '');
}
function renderList(){
  const ref = S.dest || lastPos || {lat:CENTER[1], lng:CENTER[0]};
  $('listTitle').textContent = S.dest ? 'Rues près de ta destination' : lastPos ? 'Rues autour de toi' : 'Rues de Juan-les-Pins';
  const now = Date.now(), nowD = new Date(now), groups = {}, M = survModel();
  SLOTS.forEach(s => {
    const key = s.name ? 'n:' + s.name : 's:' + s.segId;
    const g = groups[key] || (groups[key] = {name:s.name || 'Rue sans nom', n:0, d:Infinity, best:null, pmr:0});
    if(s.type === 'pmr') g.pmr++; else g.n++;
    const d = dist(ref, s); if(d < g.d){ g.d = d; g.best = s; }
  });
  // Les chances tiennent compte du temps de trajet depuis ta position (si connue)
  const list = Object.values(groups).filter(g => g.d < 1500).map(g => Object.assign(g, chanceNow(g.name, lastPos, M), {near:g.best}))
    .sort((a,b) => b.p - a.p || a.d - b.d).slice(0, 14);
  const ul = $('list'); ul.innerHTML = '';
  if(!list.length){
    ul.innerHTML = '<li class="empty">Pas encore de places cartographiées près d’ici. Touche <b>Carto</b> à droite de la carte, puis dessine les files de places de ta rue sur la photo aérienne.</li>';
    return;
  }
  list.forEach(g => {
    const li = document.createElement('li'), open = openStreet === g.name;
    li.innerHTML = '<span class="pct" style="color:' + chanceColor(g.p) + '">' + Math.round(g.p*100) + '<small>%</small></span>' +
      '<div class="li-main"><b></b><span class="l1"></span><span class="l2"></span></div><span class="li-dist">' + fmtDist(g.d) + '</span>';
    li.querySelector('b').textContent = g.name;
    li.querySelector('.l1').textContent = 'de chances de trouver en 5 min · ' + (g.n ? (g.n + ' places') : '') + (g.pmr ? ' + ' + g.pmr + ' PMR' : '');
    li.querySelector('.l2').textContent = (g.best ? liveText(g.best) + ' · ' : '') + (ruleText(g.name, nowD) || '');
    if(open){
      const rule = RULES[g.name], det = document.createElement('div'); det.className = 'detail';
      det.innerHTML = '<div class="det-row"><span>Prévision (heure, jour, saison, règles)</span><b>' + Math.round(g.prior*100) + ' %</b></div>' +
        '<div class="det-row"><span>Places signalées, estimées à ton arrivée</span><b>' + (g.live > 0.05 ? Math.round(g.live*100) + ' %' : 'aucune') + '</b></div>' +
        '<p class="det-h">Aujourd’hui, heure par heure</p>' + sparkSVG(g.name) +
        (rule ? '<p class="det-src">' + esc(rule.src) + (rule.residents ? ' · Abonnement résidents : ' + esc(rule.residents) : '') + '</p>' : '');
      li.appendChild(det);
    }
    li.addEventListener('click', () => { openStreet = open ? null : g.name; renderList(); if(!open) fly(g.best ? g.best.slot : g.near, 18.5); });
    ul.appendChild(li);
  });
}
function render(){
  renderMap();
  $('btnClearDest').hidden = !S.dest;
  renderStatus(); checksKey = ''; renderChecks(); renderList();
}

/* ---------- Boutons dans les fenêtres de la carte et contrôles ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if(!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  if(act === 'free'){ report(id, true); toast('Place signalée libre.'); }
  else if(act === 'occ'){ report(id, false); toast('Place signalée occupée.'); }
  else if(act === 'chk'){ answerCheck(b.dataset.dep, b.dataset.h, b.dataset.etat); }
  else if(act === 'delseg'){ if(BASE_SEGS.some(b => b.id === id)) S.removedBase.push(id); S.segments = S.segments.filter(s => s.id !== id); rebuildSlots(); save(); render(); toast('File supprimée.'); }
  else if(act === 'loosegone'){ const l = S.loose.find(x => x.id === id); if(l){ learnTau(Math.max(0,(Date.now() - l.free)/1000), false); l.done = true; save(); render(); } }
  if(popup){ popup.remove(); popup = null; }
});

/* ---------- Destination ---------- */
$('searchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('q').value.trim(); if(!q) return;
  try{
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=fr&bounded=1&viewbox=7.06,43.61,7.16,43.53&q=' + encodeURIComponent(q), {headers:{'Accept-Language':'fr'}});
    const j = await r.json();
    if(!j.length){ toast('Adresse introuvable à Juan-les-Pins / Antibes.'); return; }
    S.dest = {lat:+j[0].lat, lng:+j[0].lon, label:j[0].display_name.split(',').slice(0,2).join(',')}; save();
    fly(S.dest, 18); render(); $('q').blur();
  }catch(err){ toast('Recherche impossible (réseau).'); }
});
$('btnClearDest').addEventListener('click', () => { S.dest = null; save(); render(); });

/* ---------- Boutons du bas ---------- */
$('btnPark').addEventListener('click', () => doArrive('manuel'));
$('btnLeave').addEventListener('click', () => startDepart('manuel'));


/* ---------- Réglages ---------- */
$('busUrl').textContent = BUS;

function buildMe(){
  const box = $('meChips'); box.innerHTML = '';
  ['Shad','Tom','Stan'].forEach(n => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = n;
    b.setAttribute('aria-pressed', String(S.me === n));
    b.addEventListener('click', () => { S.me = n; save(); buildMe(); renderStatus(); toast('Tu es ' + n + '.'); });
    box.appendChild(b);
  });
}
function renderSettings(){
  buildMe();
  const m = S.model;
  $('modelKv').innerHTML =
    '<span>Délai Bluetooth → départ</span><span>' + Math.round(m.delay) + ' s</span>' +
    '<span>Départs mesurés</span><span>' + m.delayN + '</span>' +
    '<span>Durée de vie d’une place libre</span><span>' + fmtAge(m.tau) + '</span>' +
    '<span>Signalements utilisés</span><span>' + m.tauN + '</span>';
  $('survTbl').innerHTML = '<tr><th>Après</th><th>Encore libre</th><th>Mesures</th><th></th></tr>' +
    survModel().map(r => '<tr><td>' + r.h + ' min</td><td>' + Math.round(r.p*100) + ' %</td><td>' + r.n + '</td><td>' +
      (r.enough ? 'mesuré' : 'données insuffisantes') + '</td></tr>').join('');
  const j = journalStats();
  $('journalKv').innerHTML =
    '<span>Événements</span><span>' + j.total + '</span>' +
    '<span>Départs · arrivées</span><span>' + j.depart + ' · ' + j.arrive + '</span>' +
    '<span>Signalements libre / occupée</span><span>' + j.signal + '</span>' +
    '<span>Contrôles faits · non observés</span><span>' + j.ctlOk + ' · ' + j.ctlNo + '</span>' +
    '<span>Délai de réception (médian)</span><span>' + (j.recvMed != null ? (j.recvMed/1000).toFixed(1).replace('.', ',') + ' s sur ' + j.recvN : '—') + '</span>';
  const userSlots = SLOTS.filter(s => s.src !== 'osm').length;
  $('dataInfo').textContent = S.segments.length + ' files dessinées (' + userSlots + ' places) · ' + OSM_SEGS.length + ' côtés de rue venant d’OpenStreetMap · ' +
    S.history.length + ' événements enregistrés. Tout reste sur ton téléphone.' + (TEST ? ' (Données du canal de test, séparées des vraies.)' : '');
}
$('btnMenu').addEventListener('click', () => { renderSettings(); $('settings').hidden = false; });
$('btnCloseSet').addEventListener('click', () => { $('settings').hidden = true; $('resetConfirm').hidden = true; });
document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => {
  navigator.clipboard.writeText($(b.dataset.copy).textContent).then(() => toast('Lien copié.'), () => toast('Copie impossible : appuie longtemps sur le lien pour le sélectionner.'));
}));
$('btnExport').addEventListener('click', () => {
  const txt = JSON.stringify({app:'placelibre', v:2, segments:S.segments});
  navigator.clipboard.writeText(txt).then(() => toast('Cartographie copiée : colle-la dans un message.'),
    () => { $('importBox').value = txt; $('importBox').select(); toast('Sélectionne le texte et copie-le à la main.'); });
});
$('btnImport').addEventListener('click', () => {
  try{
    const j = JSON.parse($('importBox').value);
    const segs = (j.segments || []).filter(s => s && s.id && Array.isArray(s.pts) && s.pts.length > 1);
    let added = 0;
    segs.forEach(s => { if(!S.segments.some(x => x.id === s.id)){ S.segments.push({id:s.id, pts:s.pts, type:TYPES[s.type] ? s.type : 'unk', name:String(s.name||''), src:'user'}); added++; } });
    rebuildSlots(); save(); render(); renderSettings(); $('importBox').value = '';
    toast(added + ' file' + (added > 1 ? 's' : '') + ' importée' + (added > 1 ? 's' : '') + '.');
  }catch(e){ toast('Texte non reconnu : colle exactement ce qui a été copié depuis l’appli.'); }
});
$('btnReloadData').addEventListener('click', () => { toast('Rechargement…'); loadOsmStreets(true); });
$('btnCsv').addEventListener('click', () => {
  const csv = journalCSV(), name = 'placelibre-journal-' + new Date().toISOString().slice(0, 10) + (TEST ? '-test' : '') + '.csv';
  try{
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Journal exporté (' + S.journal.length + ' lignes).');
  }catch(e){ navigator.clipboard.writeText(csv).then(() => toast('Journal copié dans le presse-papiers.'), () => toast('Export impossible sur ce navigateur.')); }
});
let resetArmed = false;
$('btnReset').addEventListener('click', () => {
  if(!resetArmed){ resetArmed = true; $('resetConfirm').hidden = false; setTimeout(() => { resetArmed = false; $('resetConfirm').hidden = true; }, 5000); return; }
  S = mergeBase(clone(DEF)); JIDS = new Set(); save(); resetArmed = false; $('resetConfirm').hidden = true;
  rebuildSlots(); render(); renderSettings(); toast('Données effacées.');
});
