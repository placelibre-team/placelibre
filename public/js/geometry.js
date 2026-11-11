/* PlaceLibre · géométrie (découpe des files en places) et rues OpenStreetMap */
'use strict';

function toM(p, ref){return [(p[0]-ref[0])*111320*Math.cos(ref[1]*Math.PI/180), (p[1]-ref[1])*111320];}
function toLL(x, y, ref){return [ref[0] + x/(111320*Math.cos(ref[1]*Math.PI/180)), ref[1] + y/111320];}
function slotsForLine(pts, segId, offset){
  const ref = pts[0], out = []; let k = 0;
  for(let i = 0; i < pts.length - 1; i++){
    const a = toM(pts[i], ref), b = toM(pts[i+1], ref);
    const dx = b[0]-a[0], dy = b[1]-a[1], L = Math.hypot(dx, dy);
    if(L < 3) continue;
    const ux = dx/L, uy = dy/L, px = -uy, py = ux;
    const ox = px*(offset||0), oy = py*(offset||0);
    const n = Math.max(1, Math.floor(L/SLOT_LEN)), sl = L/n, hl = sl*0.42, hw = 0.95;
    for(let j = 0; j < n; j++){
      const c = (j + 0.5)*sl, cx = a[0] + ux*c + ox, cy = a[1] + uy*c + oy;
      const ring = [[-hl,-hw],[hl,-hw],[hl,hw],[-hl,hw]].map(([s,w]) => toLL(cx + ux*s + px*w, cy + uy*s + py*w, ref));
      ring.push(ring[0]);
      const ctr = toLL(cx, cy, ref);
      out.push({id:segId + '-' + (k++), ring, lng:ctr[0], lat:ctr[1]});
    }
  }
  return out;
}
function rebuildSlots(){
  SLOTS = []; SLOT_BY_ID = {};
  const all = S.segments.concat(OSM_SEGS);
  all.forEach(seg => {
    const off = seg.src === 'osm' ? seg.side*4 : 0;
    slotsForLine(seg.pts, seg.id, off).forEach(s => {
      s.segId = seg.id; s.type = seg.type; s.name = seg.name || ''; s.src = seg.src;
      SLOTS.push(s); SLOT_BY_ID[s.id] = s;
    });
  });
  PMR_POINTS.forEach(pt => { const sl = nearestSlot(pt, 12); if(sl){ sl.type = 'pmr'; sl.pmrLabel = pt.label; } });
}
function segById(id){return S.segments.find(s => s.id === id) || OSM_SEGS.find(s => s.id === id);}
function nearestSlot(p, max){
  let best = null, bd = max || LINK_M;
  SLOTS.forEach(s => { const d = dist(p, s); if(d < bd){ bd = d; best = s; } });
  return best;
}

async function overpass(q){
  const r = await fetch(OVERPASS, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'data=' + encodeURIComponent(q)});
  if(!r.ok) throw new Error(r.status);
  return r.json();
}
const PARK_OK = /^(lane|street_side|on_kerb|half_on_kerb|shoulder|yes|parallel|diagonal|perpendicular|marked)$/;
async function loadOsmStreets(force){
  let segs = force ? null : readCache('plj:osmst', 7*864e5);
  if(!segs){
    try{
      const j = await overpass('[out:json][timeout:25];way["highway"][~"^parking:(left|right|both|lane)"~"."](' + BBOX.join(',') + ');out tags geom;');
      segs = [];
      j.elements.forEach(w => {
        if(!w.geometry || w.geometry.length < 2) return;
        const t = w.tags || {}, pts = w.geometry.map(g => [g.lon, g.lat]);
        ['left','right'].forEach(side => {
          const v = t['parking:' + side] || t['parking:both'] || t['parking:lane:' + side] || t['parking:lane:both'];
          if(!v || !PARK_OK.test(v)) return;
          const fee = t['parking:' + side + ':fee'] || t['parking:both:fee'];
          const cond = t['parking:condition:' + side] || t['parking:condition:both'] || '';
          const restr = t['parking:' + side + ':restriction'] || t['parking:both:restriction'] || '';
          let type = 'unk';
          if(fee === 'no' || cond === 'free') type = 'free';
          else if(fee === 'yes' || cond === 'ticket') type = 'pay';
          else if(/disc/.test(cond + restr)) type = 'blue';
          else if(/resid/.test(cond + restr)) type = 'res';
          segs.push({id:'o' + w.id + side[0], pts, type, name:t.name || '', src:'osm', side:side === 'left' ? 1 : -1});
        });
      });
      writeCache('plj:osmst', segs);
    }catch(e){ segs = []; toast('Les rues OpenStreetMap n’ont pas pu être chargées. Tu peux cartographier toi-même avec Carto.'); }
  }
  OSM_SEGS = segs; rebuildSlots(); render(); renderSettings();
}
async function loadParkings(){
  let els = readCache('plj:osmpark', 7*864e5);
  if(!els){
    try{
      const j = await overpass('[out:json][timeout:25];nwr["amenity"="parking"]["name"](' + BBOX.join(',') + ');out center tags;');
      els = j.elements.map(e => ({lat:e.lat != null ? e.lat : (e.center && e.center.lat), lng:e.lon != null ? e.lon : (e.center && e.center.lon), tags:e.tags || {}}))
        .filter(e => e.lat != null && !/^(private|customers|no)$/.test(e.tags.access || ''));
      writeCache('plj:osmpark', els);
    }catch(e){ els = []; toast('Parkings non chargés (réseau).'); }
  }
  const now = new Date(), summer = now.getMonth() >= 5 && now.getMonth() <= 8;
  PARKINGS = els.map(e => {
    const n = (e.tags.name || '').toLowerCase();
    let fee = e.tags.fee === 'no' ? 'free' : e.tags.fee === 'yes' ? 'pay' : 'unk';
    if(/nation|chataign|châtaign/.test(n)) fee = 'free';
    if(/palmiers/.test(n)) fee = summer ? 'pay' : 'free';
    if(/gallice|congr|ambassadeurs|esterel|estérel|antibes.les.pins/.test(n)) fee = 'pay';
    return {type:'Feature', properties:{name:e.tags.name, fee, cap:e.tags.capacity || ''}, geometry:{type:'Point', coordinates:[e.lng, e.lat]}};
  });
  setData('parks', {type:'FeatureCollection', features:PARKINGS});
}


/* Bâtiments de l'IGN avec leur vraie hauteur (en cache 30 jours sur le téléphone) */
async function loadBuildings(){
  let fc = readCache('plj:bd1', 30*864e5);
  if(!fc){
    try{
      const j = await (await fetch(BD_URL)).json();
      const r6 = p => [+p[0].toFixed(6), +p[1].toFixed(6)];
      fc = {type:'FeatureCollection', features:j.features.map(f => {
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        return {type:'Feature', properties:{h:(f.properties && f.properties.hauteur) || 6},
          geometry:{type:'MultiPolygon', coordinates:polys.map(p => p.map(ring => ring.map(r6)))}};
      })};
      if(fc.features.length) writeCache('plj:bd1', fc);
    }catch(e){ return null; }
  }
  return fc.features.length ? fc : null;
}
