/* PlaceLibre · fenêtres (bienvenue, confirmation de la place, réglages) au clavier et au lecteur d'écran.
   À l'ouverture : le reste de l'appli devient inactif (inert) et le focus va dans la fenêtre
   (sur la place sélectionnée pour la confirmation). Tab reste dans la fenêtre ; Échap ferme la bienvenue et les réglages
   (la confirmation est déjà gérée dans events.js). À la fermeture, le focus revient là où il était. */
'use strict';
(function(){
  const FENETRES = ['confirmSlot', 'welcome', 'settings'];
  const FOCUSABLE = 'button:not([disabled]):not([hidden]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const app = document.getElementById('app');
  let origine = null;
  const ouverte = () => FENETRES.map(id => document.getElementById(id)).find(el => el && !el.hidden) || null;
  const cibles = f => Array.from(f.querySelectorAll(FOCUSABLE)).filter(el =>
    !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[hidden], [inert]'));

  function entrer(f){
    const choix = cibles(f);
    const cible = choix.find(el => el.matches('.opt.on[data-slot]')) || choix.find(el => el.hasAttribute('data-slot')) || choix[0];
    if(cible) cible.focus({preventScroll:true});
    else { f.tabIndex = -1; f.focus({preventScroll:true}); }
  }

  function maj(){
    const f = ouverte();
    if(app) app.inert = !!f;
    FENETRES.forEach(id => { const el = document.getElementById(id); if(el) el.inert = !!f && el !== f; });
    if(f){
      if(!origine && document.activeElement && !f.contains(document.activeElement)) origine = document.activeElement;
      if(!f.contains(document.activeElement)) entrer(f);
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
    const f = ouverte(); if(!f) return;
    if(e.key === 'Tab'){
      const choix = cibles(f), premier = choix[0], dernier = choix[choix.length - 1];
      if(!choix.length){ e.preventDefault(); entrer(f); }
      else if(!choix.includes(document.activeElement) || (e.shiftKey ? document.activeElement === premier : document.activeElement === dernier)){
        e.preventDefault(); (e.shiftKey ? dernier : premier).focus({preventScroll:true});
      }
      return;
    }
    if(e.key !== 'Escape') return;
    if(f.id === 'welcome' && typeof closeWelcome === 'function') closeWelcome();
    else if(f.id === 'settings'){ const b = document.getElementById('btnCloseSet'); if(b) b.click(); }
  }, true);
  maj();
})();
