/* PlaceLibre · carte 3D (MapLibre). Tout est protégé par mapReady : sans carte, l'appli marche en mode liste. */
'use strict';

let map = null, popup = null, carMarker = null, destMarker = null;
let is3d = true, isSat = false, parksOn = false;

function emptyFC(){return {type:'FeatureCollection', features:[]};}
function fly(p, z){ if(mapReady && p) map.flyTo({center:[p.lng, p.lat], zoom:z || 18, essential:true}); }
function firstSymbolId(){ const l = map.getStyle().layers.find(x => x.type === 'symbol'); return l ? l.id : undefined; }
function buildingLayers(){ return map.getStyle().layers.filter(l => /building/.test(l.id)).map(l => l.id); }

function initMap(){
  map = new maplibregl.Map({
    container:'map', style:'https://tiles.openfreemap.org/styles/liberty',
    center:CENTER, zoom:17.6, pitch:55, bearing:-20, maxPitch:75,
    attributionControl:{compact:true}
  });
  map.addControl(new maplibregl.NavigationControl({showCompass:true, showZoom:false, visualizePitch:true}), 'bottom-right');

  map.on('load', () => {
    // Photo aérienne IGN (gratuite, licence ouverte)
    map.addSource('ign', {type:'raster', tileSize:256, maxzoom:19, attribution:'© IGN BD ORTHO',
      tiles:['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}']});
    map.addLayer({id:'sat', type:'raster', source:'ign', layout:{visibility:'none'}}, firstSymbolId());

    // Bâtiments 3D si le style n'en a pas déjà
    if(!map.getStyle().layers.some(l => l.type === 'fill-extrusion')){
      const src = Object.keys(map.getStyle().sources).find(k => map.getStyle().sources[k].type === 'vector');
      if(src) map.addLayer({id:'building-3d-pl', type:'fill-extrusion', source:src, 'source-layer':'building', minzoom:14,
        paint:{'fill-extrusion-color':'#d9d3c9', 'fill-extrusion-height':['coalesce',['get','render_height'],8],
          'fill-extrusion-base':['coalesce',['get','render_min_height'],0], 'fill-extrusion-opacity':0.85}});
    }

    map.addSource('segs', {type:'geojson', data:emptyFC()});
    map.addSource('slots', {type:'geojson', data:emptyFC()});
    map.addSource('loose', {type:'geojson', data:emptyFC()});
    map.addSource('draft', {type:'geojson', data:emptyFC()});
    map.addSource('parks', {type:'geojson', data:emptyFC()});

    map.addLayer({id:'segs-line', type:'line', source:'segs',
      paint:{'line-color':['get','color'], 'line-width':['interpolate',['linear'],['zoom'],15,1,19,3], 'line-opacity':0.55, 'line-dasharray':[2,1]}});
    map.addLayer({id:'slots-fill', type:'fill', source:'slots',
      paint:{'fill-color':['match',['get','k'],'high','#22b35e','mid','#e0a43a','low','#9fb3a3','soon','#f07a3a','occ','#5c676b','#a3adb1'],
        'fill-opacity':['match',['get','k'],'high',0.95,'mid',0.9,'low',0.75,0.45],
        'fill-outline-color':['get','tcolor']}});
    map.addLayer({id:'slots-car', type:'fill-extrusion', source:'slots', minzoom:15.5,
      filter:['in',['get','k'],['literal',['occ','unk','soon']]],
      paint:{'fill-extrusion-color':['match',['get','k'],'occ','#3d474b','soon','#f07a3a','#a9b4b8'],
        'fill-extrusion-height':['match',['get','k'],'soon',1.55,1.45], 'fill-extrusion-base':0.25, 'fill-extrusion-opacity':0.95}});
    map.addLayer({id:'loose', type:'circle', source:'loose',
      paint:{'circle-radius':9, 'circle-color':['match',['get','k'],'high','#22b35e','mid','#e0a43a','soon','#f07a3a','#9fb3a3'],
        'circle-stroke-color':'#fff', 'circle-stroke-width':2}});
    map.addLayer({id:'parks', type:'circle', source:'parks', layout:{visibility:'none'},
      paint:{'circle-radius':8, 'circle-color':['match',['get','fee'],'free','#1f9d55','pay','#2f5fb3','#7d8b90'], 'circle-stroke-color':'#fff', 'circle-stroke-width':2}});
    map.addLayer({id:'draft-line', type:'line', source:'draft', paint:{'line-color':'#f0c419', 'line-width':4}});
    map.addLayer({id:'draft-pt', type:'circle', source:'draft', filter:['==',['geometry-type'],'Point'],
      paint:{'circle-radius':7, 'circle-color':'#f0c419', 'circle-stroke-color':'#14262c', 'circle-stroke-width':2}});

    mapReady = true;
    rebuildSlots(); render(); drawMe();
  });
  map.on('error', e => { if(e && e.error && /style/i.test(String(e.error.message||''))) toast('La carte n’a pas pu se charger (réseau).'); });

  map.on('click', e => {
    if(mode === 'draw'){ draft.push([e.lngLat.lng, e.lngLat.lat]); setData('draft', draftFC()); renderStatus(); return; }
    const f = map.queryRenderedFeatures(e.point, {layers:['slots-car','slots-fill','loose','parks']});
    if(!f.length) return;
    const p = f[0].properties, layer = f[0].layer.id;
    let html = '';
    if(layer === 'slots-car' || layer === 'slots-fill'){
      const s = SLOT_BY_ID[p.id]; if(!s) return;
      const st = slotState(s.id, Date.now()), seg = segById(s.segId);
      const raw = S.slotState[s.id], by = raw && raw.by && st.k !== 'unk' ? ' · signalé par ' + raw.by : '';
      html = '<div class="pop"><b>' + esc(s.name || 'Place dans la rue') + '</b><br>' + esc((TYPES[s.type]||TYPES.unk).label) + ' · ' + esc(stateText(st) + by) +
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
  ['slots-car','slots-fill','loose','parks'].forEach(id => {
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
function segsFC(){
  return {type:'FeatureCollection', features:S.segments.concat(OSM_SEGS).map(seg => ({type:'Feature',
    properties:{id:seg.id, color:(TYPES[seg.type]||TYPES.unk).color}, geometry:{type:'LineString', coordinates:seg.pts}}))};
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
function renderMapData(){ setData('slots', slotsFC()); setData('loose', looseFC()); }
function renderMap(){
  if(!mapReady) return;
  setData('segs', segsFC()); setData('draft', draftFC()); renderMapData(); drawPins();
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
  map.easeTo({pitch:on ? 55 : 0, bearing:on ? map.getBearing() : 0});
  buildingLayers().forEach(id => { if(map.getLayer(id) && map.getLayer(id).type === 'fill-extrusion') map.setLayoutProperty(id, 'visibility', on && !isSat ? 'visible' : 'none'); });
}
function setSat(on){
  isSat = on; $('tSat').setAttribute('aria-pressed', String(on));
  if(!mapReady) return;
  map.setLayoutProperty('sat', 'visibility', on ? 'visible' : 'none');
  buildingLayers().forEach(id => { if(map.getLayer(id) && map.getLayer(id).type === 'fill-extrusion') map.setLayoutProperty(id, 'visibility', is3d && !on ? 'visible' : 'none'); });
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
