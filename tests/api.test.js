'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Api = require('../app/src/main/assets/js/api.js');

function reponse(corps, statut) {
  const ok = statut === undefined || (statut >= 200 && statut < 300);
  return {
    ok: ok,
    status: statut === undefined ? 200 : statut,
    json: () => (corps instanceof Error ? Promise.reject(corps) : Promise.resolve(corps))
  };
}

function fauxFetch(resultat) {
  const appels = [];
  const f = (url) => {
    appels.push(url);
    return resultat instanceof Error ? Promise.reject(resultat) : Promise.resolve(resultat);
  };
  f.appels = appels;
  return f;
}

const PREVISIONS = { current: { time: 'x' }, hourly: { time: [] }, daily: { time: [] } };

test('urlPrevisions : tous les paramètres du cahier des charges', () => {
  const u = new URL(Api.urlPrevisions(48.85, 2.35));
  assert.equal(u.origin + u.pathname, 'https://api.open-meteo.com/v1/forecast');
  const q = u.searchParams;
  assert.equal(q.get('latitude'), '48.85');
  assert.equal(q.get('longitude'), '2.35');
  assert.equal(q.get('current'),
    'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day,precipitation');
  assert.equal(q.get('hourly'), 'temperature_2m,weather_code,precipitation_probability,is_day');
  assert.equal(q.get('daily'),
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset');
  assert.equal(q.get('timezone'), 'auto');
  assert.equal(q.get('forecast_days'), '7');
  assert.equal(q.get('wind_speed_unit'), 'kmh');
});

test('urlPrevisions : coordonnées négatives', () => {
  const q = new URL(Api.urlPrevisions(-33.87, -151.21)).searchParams;
  assert.equal(q.get('latitude'), '-33.87');
  assert.equal(q.get('longitude'), '-151.21');
});

test('urlRecherche : texte accentué et caractères spéciaux encodés', () => {
  const brut = Api.urlRecherche('Saint-Étienne & co');
  assert.ok(!brut.includes(' '), 'aucun espace brut');
  assert.ok(!brut.includes('& co'), 'esperluette encodée');
  const u = new URL(brut);
  assert.equal(u.origin + u.pathname, 'https://geocoding-api.open-meteo.com/v1/search');
  assert.equal(u.searchParams.get('name'), 'Saint-Étienne & co');
  assert.equal(u.searchParams.get('count'), '8');
  assert.equal(u.searchParams.get('language'), 'fr');
  assert.equal(u.searchParams.get('format'), 'json');
});

test('chargerPrevisions : renvoie le JSON et appelle la bonne adresse', async () => {
  const f = fauxFetch(reponse(PREVISIONS));
  const r = await Api.chargerPrevisions(48.85, 2.35, f);
  assert.equal(r, PREVISIONS);
  assert.deepEqual(f.appels, [Api.urlPrevisions(48.85, 2.35)]);
});

test('chargerPrevisions : statut 500 -> erreur api', async () => {
  await assert.rejects(Api.chargerPrevisions(1, 2, fauxFetch(reponse({}, 500))), { code: 'api' });
});

test('chargerPrevisions : JSON illisible -> erreur api', async () => {
  const f = fauxFetch(reponse(new SyntaxError('Unexpected token')));
  await assert.rejects(Api.chargerPrevisions(1, 2, f), { code: 'api' });
});

test('chargerPrevisions : champs manquants -> erreur api', async () => {
  for (const cle of ['current', 'hourly', 'daily']) {
    const corps = Object.assign({}, PREVISIONS);
    delete corps[cle];
    await assert.rejects(Api.chargerPrevisions(1, 2, fauxFetch(reponse(corps))), { code: 'api' }, cle);
  }
  await assert.rejects(Api.chargerPrevisions(1, 2, fauxFetch(reponse(null))), { code: 'api' });
});

test('chargerPrevisions : fetch rejeté -> erreur reseau', async () => {
  const f = fauxFetch(new TypeError('Failed to fetch'));
  await assert.rejects(Api.chargerPrevisions(1, 2, f), { code: 'reseau' });
});

test('chercherVilles : met en forme les résultats', async () => {
  const f = fauxFetch(reponse({
    results: [
      { name: 'Lyon', latitude: 45.74906, longitude: 4.84789, admin1: 'Auvergne-Rhône-Alpes', country: 'France' },
      { name: 'Lyon', latitude: 1, longitude: 2 }
    ]
  }));
  const villes = await Api.chercherVilles('Lyon', f);
  assert.deepEqual(villes, [
    { nom: 'Lyon', region: 'Auvergne-Rhône-Alpes', pays: 'France', latitude: 45.74906, longitude: 4.84789 },
    { nom: 'Lyon', region: '', pays: '', latitude: 1, longitude: 2 }
  ]);
  assert.deepEqual(f.appels, [Api.urlRecherche('Lyon')]);
});

test('chercherVilles : aucun résultat -> liste vide', async () => {
  assert.deepEqual(await Api.chercherVilles('zzzz', fauxFetch(reponse({ generationtime_ms: 1 }))), []);
});

test('chercherVilles : ignore les résultats sans coordonnées', async () => {
  const f = fauxFetch(reponse({ results: [{ name: 'Sans lieu' }, { name: 'Ok', latitude: 0, longitude: 0 }] }));
  const villes = await Api.chercherVilles('x', f);
  assert.equal(villes.length, 1);
  assert.equal(villes[0].nom, 'Ok');
});

test('chercherVilles : erreurs réseau et api', async () => {
  await assert.rejects(Api.chercherVilles('x', fauxFetch(new TypeError('hs'))), { code: 'reseau' });
  await assert.rejects(Api.chercherVilles('x', fauxFetch(reponse({}, 400))), { code: 'api' });
});
