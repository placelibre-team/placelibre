#!/usr/bin/env node
/* PlaceLibre · simulateur du quartier (Bricka / Saint-Honorat)
   Rejoue des départs, des arrivées et des contrôles sans aller dans la rue : le temps est simulé,
   le réseau est factice et rien n'est envoyé sur le vrai canal.

   Pour essayer une autre version de l'appli sans la fusionner (par exemple une branche extraite dans
   /tmp/ma-branche/public) : PLACELIBRE_APP=/tmp/ma-branche node tests/simulateur/simulateur.cjs

   Usage :
     node tests/simulateur/simulateur.cjs               lance tous les scénarios, avec la chronologie
     node tests/simulateur/simulateur.cjs --silencieux  n'affiche que le résultat
     node tests/simulateur/simulateur.cjs --liste       liste les scénarios
     node tests/simulateur/simulateur.cjs <id>          lance un seul scénario
   Code de sortie : 0 si tout est conforme, 1 sinon (un « échec connu » n'est pas une erreur). */
'use strict';
const {creerHorloge, creerBus, creerTelephone} = require('./environnement.cjs');
const scenarios = [...require('./scenarios.cjs'), ...require('./scenarios-deux-telephones.cjs')];

const args = process.argv.slice(2);
const silencieux = args.includes('--silencieux');
const choix = args.filter(a => !a.startsWith('--'));

if (args.includes('--liste')) {
  scenarios.forEach(s => console.log(s.id.padEnd(30) + s.titre + (s.deux ? '  [2 téléphones]' : '') +
    (s.connu ? '  [échec connu]' : '') + (s.necessite ? '  [dépend de ' + s.necessite.fonction + ']' : '')));
  process.exit(0);
}
const aLancer = choix.length ? scenarios.filter(s => choix.includes(s.id)) : scenarios;
if (!aLancer.length) { console.error('Scénario inconnu. Essayer --liste.'); process.exit(1); }

// Jeudi 12 novembre 2026, 10 h (heure locale) : jour ouvré, rue Bricka payante 9 h-12 h
const DEBUT = () => new Date(2026, 10, 12, 10, 0, 0);
const heure = h => new Date(h.now()).toLocaleTimeString('fr-FR');

async function lancer(scenario) {
  const h = creerHorloge(DEBUT());
  const bus = creerBus(h);
  const tel = creerTelephone({nom: 'Anthony', horloge: h, bus});
  await tel.demarrer();
  let b = null;
  if (scenario.deux) { b = creerTelephone({nom: 'Camille', horloge: h, bus}); await b.demarrer(); }
  // Un scénario qui dépend d'une fonction absente de l'appli (pas encore fusionnée) échoue « pour une raison connue »
  const connu = scenario.connu || (scenario.necessite && !tel.possede(scenario.necessite.fonction) ? scenario.necessite.tache : null);
  const lignes = [], echecs = [];
  const dire = texte => lignes.push('  ' + heure(h) + '  ' + texte);
  const verifier = (ok, texte) => { lignes.push('      ' + (ok ? '✔ ' : '✘ ') + texte); if (!ok) echecs.push(texte); };
  try {
    await scenario.executer({tel, a: tel, b, h, bus, dire, verifier, nouveauBus: () => creerBus(h)});
  } catch (e) {
    echecs.push('exception : ' + (e && e.message ? e.message : e));
    lignes.push('      ✘ exception : ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
  let statut;
  if (!echecs.length) statut = scenario.connu ? 'CORRIGÉ' : 'OK';
  else statut = connu ? 'ÉCHEC CONNU' : 'ÉCHEC';
  return {scenario, lignes, echecs, statut, connu};
}

(async () => {
  const resultats = [];
  for (const s of aLancer) resultats.push(await lancer(s));
  for (const r of resultats) {
    if (!silencieux) {
      console.log('\n▶ ' + r.scenario.titre + '  (' + r.scenario.id + ')');
      r.lignes.forEach(l => console.log(l));
    }
    const note = r.statut === 'ÉCHEC CONNU' ? ' : ' + r.connu
      : r.statut === 'CORRIGÉ' ? ' : défaut corrigé, retirer « connu » de ce scénario'
      : r.statut === 'ÉCHEC' ? ' : ' + r.echecs.join(' ; ') : '';
    console.log((silencieux ? '' : '  → ') + r.statut.padEnd(12) + r.scenario.id + note);
  }
  const bloquants = resultats.filter(r => r.statut === 'ÉCHEC');
  const connus = resultats.filter(r => r.statut === 'ÉCHEC CONNU');
  console.log('\n' + resultats.length + ' scénarios · ' + bloquants.length + ' échec(s) · ' + connus.length + ' échec(s) connu(s)');
  process.exit(bloquants.length ? 1 : 0);
})();
