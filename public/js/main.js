/* PlaceLibre · démarrage
   1. Les données, la liste des rues, le temps réel et les contrôles démarrent tout de suite, sans la carte.
   2. La carte 3D se charge ensuite. Si la bibliothèque ou WebGL manque, l'appli reste en mode liste. */
'use strict';

if(TEST){ $('testBanner').hidden = false; document.title = 'Place Libre Juan · test'; }

rebuildSlots(); render(); startWatch(); syncStart();
loadOsmStreets();
setInterval(() => {
  renderMapData(); renderStatus(); renderChecks();
  if(document.visibilityState === 'visible') renderList();
}, 2000);

// Raccourci iPhone ouvrant l'appli : ?evt=depart|arrive&lat=…&lng=…
(function(){
  const evt = URLP.get('evt'); if(!evt) return;
  const lat = parseFloat(URLP.get('lat')), lng = parseFloat(URLP.get('lng'));
  const pp = (!isNaN(lat) && !isNaN(lng)) ? {lat, lng} : null;
  try{ history.replaceState(null, '', location.pathname + (TEST ? '?canal=test' : '')); }catch(e){}
  if(evt === 'depart') startDepart('bluetooth', pp);
  else if(evt === 'arrive') doArrive('bluetooth', pp);
})();

/* ---------- Carte : bibliothèque (avec source de secours) puis WebGL ---------- */
function hasWebGL(){
  try{ const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch(e){ return false; }
}
function listMode(why){
  $('app').classList.add('nomap');
  $('map').innerHTML = '<div class="fail"><b>Carte indisponible : mode liste.</b><p>' + esc(why) +
    ' Les chances par rue, le temps réel, Je pars / Je me gare et les contrôles marchent quand même.</p></div>';
  render();
}
(function(){
  const LIBS = ['https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
                'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js'];
  if(!hasWebGL()) return listMode('Ce navigateur ne permet pas l’affichage 3D (WebGL désactivé).');
  function load(i){
    if(i >= LIBS.length) return listMode('La bibliothèque de carte n’a pas pu se charger (réseau).');
    const s = document.createElement('script');
    s.src = LIBS[i];
    s.onload = () => {
      if(!window.maplibregl) return load(i + 1);
      try{ initMap(); }catch(e){ console.error(e); mapReady = false; listMode('La carte a rencontré une erreur au démarrage.'); }
    };
    s.onerror = () => load(i + 1);
    document.head.appendChild(s);
  }
  load(0);
})();
