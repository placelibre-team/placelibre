/* PlaceLibre · carte 3D (MapLibre). Tout est protégé par mapReady : sans carte, l'appli marche en mode liste. */
'use strict';

let map = null, popup = null, carMarker = null, destMarker = null;
let is3d = true, isSat = false, parksOn = false, bdOn = false;

function emptyFC(){return {type:'FeatureCollection', features:[]};}
function fly(p, z){ if(mapReady && p) map.flyTo({center:[p.lng, p.lat], zoom:z || 18, essential:true}); }
function firstSymbolId(){ const l = map.getStyle().layers.find(x => x.type === 'symbol'); return l ? l.id : undefined; }
function buildingLayers(){ return map.getStyle().layers.filter(l => /building/.test(l.id)).map(l => l.id); }
/* Bâtiments : IGN (vraies hauteurs) si chargés, sinon ceux d'OpenStreetMap */
function showBuildings(on){
  if(!mapReady) return;
  buildingLayers().forEach(id => { const l = map.getLayer(id); if(l) map.setLayoutProperty(id, 'visibility', on && !bdOn ? 'visible' : 'none'); });
  if(map.getLayer('bd3d')) map.setLayoutProperty('bd3d', 'visibility', on && bdOn ? 'visible' : 'none');
}
async function addIgnBuildings(){
  const fc = await loadBuildings(); if(!fc || !mapReady || map.getSource('bd')) return;
  map.addSource('bd', {type:'geojson', data:fc, attribution:'Bâtiments © IGN BD TOPO'});
  map.addLayer({id:'bd3d', type:'fill-extrusion', source:'bd', minzoom:14, paint:{
    'fill-extrusion-height':['get','h'], 'fill-extrusion-base':0,
    'fill-extrusion-color':['interpolate',['linear'],['get','h'],3,'#efe7dc',10,'#e6dccd',20,'#d6c9b6',35,'#c4b49c'],
    'fill-extrusion-opacity':0.95, 'fill-extrusion-vertical-gradient':true}}, 'segs-line');
  map.setLight({anchor:'viewport', position:[1.4,200,45], intensity:0.55, color:'#fff7ea'});
  bdOn = true; showBuildings(is3d && !isSat);
}

function initMap(){
  map = new maplibregl.Map({
    container:'map', style:'https://tiles.openfreemap.org/styles/liberty',
    center:CENTER, zoom:18.1, pitch:58, bearing:-80, maxPitch:75,
    attributionControl:{compact:true}
  });
  map.addControl(new maplibregl.NavigationControl({showCompass:true, showZoom:false, visualizePitch:true}), 'bottom-right');

  map.on('load', () => {
    // Photo aérienne IGN (gratuite, licence ouverte)
    map.addSource('ign', {type:'raster', tileSize:256, maxzoom:19, attribution:'© IGN BD ORTHO',
      tiles:['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}']});
    map.addLayer({id:'sat', type:'raster', source:'ign', layout:{visibility:'none'}}, firstSymbolId());

    map.addSource('segs', {type:'geojson', data:emptyFC()});
    map.addSource('slots', {type:'geojson', data:emptyFC()});
    map.addSource('loose', {type:'geojson', data:emptyFC()});
    map.addSource('draft', {type:'geojson', data:emptyFC()});
    map.addSource('parks', {type:'geojson', data:emptyFC()});
    map.addSource('segl', {type:'geojson', data:emptyFC()});
    map.addSource('spts', {type:'geojson', data:emptyFC()});

    map.addLayer({id:'segs-line', type:'line', source:'segs',
      paint:{'line-color':['get','color'], 'line-width':['interpolate',['linear'],['zoom'],15,1,19,3], 'line-opacity':0.55, 'line-dasharray':[2,1]}});
    map.addLayer({id:'segs-chance', type:'line', source:'segs', minzoom:15.5,
      layout:{'line-cap':'round'},
      paint:{'line-color':['get','ch'], 'line-width':['interpolate',['linear'],['zoom'],16,8,19,26], 'line-opacity':0.42, 'line-blur':4}});
    map.addLayer({id:'slots-fill', type:'fill', source:'slots',
      paint:{'fill-color':['get','tcolor'], 'fill-opacity':['match',['get','k'],'occ',0.55,'unk',0.7,0.85],
        'fill-outline-color':'#ffffff'}});
    map.addLayer({id:'slots-car', type:'fill-extrusion', source:'slots', minzoom:15.5,
      filter:['in',['get','k'],['literal',['occ','unk','soon']]],
      paint:{'fill-extrusion-color':['match',['get','k'],'occ','#3d474b','soon','#f07a3a','#a9b4b8'],
        'fill-extrusion-height':['match',['get','k'],'soon',1.55,1.45], 'fill-extrusion-base':0.25, 'fill-extrusion-opacity':0.95}});
    map.addLayer({id:'slots-free', type:'circle', source:'spts', minzoom:16,
      paint:{'circle-radius':['interpolate',['linear'],['zoom'],16,3,19,7], 'circle-pitch-alignment':'map',
        'circle-color':['match',['get','k'],'high','#16c060','mid','#f0b429','low','#9fd8b0','soon','#f07a3a','#16c060'],
        'circle-stroke-color':'#ffffff', 'circle-stroke-width':2}});
    map.addLayer({id:'segs-lbl', type:'symbol', source:'segl', minzoom:16.3,
      layout:{'text-field':['get','sym'], 'text-font':['Noto Sans Bold'], 'text-size':['interpolate',['linear'],['zoom'],16,11,19,16],
        'text-allow-overlap':true, 'text-pitch-alignment':'viewport', 'text-offset':[0,-1.1]},
      paint:{'text-color':['get','color'], 'text-halo-color':'#ffffff', 'text-halo-width':2}});
    map.addLayer({id:'loose', type:'circle', source:'loose',
      paint:{'circle-radius':9, 'circle-color':['match',['get','k'],'high','#22b35e','mid','#e0a43a','soon','#f07a3a','#9fb3a3'],
        'circle-stroke-color':'#fff', 'circle-stroke-width':2}});
    map.addLayer({id:'parks', type:'circle', source:'parks', layout:{visibility:'none'},
      paint:{'circle-radius':8, 'circle-color':['match',['get','fee'],'free','#1f9d55','pay','#2f5fb3','#7d8b90'], 'circle-stroke-color':'#fff', 'circle-stroke-width':2}});
    map.addLayer({id:'draft-line', type:'line', source:'draft', paint:{'line-color':'#f0c419', 'line-width':4}});
    map.addLayer({id:'draft-pt', type:'circle', source:'draft', filter:['==',['geometry-type'],'Point'],
      paint:{'circle-radius':7, 'circle-color':'#f0c419', 'circle-stroke-color':'#14262c', 'circle-stroke-width':2}});

    mapReady = true;
    addIgnBuildings();
    rebuildSlots(); render(); drawMe();
  });
  map.on('error', e => { if(e && e.error && /style/i.test(String(e.error.message||''))) toast('La carte n’a pas pu se charger (réseau).'); });

  map.on('click', e => {
    if(mode === 'draw'){ draft.push([e.lngLat.lng, e.lngLat.lat]); setData('draft', draftFC()); renderStatus(); return; }
    const f = map.queryRenderedFeatures(e.point, {layers:['slots-car','slots-free','slots-fill','loose','parks']});
    if(!f.length) return;
    const p = f[0].properties, layer = f[0].layer.id;
    let html = '';
    if(layer === 'slots-car' || layer === 'slots-fill' || layer === 'slots-free'){
      const s = SLOT_BY_ID[p.id]; if(!s) return;
      const st = slotState(s.id, Date.now()), seg = segById(s.segId);
      const raw = S.slotState[s.id], by = raw && raw.by && st.k !== 'unk' ? ' · signalé par ' + raw.by : '';
      const cf = raw && raw.conflict && st.k !== 'unk' ? ' · signalements contradictoires' : '';
      const ty = TYPES[s.type] || TYPES.unk, rt = ruleText(s.name, new Date()), rule = RULES[s.name];
      let info = '';
      if(s.type === 'pmr') info = 'Réservée aux titulaires de la carte mobilité inclusion' + (s.pmrLabel ? ' · ' + esc(s.pmrLabel) : '');
      else if(rule && rule.paid) info = esc(rt) + '<br><small>Payant en semaine 9-12 h et 14-18 h, gratuit week-ends et jours fériés. Résidents : ' + esc(rule.residents) + '.</small>';
      else if(rule) info = esc(rt) + '<br><small>' + esc(rule.src) + '</small>';
      else if(s.type === 'free') info = 'Gratuit';
      else if(s.type === 'blue') info = 'Stationnement limité avec disque';
      else if(s.type === 'res') info = 'Réservé aux résidents';
      else if(s.type === 'deliv') info = 'Réservé aux livraisons';
      html = '<div class="pop"><b>' + esc(s.name || 'Place dans la rue') + '</b>' +
        '<div class="tbadge" style="background:' + ty.color + '">' + esc(ty.sym ? ty.sym + ' · ' + ty.label : ty.label) + '</div>' +
        (info ? '<div class="pinfo">' + info + '</div>' : '') +
        '<div class="pstate">' + esc(stateText(st) + by + cf) + '</div>' +
        '<div class="row"><button class="go" data-act="free" data-id="' + s.id + '">Libre</button><button data-act="occ" data-id="' + s.id + '">Occupée</button></div>' +
        (seg && seg.src !== 'osm' ? '<div class="row"><button class="del" data-act="delseg" data-id="' + seg.id + '">Supprimer cette file</button></div>' :
          '<div class="row"><small>File issue d’OpenStreetMap</small></div>') + '</div>';
    }else if(layer === 'loose'){
      html = '<div class="pop"><b>Place libérée</b><br>Hors places cartographiées<div class="row"><button data-act="loosegone" data-id="' + p.id + '">Plus là</button></div></div>';
    }else if(layer === 'parks'){
      html = '<div class="pop"><b>' + esc(p.name) + '</b><br>' + (p.fee === 'free' ? 'Gratuit' : p.fee === 'pay' ? 'Payant' : 'Tarif inconnu') + (p.cap ? ' · ' + esc(p.cap) + ' places' : '') + '</div>';
    }
    if(popup) popup.remove();
    popup = new maplibregl.Popup({offset:8}).setLngLat(e.lngLat).setHTML(html).addTo(map);
  });
  ['slots-car','slots-free','slots-fill','loose','parks'].forEach(id => {
    map.on('mouseenter', id, () => { if(mode !== 'draw') map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  });
}

function slotsFC(){
  const now = Date.now();
  return {type:'FeatureCollection', features:SLOTS.map(s => {
    const st = slotState(s.id, now);
    return {type:'Feature', properties:{id:s.id, k:st.k, tcolor:(TYPES[s.type]||TYPES.unk).color}, geometry:{type:'Polygon', coordinates:[s.ring]}};
  })};
}
function slotPtsFC(){
  const now = Date.now();
  return {type:'FeatureCollection', features:SLOTS.map(s => {
    const st = slotState(s.id, now); if(!['high','mid','low','soon'].includes(st.k)) return null;
    const r = s.ring.slice(0,4), c = [r.reduce((a,p)=>a+p[0],0)/r.length, r.reduce((a,p)=>a+p[1],0)/r.length];
    return {type:'Feature', properties:{id:s.id, k:st.k}, geometry:{type:'Point', coordinates:c}};
  }).filter(Boolean)};
}
function segLblFC(){
  return {type:'FeatureCollection', features:S.segments.concat(OSM_SEGS).filter(seg => seg.pts.length > 1 && seg.type !== 'unk').map(seg => {
    const t = TYPES[seg.type] || TYPES.unk, i = Math.floor((seg.pts.length-1)/2), a = seg.pts[i], b = seg.pts[i+1];
    return {type:'Feature', properties:{sym:t.sym, color:t.color}, geometry:{type:'Point', coordinates:[(a[0]+b[0])/2,(a[1]+b[1])/2]}};
  })};
}
const CH_COL = p => p >= .5 ? '#22b35e' : p >= .25 ? '#e0a43a' : '#e5484d';
function segsFC(){
  const M = survModel(), cache = {};
  const ch = name => name ? (name in cache ? cache[name] : (cache[name] = CH_COL(chanceNow(name, lastPos, M).p))) : 'rgba(0,0,0,0)';
  return {type:'FeatureCollection', features:S.segments.concat(OSM_SEGS).map(seg => ({type:'Feature',
    properties:{id:seg.id, color:(TYPES[seg.type]||TYPES.unk).color, ch:ch(seg.type === 'pmr' ? '' : seg.name)}, geometry:{type:'LineString', coordinates:seg.pts}}))};
}
function looseFC(){
  const now = Date.now();
  return {type:'FeatureCollection', features:S.loose.filter(l => !l.done).map(l => {
    let k = null;
    if(l.soon && now < l.soon) k = 'soon'; else { const f = freeLevel(l.free, now); k = f && f.k; }
    if(!k) return null;
    return {type:'Feature', properties:{id:l.id, k}, geometry:{type:'Point', coordinates:[l.lng, l.lat]}};
  }).filter(Boolean)};
}
function draftFC(){
  const f = draft.map(p => ({type:'Feature', properties:{}, geometry:{type:'Point', coordinates:p}}));
  if(draft.length > 1) f.push({type:'Feature', properties:{}, geometry:{type:'LineString', coordinates:draft}});
  return {type:'FeatureCollection', features:f};
}
function setData(id, data){ const s = mapReady && map.getSource(id); if(s) s.setData(data); }
function drawPins(){
  if(!mapReady) return;
  if(carMarker){ carMarker.remove(); carMarker = null; }
  if(S.parked){ const el = document.createElement('div'); el.className = 'car-pin'; el.textContent = '🚗';
    carMarker = new maplibregl.Marker({element:el}).setLngLat([S.parked.lng, S.parked.lat])
      .setPopup(new maplibregl.Popup({offset:16}).setHTML('<div class="pop"><b>Ta voiture</b><br>Garée à ' + hhmm(S.parked.t) + '</div>')).addTo(map); }
  if(destMarker){ destMarker.remove(); destMarker = null; }
  if(S.dest){ const el = document.createElement('div'); el.className = 'dest-pin';
    destMarker = new maplibregl.Marker({element:el}).setLngLat([S.dest.lng, S.dest.lat])
      .setPopup(new maplibregl.Popup({offset:14}).setHTML('<div class="pop"><b>Destination</b><br>' + esc(S.dest.label) + '</div>')).addTo(map); }
}
function drawMe(){
  if(!mapReady || !lastPos) return;
  if(!meMarker){ const el = document.createElement('div'); el.className = 'me-dot'; meMarker = new maplibregl.Marker({element:el}).setLngLat([lastPos.lng, lastPos.lat]).addTo(map); }
  else meMarker.setLngLat([lastPos.lng, lastPos.lat]);
}
let segsT = 0;
function renderMapData(){ if(Date.now() - segsT > 20000){ segsT = Date.now(); setData('segs', segsFC()); } setData('slots', slotsFC()); setData('spts', slotPtsFC()); setData('loose', looseFC()); }
function renderMap(){
  if(!mapReady) return;
  setData('segs', segsFC()); setData('segl', segLblFC()); setData('draft', draftFC()); renderMapData(); drawPins();
}
function needMap(){ if(mapReady) return true; toast('Carte indisponible sur cet appareil : l’appli marche en mode liste.'); return false; }

/* ---------- Mode cartographie ---------- */
function buildChips(){
  const box = $('typeChips'); box.innerHTML = '';
  Object.entries(TYPES).forEach(([k, t]) => {
    if(k === 'unk') return;
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button';
    b.textContent = t.label; b.setAttribute('aria-pressed', String(k === draftType));
    b.addEventListener('click', () => { draftType = k; buildChips(); });
    box.appendChild(b);
  });
}
function setMode(m){
  if(m === 'draw' && !needMap()) return;
  mode = m; draft = [];
  $('drawbar').hidden = m !== 'draw'; $('tDraw').setAttribute('aria-pressed', String(m === 'draw'));
  if(m === 'draw'){ buildChips(); setSat(true); set3d(false); if(map.getZoom() < 18) map.easeTo({zoom:18.5}); }
  if(popup){ popup.remove(); popup = null; }
  render();
}
$('tDraw').addEventListener('click', () => setMode(mode === 'draw' ? 'view' : 'draw'));
$('dUndo').addEventListener('click', () => { draft.pop(); setData('draft', draftFC()); renderStatus(); });
$('dSave').addEventListener('click', async () => {
  if(draft.length < 2){ toast('Pose au moins deux points : le début et la fin de la file.'); return; }
  const seg = {id:'u' + Date.now(), pts:draft.slice(), type:draftType, name:'', src:'user'};
  S.segments.push(seg); draft = []; rebuildSlots(); save(); render();
  const n = SLOTS.filter(s => s.segId === seg.id).length;
  toast(n + ' place' + (n > 1 ? 's' : '') + ' ajoutée' + (n > 1 ? 's' : '') + '. Continue avec la file suivante.');
  // Nom de la rue
  try{
    const mid = seg.pts[Math.floor(seg.pts.length/2)];
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=' + mid[1] + '&lon=' + mid[0], {headers:{'Accept-Language':'fr'}});
    const j = await r.json(); const road = j.address && (j.address.road || j.address.pedestrian || j.address.square);
    if(road){ seg.name = road; rebuildSlots(); save(); render(); }
  }catch(e){}
});

/* ---------- Outils de vue ---------- */
function set3d(on){
  is3d = on; $('t3d').setAttribute('aria-pressed', String(on));
  if(!mapReady) return;
  map.easeTo({pitch:on ? 58 : 0, bearing:on ? map.getBearing() : 0});
  showBuildings(on && !isSat);
}
function setSat(on){
  isSat = on; $('tSat').setAttribute('aria-pressed', String(on));
  if(!mapReady) return;
  map.setLayoutProperty('sat', 'visibility', on ? 'visible' : 'none');
  showBuildings(is3d && !on);
}
$('t3d').addEventListener('click', () => set3d(!is3d));
$('tSat').addEventListener('click', () => setSat(!isSat));
$('tPark').addEventListener('click', async () => {
  if(!needMap()) return;
  parksOn = !parksOn; $('tPark').setAttribute('aria-pressed', String(parksOn));
  if(parksOn && !PARKINGS.length) await loadParkings();
  map.setLayoutProperty('parks', 'visibility', parksOn ? 'visible' : 'none');
});
$('tMe').addEventListener('click', async () => {
  startWatch();
  if(lastPos) fly(lastPos, 18);
  else { try{ const p = await getPos(); lastPos = p; drawMe(); fly(p, 18); }catch(e){ toast('Autorise la localisation pour ce site dans les réglages du navigateur.'); } }
});

/* ---------- Légende ---------- */
function buildLegend(){
  const box = $('legendPanel'); if(!box) return;
  const types = Object.entries(TYPES).filter(([k]) => k !== 'unk').map(([k,t]) =>
    '<div><i class="sw" style="background:' + t.color + '"></i><b>' + esc(t.sym || '') + '</b> ' + esc(t.label) + '</div>').join('');
  box.innerHTML = '<h3>Type de place</h3>' + types +
    '<h3>Chance de trouver (halo autour des rues)</h3>' +
    '<div><i class="dot" style="background:#22b35e"></i>Bonne (50 % ou plus)</div>' +
    '<div><i class="dot" style="background:#e0a43a"></i>Moyenne (25 à 50 %)</div>' +
    '<div><i class="dot" style="background:#e5484d"></i>Faible (moins de 25 %)</div>' +
    '<h3>Disponibilité</h3>' +
    '<div><i class="dot" style="background:#16c060"></i>Libre, très probable</div>' +
    '<div><i class="dot" style="background:#f0b429"></i>Libre, probable</div>' +
    '<div><i class="dot" style="background:#f07a3a"></i>Voiture qui part</div>' +
    '<div><i class="car" style="background:#3d474b"></i>Voiture garée</div>' +
    '<div><i class="car" style="background:#a9b4b8"></i>Pas d’info</div>' +
    '<small>Touche une place pour voir le détail.</small>';
}
$('tLeg').addEventListener('click', () => { const p = $('legendPanel'); p.hidden = !p.hidden; $('tLeg').setAttribute('aria-pressed', String(!p.hidden)); });
buildLegend();
