'use strict';
let inventory, kind = 'meters', scope = 'all';
const $ = id => document.getElementById(id);
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function filtered(){
  const q = norm($('search').value).trim(), group = $('group').value;
  return inventory[kind].filter(r => {
    const g = inventory.groups.find(g => g.id === r.group);
    const recordScope = kind === 'parkings' ? 'alentours' : g.scope;
    return (scope === 'all' || scope === recordScope) &&
      (group === 'all' || r.group === group) &&
      (!q || norm([r.address, r.name, r.number, g?.name].join(' ')).includes(q));
  });
}
function render(){
  const rows = filtered(), meters = kind === 'meters';
  $('resultCount').textContent = `${rows.length} ${meters ? 'horodateur(s)' : 'parking(s)'} dans cette sélection · inventaire ${meters ? 'du 17/02/2023' : 'du 22/09/2025'}`;
  $('tableHead').innerHTML = meters ? '<tr><th>Nº</th><th>Adresse publiée</th><th>Régime publié</th><th>Horaires 2023</th></tr>' : '<tr><th>Parking</th><th>Adresse publiée</th><th>Capacité totale</th><th>PMR incluses</th></tr>';
  $('rows').innerHTML = rows.map(r => meters ? `<tr><td class="id">${esc(r.number)}</td><td><strong>${esc(r.address)}</strong>${r.sharedAddress ? '<small>Adresse partagée par plusieurs bornes</small>' : ''}</td><td><span class="badge ${r.period !== 'Annuel' ? 'warn' : ''}">${esc(r.period)}</span><small>${esc(r.kind)}</small></td><td>${esc(r.hours)}<small>À confirmer sur place</small></td></tr>` : `<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.address)}</td><td class="id">${esc(r.capacity)}<small>Pas une disponibilité</small></td><td>${r.pmr === null ? 'Non renseigné' : esc(r.pmr)}</td></tr>`).join('');
  $('empty').hidden = rows.length > 0;
  $('emptyText').textContent = $('group').value === 'saint-honorat' ? 'Saint-Honorat n’apparaît pas dans ce fichier. Cela ne permet pas de déduire la gratuité ou l’absence de stationnement.' : 'Aucune correspondance dans les fichiers sélectionnés. Cela ne prouve pas une absence sur le terrain.';
  $('tableNote').textContent = meters ? 'Une ligne = un identifiant de borne, pas un nombre de places. Les bornes à la même adresse sont conservées.' : 'Capacités municipales déclarées en 2025. Ne pas ajouter les places PMR au total ni utiliser ces chiffres comme places libres.';
  $('group').disabled = !meters;
  $('export').disabled = !rows.length;
}
function csvCell(v){
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportSelection(){
  const meters = kind === 'meters', keys = meters ? ['number','address','kind','period','hours','sourceId','sourceRow'] : ['name','address','capacity','pmr','sourceId','sourceRow'];
  const lines = [keys, ...filtered().map(r => keys.map(k => r[k]))];
  const blob = new Blob(['\ufeff' + lines.map(row => row.map(csvCell).join(';')).join('\r\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `placelibre-${kind}-inventaire.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function start(){
  try {
    const response = await fetch('../data/pilot-inventory.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    inventory = await response.json();
    if (!Array.isArray(inventory.meters) || !Array.isArray(inventory.parkings)) throw new Error('Format inattendu');
    $('meterCount').textContent = inventory.meters.length; $('parkingCount').textContent = inventory.parkings.length;
    $('group').innerHTML += inventory.groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)} (${g.meterCount})</option>`).join('');
    $('sourceCards').innerHTML = inventory.sources.map(s => `<article class="source"><h3>${esc(s.title)}</h3><p>${esc(s.attribution)}</p><p>Licence Ouverte 2.0 · ${s.rows} lignes dans le fichier source</p><a href="${esc(s.url)}" target="_blank" rel="noopener">Consulter la source officielle ↗</a></article>`).join('');
    $('limitations').innerHTML = inventory.limitations.map(l => `<li>${esc(l)}</li>`).join('');
    document.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => {
      scope = b.dataset.scope; $('group').value = 'all';
      document.querySelectorAll('[data-scope]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render();
    }));
    document.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => {
      kind = b.dataset.kind; $('group').value = 'all';
      document.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render();
    }));
    $('search').addEventListener('input', render); $('group').addEventListener('change', render);
    $('export').addEventListener('click', exportSelection);
    $('reset').addEventListener('click', () => { $('search').value = ''; $('group').value = 'all'; scope = 'all'; document.querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === 'all'))); render(); });
    render(); $('loading').hidden = true; $('content').hidden = false;
  } catch (e) {
    $('loading').textContent = 'L’inventaire ne peut pas être chargé. Recharge la page avec une connexion Internet. Aucune disponibilité ne peut être déduite de cette erreur.';
    console.error('Inventaire pilote :', e);
  }
}
start();
