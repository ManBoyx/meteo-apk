'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Meteo = require('../app/src/main/assets/js/meteo.js');
const Stockage = require('../app/src/main/assets/js/stockage.js');
const App = require('../app/src/main/assets/js/app.js');

const PARIS = { nom: 'Paris', region: 'Île-de-France', pays: 'France', latitude: 48.85, longitude: 2.35 };
const LYON = { nom: 'Lyon', region: 'Auvergne-Rhône-Alpes', pays: 'France', latitude: 45.75, longitude: 4.85 };
const NICE = { nom: 'Nice', region: '', pays: 'France', latitude: 43.7, longitude: 7.26 };

function donnees(temp) {
  return {
    timezone: 'Europe/Paris',
    current: { time: '2026-10-06T06:15', temperature_2m: temp, weather_code: 0, is_day: 1 },
    hourly: { time: ['2026-10-06T06:00'], temperature_2m: [temp], weather_code: [0], precipitation_probability: [10], is_day: [1] },
    daily: { time: ['2026-10-06'], weather_code: [0], temperature_2m_max: [20], temperature_2m_min: [10], precipitation_probability_max: [10], sunrise: ['2026-10-06T07:57'], sunset: ['2026-10-06T19:19'] }
  };
}

function differe() {
  let resoudre, rejeter;
  const promesse = new Promise((ok, ko) => { resoudre = ok; rejeter = ko; });
  return { promesse, resoudre, rejeter };
}

function erreur(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function magasin() {
  const d = {};
  return {
    getItem: (k) => (k in d ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); },
    removeItem: (k) => { delete d[k]; }
  };
}

// Monte une appli avec une API pilotée à la main par les tests.
function monter() {
  const previsions = [];
  const recherches = [];
  const etats = [];
  const etatsRecherche = [];
  const stockage = Stockage.creer(magasin());
  let horloge = 1000;
  const api = {
    chargerPrevisions: (latitude, longitude) => {
      const d = differe();
      previsions.push({ latitude, longitude, resoudre: d.resoudre, rejeter: d.rejeter });
      return d.promesse;
    },
    chercherVilles: (texte) => {
      const d = differe();
      recherches.push({ texte, resoudre: d.resoudre, rejeter: d.rejeter });
      return d.promesse;
    }
  };
  const app = App.creer({
    api: api,
    stockage: stockage,
    meteo: Meteo,
    afficher: (e) => etats.push(e),
    afficherRecherche: (e) => etatsRecherche.push(e),
    maintenant: () => horloge
  });
  return {
    app, stockage, previsions, recherches, etats, etatsRecherche,
    dernier: () => etats[etats.length - 1],
    derniereRecherche: () => etatsRecherche[etatsRecherche.length - 1],
    avancer: (ms) => { horloge += ms; }
  };
}

test('charger : écran de chargement puis météo', async () => {
  const m = monter();
  const fin = m.app.charger(LYON);
  assert.equal(m.dernier().type, 'chargement');
  assert.deepEqual(m.dernier().ville, LYON);
  assert.deepEqual(m.previsions.map((p) => [p.latitude, p.longitude]), [[45.75, 4.85]]);

  m.previsions[0].resoudre(donnees(17));
  await fin;

  const e = m.dernier();
  assert.equal(e.type, 'meteo');
  assert.deepEqual(e.ville, LYON);
  assert.equal(e.previsions.actuel.temp, 17);
  assert.equal(e.horsLigne, false);
  assert.equal(e.enCours, false);
  assert.equal(e.recuLe, 1000);
});

test('charger : mémorise la ville et les prévisions', async () => {
  const m = monter();
  const fin = m.app.charger(LYON);
  m.previsions[0].resoudre(donnees(17));
  await fin;
  assert.deepEqual(m.stockage.lireVille(), LYON);
  assert.deepEqual(m.stockage.lirePrevisions(LYON), { donnees: donnees(17), recuLe: 1000 });
  assert.deepEqual(m.app.villeCourante(), LYON);
});

test('charger : les données en mémoire sont affichées pendant le rechargement', async () => {
  const m = monter();
  m.stockage.ecrirePrevisions(LYON, donnees(9), 500);
  const fin = m.app.charger(LYON);
  const e = m.dernier();
  assert.equal(e.type, 'meteo');
  assert.equal(e.enCours, true);
  assert.equal(e.horsLigne, false);
  assert.equal(e.previsions.actuel.temp, 9);
  assert.equal(e.recuLe, 500);
  m.previsions[0].resoudre(donnees(17));
  await fin;
  assert.equal(m.dernier().previsions.actuel.temp, 17);
  assert.equal(m.dernier().enCours, false);
});

test("réponses dans le désordre : l'ancienne ville ne remplace pas la nouvelle", async () => {
  const m = monter();
  const finLyon = m.app.charger(LYON);
  const finNice = m.app.charger(NICE);

  m.previsions[1].resoudre(donnees(25));
  await finNice;
  const nombre = m.etats.length;

  m.previsions[0].resoudre(donnees(5));
  await finLyon;

  assert.equal(m.etats.length, nombre, "aucun affichage après la réponse tardive");
  assert.deepEqual(m.dernier().ville, NICE);
  assert.equal(m.dernier().previsions.actuel.temp, 25);
  assert.deepEqual(m.stockage.lireVille(), NICE);
  assert.notEqual(m.stockage.lirePrevisions(NICE), null, 'la mémoire reste celle de la nouvelle ville');
});

test("échec tardif de l'ancienne ville : ignoré", async () => {
  const m = monter();
  const finLyon = m.app.charger(LYON);
  const finNice = m.app.charger(NICE);
  m.previsions[1].resoudre(donnees(25));
  await finNice;
  m.previsions[0].rejeter(erreur('reseau'));
  await finLyon;
  assert.equal(m.dernier().type, 'meteo');
  assert.deepEqual(m.dernier().ville, NICE);
});

test('pas de réseau, données en mémoire : affichage hors ligne', async () => {
  const m = monter();
  m.stockage.ecrirePrevisions(LYON, donnees(9), 500);
  const fin = m.app.charger(LYON);
  m.previsions[0].rejeter(erreur('reseau'));
  await fin;
  const e = m.dernier();
  assert.equal(e.type, 'meteo');
  assert.equal(e.horsLigne, true);
  assert.equal(e.enCours, false);
  assert.equal(e.recuLe, 500);
  assert.equal(e.previsions.actuel.temp, 9);
});

test("pas de réseau, aucune donnée : écran d'erreur", async () => {
  const m = monter();
  const fin = m.app.charger(LYON);
  m.previsions[0].rejeter(erreur('reseau'));
  await fin;
  assert.equal(m.dernier().type, 'erreur');
  assert.deepEqual(m.dernier().ville, LYON);
  assert.match(m.dernier().message, /connexion/i);
});

test("erreur du service : message distinct de l'absence de réseau", async () => {
  const m = monter();
  const fin = m.app.charger(LYON);
  m.previsions[0].rejeter(erreur('api'));
  await fin;
  assert.equal(m.dernier().type, 'erreur');
  assert.doesNotMatch(m.dernier().message, /connexion/i);
});

test('réponse reçue mais inexploitable : erreur, rien en mémoire', async () => {
  const m = monter();
  const fin = m.app.charger(LYON);
  m.previsions[0].resoudre({ current: {}, hourly: {}, daily: {} });
  await fin;
  assert.equal(m.dernier().type, 'erreur');
  assert.equal(m.stockage.lirePrevisions(LYON), null);
});

test('mémoire inexploitable et pas de réseau : erreur, sans exception', async () => {
  const m = monter();
  m.stockage.ecrirePrevisions(LYON, { n: 'importe quoi' }, 500);
  const fin = m.app.charger(LYON);
  assert.equal(m.dernier().type, 'chargement');
  m.previsions[0].rejeter(erreur('reseau'));
  await fin;
  assert.equal(m.dernier().type, 'erreur');
});

test('actualiser : recharge la ville courante', async () => {
  const m = monter();
  const fin = m.app.charger(LYON);
  m.previsions[0].resoudre(donnees(17));
  await fin;
  m.avancer(60000);
  const fin2 = m.app.actualiser();
  assert.equal(m.previsions.length, 2);
  assert.deepEqual([m.previsions[1].latitude, m.previsions[1].longitude], [45.75, 4.85]);
  m.previsions[1].resoudre(donnees(18));
  await fin2;
  assert.equal(m.dernier().previsions.actuel.temp, 18);
  assert.equal(m.dernier().recuLe, 61000);
});

test('villeCourante : celle en mémoire avant tout chargement', () => {
  const m = monter();
  assert.deepEqual(m.app.villeCourante(), PARIS);
});

test("basculerFavori : met à jour la mémoire et réaffiche l'écran", async () => {
  const m = monter();
  const fin = m.app.charger(LYON);
  m.previsions[0].resoudre(donnees(17));
  await fin;
  assert.equal(m.dernier().favori, false);

  m.app.basculerFavori();
  assert.equal(m.stockage.estFavori(LYON), true);
  assert.equal(m.dernier().type, 'meteo');
  assert.equal(m.dernier().favori, true);

  m.app.basculerFavori();
  assert.equal(m.stockage.estFavori(LYON), false);
  assert.equal(m.dernier().favori, false);
});

test('rechercher : moins de 2 caractères affiche les favoris', async () => {
  const m = monter();
  m.stockage.basculerFavori(NICE);
  await m.app.rechercher(' l ');
  assert.deepEqual(m.derniereRecherche(), { type: 'favoris', villes: [NICE] });
  assert.equal(m.recherches.length, 0);
});

test('rechercher : attente puis résultats', async () => {
  const m = monter();
  const fin = m.app.rechercher('  Lyon ');
  assert.deepEqual(m.derniereRecherche(), { type: 'attente' });
  assert.equal(m.recherches[0].texte, 'Lyon');
  m.recherches[0].resoudre([LYON]);
  await fin;
  assert.deepEqual(m.derniereRecherche(), { type: 'resultats', villes: [LYON] });
});

test("rechercher : la réponse d'une frappe précédente est ignorée", async () => {
  const m = monter();
  const fin1 = m.app.rechercher('Ly');
  const fin2 = m.app.rechercher('Lyon');
  m.recherches[1].resoudre([LYON]);
  await fin2;
  m.recherches[0].resoudre([NICE]);
  await fin1;
  assert.deepEqual(m.derniereRecherche(), { type: 'resultats', villes: [LYON] });
});

test('rechercher : une réponse tardive ne remplace pas les favoris après effacement', async () => {
  const m = monter();
  const fin1 = m.app.rechercher('Lyon');
  await m.app.rechercher('');
  m.recherches[0].resoudre([LYON]);
  await fin1;
  assert.equal(m.derniereRecherche().type, 'favoris');
});

test('rechercher : erreur réseau', async () => {
  const m = monter();
  const fin = m.app.rechercher('Lyon');
  m.recherches[0].rejeter(erreur('reseau'));
  await fin;
  assert.equal(m.derniereRecherche().type, 'erreur');
  assert.match(m.derniereRecherche().message, /connexion/i);
});

test('retirerFavori : met à jour la liste et l étoile de la ville affichée', async () => {
  const m = monter();
  const fin = m.app.charger(LYON);
  m.previsions[0].resoudre(donnees(17));
  await fin;
  m.app.basculerFavori();
  m.stockage.basculerFavori(NICE);

  m.app.retirerFavori(LYON);
  assert.deepEqual(m.derniereRecherche(), { type: 'favoris', villes: [NICE] });
  assert.equal(m.dernier().favori, false);
});

test('retirerFavori : sans effet sur une ville qui n est pas favorite', () => {
  const m = monter();
  m.stockage.basculerFavori(NICE);
  m.app.retirerFavori(LYON);
  assert.deepEqual(m.stockage.lireFavoris(), [NICE]);
});
