'use strict';
const $=id=>document.getElementById(id), API=ParkingOccupancy, KEY='placelibre:parking-pilot:v1';
let data={version:1,parkings:[]}, mode='mine', example=null;
function say(message){$('message').textContent=message;}
try{const raw=localStorage.getItem(KEY);if(raw)data=API.validate(JSON.parse(raw));}
catch(e){say('Données locales non chargées : '+e.message+' Aucun fichier n’a été effacé.');}
function save(next){
  try{const checked=API.validate(next);localStorage.setItem(KEY,JSON.stringify(checked));data=checked;return true;}
  catch(e){say('Enregistrement impossible : '+e.message);return false;}
}
function element(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;}
const accessLabel={public:'Ouvert au public',customers:'Réservé aux clients',unknown:'Accès à confirmer'};
const kindLabel={manual:'Comptage manuel',operator:'Source exploitant déclarée',demo:'DONNÉES FICTIVES'};
function render(){
  const demo=mode==='demo', list=demo?example.parkings:data.parkings;
  $('mine').setAttribute('aria-pressed',String(!demo));$('demo').setAttribute('aria-pressed',String(demo));
  $('notice').className='notice'+(demo?' demo':'');
  $('notice').textContent=demo?'EXEMPLE FICTIF — aucun parking réel. Ces chiffres ne décrivent aucune disponibilité réelle. Vos données locales sont conservées.':'Les données restent dans ce navigateur. Aucun comptage n’est envoyé à d’autres utilisateurs.';
  $('form').hidden=demo;$('export').disabled=demo||!data.parkings.length;$('clear').disabled=demo||!data.parkings.length;
  $('count').textContent=list.length+' parking'+(list.length>1?'s':'');
  const cards=$('cards');cards.replaceChildren();
  if(!list.length){const el=element('div','empty');el.append(element('b','', 'Aucun parking renseigné'),element('span','','Ajoute une capacité vérifiée ou explore l’exemple fictif. Une capacité seule ne dit pas combien de places sont libres.'));cards.append(el);return;}
  for(const p of list){
    const state=API.availability(p), card=element('article','card');
    card.append(element('h3','',p.name),element('span','badge '+state.status,state.status==='recent'?'Comptage récent':state.status==='stale'?'Comptage ancien':'Sans comptage'));
    card.append(element('p','number',state.free===null?'—':String(state.free)),element('p','caption',state.free===null?'Disponibilité inconnue':'Places non occupées au dernier comptage · non garanti'));
    const meta=element('div','meta');
    meta.append(element('p','','Capacité déclarée : '+p.capacity+' · '+accessLabel[p.access]),element('p','',kindLabel[p.kind]+' · '+p.source));
    meta.append(element('p','',p.observedAt?'Observé le '+new Date(p.observedAt).toLocaleString('fr-FR')+' · '+p.occupied+' occupées':'Date de comptage : non renseignée'));
    meta.append(element('p','','Seuil choisi : '+p.maxAgeMinutes+' min.'));card.append(meta);
    if(!demo){const actions=element('div','actions'),edit=element('button','','Actualiser'),del=element('button','','Supprimer');
      edit.onclick=()=>editParking(p);del.onclick=()=>{if(confirm('Supprimer « '+p.name+' » de ce navigateur ?')&&save({version:1,parkings:data.parkings.filter(x=>x.id!==p.id)})){reset();render();}};
      actions.append(edit,del);card.append(actions);}
    cards.append(card);
  }
}
function localDate(iso){const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function reset(){$('form').reset();$('id').value='';$('cancel').hidden=true;$('formTitle').textContent='Un parking';}
function editParking(p){
  for(const key of ['id','name','capacity','source','kind','access'])$(key).value=p[key];
  $('occupied').value=p.occupied===null?'':p.occupied;$('observedAt').value=p.observedAt?localDate(p.observedAt):'';
  $('maxAge').value=p.maxAgeMinutes;$('formTitle').textContent='Actualiser le parking';$('cancel').hidden=false;$('name').focus();
}
$('form').onsubmit=e=>{
  e.preventDefault();say('');
  const count=$('occupied').value, date=$('observedAt').value;
  if(count!==''&&!date){say('Renseigne la date du comptage.');return;}
  if(count===''&&date){say('Efface la date si le nombre de places occupées est inconnu.');return;}
  const timestamp=date?new Date(date):null;
  if(timestamp&&!Number.isFinite(timestamp.getTime())){say('Date invalide.');return;}
  const p={id:$('id').value||'parking-'+crypto.randomUUID(),name:$('name').value,capacity:Number($('capacity').value),
    occupied:count===''?null:Number(count),observedAt:timestamp?timestamp.toISOString():null,
    source:$('source').value,kind:$('kind').value,access:$('access').value,maxAgeMinutes:Number($('maxAge').value)};
  const next=data.parkings.filter(x=>x.id!==p.id).concat(p);
  if(save({version:1,parkings:next})){reset();render();say('Parking enregistré dans ce navigateur.');}
};
$('cancel').onclick=reset;$('now').onclick=()=>{$('observedAt').value=localDate(Date.now());};
$('demo').onclick=()=>{mode='demo';example=API.demo();say('');render();};
$('mine').onclick=()=>{mode='mine';say('');render();};
$('clear').onclick=()=>{if(confirm('Effacer tous les parkings enregistrés dans ce navigateur ?')&&save({version:1,parkings:[]})){reset();render();say('Données locales effacées.');}};
$('export').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download='placelibre-parkings-pilotes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('import').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>1000000)throw new Error('Fichier limité à 1 Mo.');
    const next=API.validate(JSON.parse(await file.text()));
    if(next.parkings.some(p=>p.kind==='demo'))throw new Error('Les données fictives doivent rester dans le mode exemple.');
    if(data.parkings.length&&!confirm('Remplacer les parkings locaux par ceux du fichier ?'))return;
    if(save(next)){mode='mine';reset();render();say('Import terminé. Source déclarée non vérifiée automatiquement.');}
  }catch(error){say('Import refusé : '+error.message+' Vos données sont conservées.');}
  finally{e.target.value='';}
};
render();setInterval(render,30000);
