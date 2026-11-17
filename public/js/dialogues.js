/* PlaceLibre · fenêtres (bienvenue, confirmation de la place, réglages) au clavier et au lecteur d'écran.
   À l'ouverture : le reste de l'appli devient inactif (inert) et le focus va dans la fenêtre
   (sur la première place proposée pour la confirmation). Échap ferme la bienvenue et les réglages
   (la confirmation est déjà gérée dans events.js). À la fermeture, le focus revient là où il était. */
'use strict';
(function(){
  const FENETRES = ['confirmSlot', 'welcome', 'settings'];
  const FOCUSABLE = 'button:not([disabled]):not([hidden]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const app = document.getElementById('app');
  let origine = null;
  const ouverte = () => FENETRES.map(id => document.getElementById(id)).find(el => el && !el.hidden) || null;

  function maj(){
    const f = ouverte();
    if(app) app.inert = !!f;
    if(f){
      if(!origine && document.activeElement && !f.contains(document.activeElement)) origine = document.activeElement;
      if(!f.contains(document.activeElement)){
        const cible = f.querySelector('[data-slot]') || f.querySelector(FOCUSABLE);
        if(cible) cible.focus({preventScroll:true});
        else { f.tabIndex = -1; f.focus({preventScroll:true}); }
      }
    }else if(origine){
      const o = origine; origine = null;
      if(document.contains(o) && typeof o.focus === 'function') o.focus({preventScroll:true});
    }
  }
  const obs = new MutationObserver(() => requestAnimationFrame(maj));
  FENETRES.forEach(id => {
    const el = document.getElementById(id);
    if(el) obs.observe(el, {attributes:true, attributeFilter:['hidden'], childList:true, subtree:true});
  });
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    const f = ouverte(); if(!f) return;
    if(f.id === 'welcome' && typeof closeWelcome === 'function') closeWelcome();
    else if(f.id === 'settings'){ const b = document.getElementById('btnCloseSet'); if(b) b.click(); }
  });
  maj();
})();
