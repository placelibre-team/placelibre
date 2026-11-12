/* PlaceLibre · scénarios du simulateur
   Chaque scénario reçoit un « monde » neuf : {tel, h, bus, dire, verifier, nouveauBus}.
   - dire(texte)           : ajoute une ligne à la chronologie (avec l'heure simulée) ;
   - verifier(ok, texte)   : une vérification ; si elle échoue, le scénario échoue.
   `connu` : défaut déjà identifié, pas encore corrigé (« échec connu », n'empêche pas de continuer).
   Quand le défaut est corrigé, le simulateur le signale : retirer alors `connu`. */
'use strict';

const PLACE_TEST = 'b04-5';   // une place de la rue Bricka (registre figé de public/js/places.js)

module.exports = [
  {
    id: 'depart-et-controles',
    titre: 'Un départ, puis les contrôles à 5, 10 et 30 minutes',
    async executer({tel, h, dire, verifier}) {
      dire('Anthony appuie sur « Je pars » devant ' + PLACE_TEST + ' (rue Bricka).');
      await tel.partir(PLACE_TEST);
      let e = tel.etatPlace(PLACE_TEST);
      dire('État de la place : ' + e.texte);
      verifier(e.k === 'soon' && e.secs > 0 && e.secs <= 45, 'la place passe en « voiture qui part » (≤ 45 s)');

      await h.secondes(60);
      e = tel.etatPlace(PLACE_TEST);
      dire('+1 min · ' + e.texte);
      verifier(e.k === 'high', 'après le départ la place est « libre » avec une chance élevée');

      await h.minutes(4);
      let c = tel.controlesEnAttente();
      dire('+5 min · contrôles demandés : ' + (c.map(x => x.h + ' min').join(', ') || 'aucun'));
      verifier(c.length === 1 && c[0].h === 5, 'le contrôle à 5 min apparaît');
      tel.repondreControle(c[0].dep, 5, 'libre');
      dire('Contrôle à 5 min : place vue LIBRE.');

      await h.minutes(5);
      c = tel.controlesEnAttente();
      verifier(c.length === 1 && c[0].h === 10, 'le contrôle à 10 min apparaît');
      tel.repondreControle(c[0].dep, 10, 'occupee');
      e = tel.etatPlace(PLACE_TEST);
      dire('+10 min · contrôle à 10 min : place vue OCCUPÉE → ' + e.texte);
      verifier(e.k === 'occ', 'la place est maintenant « occupée »');

      await h.minutes(20);
      c = tel.controlesEnAttente();
      verifier(c.length === 1 && c[0].h === 30, 'le contrôle à 30 min apparaît');
      dire('+30 min · contrôle à 30 min : personne ne répond.');

      await h.minutes(7);
      verifier(tel.controlesEnAttente().length === 0, 'sans réponse, le contrôle disparaît après 5 min');
      const controles = tel.journal().filter(x => x.type === 'controle').sort((a, b) => a.t - b.t).map(x => x.etat);
      dire('+37 min · journal des contrôles : ' + controles.join(', '));
      verifier(JSON.stringify(controles) === JSON.stringify(['libre', 'occupee', 'non_observe']),
        'le journal contient libre, occupée, puis « non observé »');

      const survie = tel.survie();
      verifier(survie.every(r => !r.enough), 'avec moins de 5 mesures, le modèle affiche « données insuffisantes »');
      verifier(survie.every((r, i) => i === 0 || r.p <= survie[i - 1].p + 1e-9), 'la probabilité de rester libre ne remonte jamais avec le temps');
    }
  },
  {
    id: 'arrivee-prend-la-place',
    titre: 'Quelqu’un se gare sur la place libérée',
    async executer({tel, h, dire, verifier}) {
      await tel.partir(PLACE_TEST);
      dire('Départ annoncé sur ' + PLACE_TEST + '.');
      await h.minutes(3);
      const avant = tel.modele().tauN;
      dire('+3 min · un conducteur se gare sur la même place (« Je me gare »).');
      await tel.arriver(PLACE_TEST);
      const e = tel.etatPlace(PLACE_TEST);
      dire('État de la place : ' + e.texte);
      verifier(e.k === 'occ', 'la place est « occupée »');
      verifier(tel.modele().tauN === avant + 1, 'l’appli apprend une durée de disponibilité à partir de cette arrivée');
      const types = tel.journal().map(x => x.type);
      verifier(JSON.stringify(types) === JSON.stringify(['depart', 'arrive']), 'le journal contient départ puis arrivée (' + types.join(', ') + ')');
    }
  },
  {
    id: 'prevision-avec-depart',
    titre: 'Un départ annoncé améliore la prévision à l’arrivée',
    async executer({tel, dire, verifier}) {
      const dest = tel.centre(PLACE_TEST);
      const avant = tel.prevision(dest, 5);
      const p100 = pr => pr.rows.find(r => r.r === 100).p;
      dire('Prévision à 5 min, sans signalement : ' + Math.round(p100(avant) * 100) + ' % à moins de 100 m (qualité : ' + avant.quality + ').');
      await tel.partir(PLACE_TEST);
      const apres = tel.prevision(dest, 5);
      dire('Après un départ annoncé : ' + Math.round(p100(apres) * 100) + ' % (qualité : ' + apres.quality + ').');
      verifier(avant.quality !== 'live', 'sans signalement, la prévision n’est pas « en direct »');
      verifier(apres.quality === 'live', 'avec un départ annoncé, la prévision devient « en direct »');
      verifier(p100(apres) >= p100(avant), 'le départ annoncé n’abaisse pas la prévision');
      verifier(apres.rows.every((r, i) => i === 0 || r.p >= apres.rows[i - 1].p), 'plus le rayon est grand, plus la chance est grande');
      verifier(apres.rows.every(r => r.p >= 0.03 && r.p <= 0.95), 'les pourcentages restent entre 3 % et 95 %');
    }
  },
  {
    id: 'arrivee-avant-depart',
    titre: 'Arriver AVANT que la voiture parte',
    connu: 'tâche 1 de Tom : la place est comptée libre alors que la voiture n’est pas encore partie',
    async executer({tel, dire, verifier}) {
      await tel.partir(PLACE_TEST);
      dire('Départ annoncé : la voiture part dans ~45 s.');
      const tot = tel.probaPlace(PLACE_TEST, 0.1).p;
      const tard = tel.probaPlace(PLACE_TEST, 2).p;
      dire('Chance de trouver la place si on arrive dans 6 s (avant le départ) : ' + Math.round(tot * 100) + ' %.');
      dire('Chance de trouver la place si on arrive dans 2 min (après le départ) : ' + Math.round(tard * 100) + ' %.');
      verifier(tot < 0.1, 'arriver avant le départ ne doit presque jamais donner la place (< 10 %)');
      verifier(tard > tot, 'arriver après le départ doit donner plus de chances qu’arriver avant');
    }
  },
  {
    id: 'journal-sans-gps',
    titre: 'Le journal ne contient aucune coordonnée GPS',
    async executer({tel, dire, verifier}) {
      await tel.partir(PLACE_TEST);
      await tel.arriver('b04-6');
      tel.signaler('b04-7', true);
      const journal = tel.journal();
      dire(journal.length + ' lignes dans le journal : ' + journal.map(x => x.type).join(', ') + '.');
      const champs = new Set(journal.flatMap(x => Object.keys(x)));
      verifier(!['lat', 'lng', 'latitude', 'longitude', 'pos'].some(k => champs.has(k)), 'aucune ligne du journal ne porte de latitude ou de longitude');
      const csv = tel.evalIn('journalCSV()');
      verifier(!/lat|lng|longitude|latitude/i.test(csv.split('\n')[0]), 'l’en-tête de l’export CSV ne contient pas de coordonnées');
    }
  },
  {
    id: 'canal-reel-jamais-touche',
    titre: 'Le canal réel n’est jamais touché',
    async executer({tel, h, bus, dire, verifier, nouveauBus}) {
      await tel.partir(PLACE_TEST);
      tel.signaler('b04-7', true);
      await h.minutes(2);
      await tel.arriver('b04-8');
      dire(bus.envois.length + ' messages envoyés par le téléphone virtuel.');
      verifier(bus.envois.length >= 3, 'les actions sont bien diffusées sur le faux réseau');
      verifier(bus.envois.every(x => /-test$/.test(x.sujet)), 'tous les messages vont sur un canal « -test »');
      verifier(bus.violations.length === 0, 'aucune tentative vers le canal réel ou un site externe');

      const autre = nouveauBus();
      let refuse = false;
      try { autre.publier('https://ntfy.sh/placelibre-juan-q7m2x9k4', '{}'); } catch (e) { refuse = true; }
      dire('Écriture directe sur le canal réel dans un faux réseau neuf : ' + (refuse ? 'refusée' : 'ACCEPTÉE'));
      verifier(refuse && autre.envois.length === 0, 'le garde-fou refuse toute écriture sur le canal réel');
    }
  }
];
