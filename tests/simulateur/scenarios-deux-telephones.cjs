/* PlaceLibre · scénarios à deux téléphones (tâche 2 d'Anthony)
   Deux téléphones virtuels, A (Anthony) et B (Camille), sont reliés au même faux canal « -test ».
   On vérifie qu'ils affichent la même chose, y compris après une coupure réseau.
   Contexte reçu : {a, b, tel (= a), h, bus, dire, verifier}.
   `necessite` : fonction de l'appli dont dépend le scénario (PR « signalements fiables » de Stan).
   Tant qu'elle n'existe pas dans l'appli, un échec est « connu » ; dès qu'elle existe, il devient une
   vraie erreur. Rien à modifier après la fusion de cette PR. */
'use strict';

const PLACE = 'b04-5';    // rue Bricka
const AUTRE = 'b04-6';    // la place voisine
const FILE_ATTENTE = {fonction: 'flushOutbox', tache: 'tâche 2 de Stan : file d’attente des envois (PR signalements fiables)'};
const RELECTURE = {fonction: 'pollBus', tache: 'tâche 2 de Stan : relecture du canal après une coupure (PR signalements fiables)'};
const FUSION = {fonction: 'foldSlot', tache: 'tâche 1 de Stan : état identique et contradictions (PR signalements fiables)'};

const memeEtat = (a, b, id) => {
  const x = a.etatPlace(id), y = b.etatPlace(id);
  return x.k === y.k && x.texte === y.texte;
};
const decrire = (nom, t, id) => nom + ' voit ' + id + ' : ' + t.etatPlace(id).texte;

module.exports = [
  {
    id: 'deux-telephones-meme-etat',
    titre: 'Deux téléphones voient la même chose',
    deux: true,
    async executer({a, b, h, dire, verifier}) {
      await a.partir(PLACE);
      dire('A appuie sur « Je pars » devant ' + PLACE + '.');
      dire(decrire('B', b, PLACE));
      verifier(b.etatPlace(PLACE).k === 'soon', 'B voit tout de suite la voiture qui part');
      verifier(memeEtat(a, b, PLACE), 'A et B affichent le même état');

      await h.secondes(60);
      verifier(memeEtat(a, b, PLACE), '1 minute plus tard, A et B affichent toujours le même état (' + b.etatPlace(PLACE).texte + ')');

      await b.arriver(PLACE);
      dire('B appuie sur « Je me gare » sur ' + PLACE + '.');
      dire(decrire('A', a, PLACE));
      verifier(a.etatPlace(PLACE).k === 'occ' && b.etatPlace(PLACE).k === 'occ', 'A et B voient la place « occupée »');
      verifier(memeEtat(a, b, PLACE), 'A et B affichent le même état');
    }
  },
  {
    id: 'doublon-ignore',
    titre: 'Un message reçu deux fois ne change rien',
    deux: true,
    async executer({a, b, bus, dire, verifier}) {
      await a.partir(PLACE);
      const avant = JSON.stringify({etat: b.etatBrut(PLACE), journal: b.journal().length});
      const envoye = bus.envois[0];
      verifier(!!envoye, 'A a bien publié un message');
      bus.publier(bus.base + envoye.sujet, envoye.corps);   // le même message arrive une 2e fois chez B
      const apres = JSON.stringify({etat: b.etatBrut(PLACE), journal: b.journal().length});
      dire('Le même message est rejoué chez B (même identifiant).');
      verifier(avant === apres, 'l’état et le journal de B ne changent pas');
      verifier(memeEtat(a, b, PLACE), 'A et B affichent toujours le même état');
    }
  },
  {
    id: 'coupure-reception',
    titre: 'B perd le réseau pendant que A signale un départ',
    deux: true,
    necessite: RELECTURE,
    async executer({a, b, h, dire, verifier}) {
      b.couperReseau(true);
      dire('B perd le réseau.');
      await a.partir(PLACE);
      dire('A appuie sur « Je pars » devant ' + PLACE + '.');
      verifier(b.etatPlace(PLACE).k === 'unk', 'pendant la coupure, B ne voit rien (' + b.etatPlace(PLACE).texte + ')');

      await h.minutes(2);
      b.couperReseau(false);
      await b.laisserFaire();
      dire('+2 min · B retrouve le réseau.');
      dire(decrire('B', b, PLACE));
      verifier(b.etatPlace(PLACE).k !== 'unk', 'B rattrape le signalement manqué');
      verifier(memeEtat(a, b, PLACE), 'A et B affichent le même état');
    }
  },
  {
    id: 'coupure-envoi',
    titre: 'A signale un départ sans réseau, l’envoi repart au retour',
    deux: true,
    necessite: FILE_ATTENTE,
    async executer({a, b, h, bus, dire, verifier}) {
      a.couperReseau(true);
      dire('A perd le réseau.');
      await a.partir(PLACE);
      const heureDepart = h.now();
      await a.laisserFaire();
      dire('A appuie sur « Je pars » devant ' + PLACE + ' (sans réseau).');
      verifier(bus.envois.length === 0, 'rien n’est publié pendant la coupure');
      verifier(a.etatPlace(PLACE).k === 'soon', 'A voit quand même son propre départ');
      verifier(a.envoisEnAttente() === 1, 'l’envoi est gardé en attente (1 envoi)');
      verifier(b.etatPlace(PLACE).k === 'unk', 'B ne sait encore rien');

      await h.minutes(3);
      a.couperReseau(false);
      await a.laisserFaire();
      dire('+3 min · A retrouve le réseau.');
      verifier(bus.envois.length === 1, 'l’envoi repart au retour du réseau');
      const ev = bus.envois[0] ? JSON.parse(bus.envois[0].corps) : {};
      verifier(ev.ts === heureDepart, 'le message garde l’heure d’origine du départ (pas celle du retour)');
      verifier(a.envoisEnAttente() === 0, 'la file d’attente est vide');
      dire(decrire('B', b, PLACE));
      verifier(b.etatPlace(PLACE).k !== 'unk', 'B reçoit le signalement');
      verifier(memeEtat(a, b, PLACE), 'A et B affichent le même état, calé sur l’heure d’origine');
    }
  },
  {
    id: 'coupure-des-deux-cotes',
    titre: 'A et B signalent chacun de leur côté pendant une coupure',
    deux: true,
    necessite: FILE_ATTENTE,
    async executer({a, b, h, dire, verifier}) {
      a.couperReseau(true); b.couperReseau(true);
      dire('A et B perdent le réseau.');
      await a.partir(PLACE);
      dire('A : « Je pars » devant ' + PLACE + '.');
      await h.secondes(30);
      await b.arriver(AUTRE);
      dire('B : « Je me gare » sur ' + AUTRE + '.');

      await h.minutes(2);
      a.couperReseau(false);
      await a.laisserFaire();
      b.couperReseau(false);
      await b.laisserFaire();
      await a.laisserFaire();
      dire('+2 min · le réseau revient chez A puis chez B.');
      dire(decrire('A', a, AUTRE));
      dire(decrire('B', b, PLACE));
      verifier(memeEtat(a, b, PLACE), 'A et B affichent le même état pour ' + PLACE);
      verifier(memeEtat(a, b, AUTRE), 'A et B affichent le même état pour ' + AUTRE);
      verifier(a.etatPlace(AUTRE).k === 'occ', 'A voit ' + AUTRE + ' occupée');
      verifier(b.etatPlace(PLACE).k !== 'unk', 'B voit le départ de A');
      verifier(a.envoisEnAttente() === 0 && b.envoisEnAttente() === 0, 'plus aucun envoi en attente');
    }
  },
  {
    id: 'signalements-contradictoires',
    titre: 'Un signalement « libre » juste après un « occupée » d’une autre personne',
    deux: true,
    necessite: FUSION,
    async executer({a, b, h, dire, verifier}) {
      b.signaler(PLACE, false);
      dire('B signale ' + PLACE + ' OCCUPÉE.');
      await h.secondes(20);
      a.signaler(PLACE, true);
      dire('+20 s · A signale la même place LIBRE.');
      dire(decrire('A', a, PLACE));
      dire(decrire('B', b, PLACE));
      verifier(memeEtat(a, b, PLACE), 'A et B affichent le même état');
      verifier(a.etatPlace(PLACE).k === 'occ', 'par prudence la place reste « occupée »');
      const brut = a.etatBrut(PLACE) || {};
      verifier(brut.conflict === true, 'l’état est marqué « signalements contradictoires »');
    }
  }
];
