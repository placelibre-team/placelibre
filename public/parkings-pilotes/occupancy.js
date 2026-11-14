/* Registre local de comptages agrégés. Aucune requête réseau ni prédiction. */
(function(root){
  'use strict';
  const text = (v, label, max) => {
    if(typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(label + ' invalide.');
    return v.trim();
  };
  function validate(input, now=Date.now()){
    if(!input || input.version !== 1 || !Array.isArray(input.parkings) || input.parkings.length > 200)
      throw new Error('Format attendu : version 1 et liste de 200 parkings maximum.');
    const ids=new Set();
    const parkings=input.parkings.map(p=>{
      if(!p || typeof p !== 'object') throw new Error('Parking invalide.');
      const id=text(p.id,'Identifiant',80), name=text(p.name,'Nom',100);
      if(ids.has(id)) throw new Error('Identifiant dupliqué : '+id); ids.add(id);
      if(!Number.isInteger(p.capacity) || p.capacity<1 || p.capacity>100000) throw new Error('Capacité invalide pour '+name+'.');
      if(!['public','customers','unknown'].includes(p.access)) throw new Error('Accès invalide pour '+name+'.');
      if(!Number.isInteger(p.maxAgeMinutes) || p.maxAgeMinutes<1 || p.maxAgeMinutes>60) throw new Error('Seuil de fraîcheur : 1 à 60 minutes.');
      const source=text(p.source,'Source',160);
      if(!['manual','operator','demo'].includes(p.kind)) throw new Error('Type de source invalide.');
      const occupied=p.occupied, observedAt=p.observedAt;
      if(occupied===null){
        if(observedAt!==null) throw new Error('Sans comptage, la date doit être nulle.');
      }else{
        if(!Number.isInteger(occupied) || occupied<0 || occupied>p.capacity) throw new Error('Comptage hors capacité pour '+name+'.');
        if(typeof observedAt!=='string' || !/(Z|[+-]\d{2}:\d{2})$/.test(observedAt) ||
           !Number.isFinite(Date.parse(observedAt)) || Date.parse(observedAt)>now)
          throw new Error('Date de comptage invalide ou située dans le futur pour '+name+'.');
      }
      // Liste blanche : aucun champ supplémentaire (plaque, GPS, etc.) n'est conservé.
      return {id,name,capacity:p.capacity,access:p.access,maxAgeMinutes:p.maxAgeMinutes,source,kind:p.kind,
        occupied,observedAt:observedAt===null?null:new Date(observedAt).toISOString()};
    });
    return {version:1,parkings};
  }
  function availability(p,now=Date.now()){
    if(p.occupied===null || p.observedAt===null) return {status:'unknown',free:null,ageMinutes:null};
    const ageMinutes=(now-Date.parse(p.observedAt))/60000;
    if(!Number.isFinite(ageMinutes) || ageMinutes<0) return {status:'unknown',free:null,ageMinutes:null};
    if(ageMinutes>=p.maxAgeMinutes) return {status:'stale',free:null,ageMinutes};
    return {status:'recent',free:p.capacity-p.occupied,ageMinutes};
  }
  function demo(now=Date.now()){
    const date=m=>new Date(now-m*60000).toISOString();
    return {version:1,parkings:[
      {id:'demo-a',name:'Parking exemple A',capacity:120,occupied:84,observedAt:date(3),source:'Comptage fictif',kind:'demo',access:'customers',maxAgeMinutes:15},
      {id:'demo-b',name:'Parking exemple B',capacity:80,occupied:65,observedAt:date(24),source:'Comptage fictif',kind:'demo',access:'customers',maxAgeMinutes:15},
      {id:'demo-c',name:'Parking exemple C',capacity:60,occupied:null,observedAt:null,source:'Inventaire fictif',kind:'demo',access:'unknown',maxAgeMinutes:15}
    ]};
  }
  const api={validate,availability,demo};
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.ParkingOccupancy=api;
})(typeof globalThis==='object'?globalThis:this);
