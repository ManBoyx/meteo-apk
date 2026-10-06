'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Meteo = require('../app/src/main/assets/js/meteo.js');

function reponseExemple() {
  // Lieu fictif en avance de 9 h sur UTC : les heures sont celles du lieu.
  const heures = [];
  const temp = [];
  const codes = [];
  const pluie = [];
  const jour = [];
  for (let j = 6; j <= 8; j++) {
    for (let h = 0; h < 24; h++) {
      heures.push('2026-10-0' + j + 'T' + String(h).padStart(2, '0') + ':00');
      temp.push(10 + h / 2);
      codes.push(h % 2 ? 3 : 61);
      pluie.push(h === 7 ? null : h * 2);
      jour.push(h >= 6 && h < 18 ? 1 : 0);
    }
  }
  return {
    timezone: 'Asia/Tokyo',
    current: {
      time: '2026-10-06T06:15',
      temperature_2m: 12.4,
      apparent_temperature: 11.5,
      relative_humidity_2m: 74,
      wind_speed_10m: 12.6,
      wind_direction_10m: 326,
      weather_code: 0,
      is_day: 1,
      precipitation: 0
    },
    hourly: {
      time: heures,
      temperature_2m: temp,
      weather_code: codes,
      precipitation_probability: pluie,
      is_day: jour
    },
    daily: {
      time: ['2026-10-06', '2026-10-07', '2026-10-08'],
      weather_code: [3, 80, 95],
      temperature_2m_max: [23.7, 19.9, 18.2],
      temperature_2m_min: [11.5, 14.3, 9.6],
      precipitation_probability_max: [0, 95, null],
      sunrise: ['2026-10-06T05:41', '2026-10-07T05:42', '2026-10-08T05:43'],
      sunset: ['2026-10-06T17:19', '2026-10-07T17:17', '2026-10-08T17:16']
    }
  };
}

test('decrireCode : ciel dégagé de jour et de nuit', () => {
  assert.deepEqual(Meteo.decrireCode(0, true), { libelle: 'Ciel dégagé', icone: 'soleil' });
  assert.deepEqual(Meteo.decrireCode(0, false), { libelle: 'Ciel dégagé', icone: 'lune' });
});

test('decrireCode : éclaircies de jour et de nuit', () => {
  assert.deepEqual(Meteo.decrireCode(2, true), { libelle: 'Partiellement nuageux', icone: 'eclaircies' });
  assert.equal(Meteo.decrireCode(2, false).icone, 'eclaircies-nuit');
});

test('decrireCode : grandes familles de codes', () => {
  assert.deepEqual(Meteo.decrireCode(3, true), { libelle: 'Couvert', icone: 'nuage' });
  assert.equal(Meteo.decrireCode(45, true).icone, 'brouillard');
  assert.equal(Meteo.decrireCode(51, true).icone, 'bruine');
  assert.deepEqual(Meteo.decrireCode(61, true), { libelle: 'Pluie faible', icone: 'pluie' });
  assert.equal(Meteo.decrireCode(71, true).icone, 'neige');
  assert.equal(Meteo.decrireCode(80, true).icone, 'averses');
  assert.deepEqual(Meteo.decrireCode(95, true), { libelle: 'Orage', icone: 'orage' });
});

test('decrireCode : tous les codes OMM documentés ont un libellé', () => {
  const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67,
    71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
  for (const c of codes) {
    assert.notEqual(Meteo.decrireCode(c, true).libelle, 'Inconnu', 'code ' + c);
  }
});

test('decrireCode : code inconnu ou absent', () => {
  assert.deepEqual(Meteo.decrireCode(999, true), { libelle: 'Inconnu', icone: 'nuage' });
  assert.deepEqual(Meteo.decrireCode(null, true), { libelle: 'Inconnu', icone: 'nuage' });
});

test('directionCardinale : les huit directions', () => {
  const attendu = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
  for (const d of Object.keys(attendu)) {
    assert.equal(Meteo.directionCardinale(Number(d)), attendu[d]);
  }
});

test('directionCardinale : bornes et valeur absente', () => {
  assert.equal(Meteo.directionCardinale(360), 'N');
  assert.equal(Meteo.directionCardinale(338), 'N');
  assert.equal(Meteo.directionCardinale(326), 'NO');
  assert.equal(Meteo.directionCardinale(null), '–');
});

test('formaterTemp : arrondi et signe', () => {
  assert.equal(Meteo.formaterTemp(12.4), '12°');
  assert.equal(Meteo.formaterTemp(-3.6), '-4°');
  assert.equal(Meteo.formaterTemp(-0.4), '0°');
});

test('formaterTemp : valeur absente', () => {
  assert.equal(Meteo.formaterTemp(null), '–');
  assert.equal(Meteo.formaterTemp(undefined), '–');
  assert.equal(Meteo.formaterTemp(NaN), '–');
});

test('formaterPourcent et formaterVent', () => {
  assert.equal(Meteo.formaterPourcent(95), '95 %');
  assert.equal(Meteo.formaterPourcent(0), '0 %');
  assert.equal(Meteo.formaterPourcent(null), '–');
  assert.equal(Meteo.formaterVent(12.6), '13 km/h');
  assert.equal(Meteo.formaterVent(null), '–');
});

test('heureDe', () => {
  assert.equal(Meteo.heureDe('2026-10-06T07:57'), '07:57');
  assert.equal(Meteo.heureDe(null), '–');
  assert.equal(Meteo.heureDe('n importe quoi'), '–');
});

test('nomJour', () => {
  assert.equal(Meteo.nomJour('2026-10-06', '2026-10-06'), "Aujourd'hui");
  assert.equal(Meteo.nomJour('2026-10-07', '2026-10-06'), 'Demain');
  assert.equal(Meteo.nomJour('2026-10-08', '2026-10-06'), 'jeudi');
  assert.equal(Meteo.nomJour('2026-11-01', '2026-10-31'), 'Demain');
  assert.equal(Meteo.nomJour('2026-11-02', '2026-10-31'), 'lundi');
});

test('preparer : conditions actuelles', () => {
  const p = Meteo.preparer(reponseExemple());
  assert.equal(p.fuseau, 'Asia/Tokyo');
  assert.deepEqual(p.actuel, {
    heure: '2026-10-06T06:15',
    temp: 12.4,
    ressenti: 11.5,
    humidite: 74,
    vent: 12.6,
    direction: 326,
    code: 0,
    jour: true,
    pluieJour: 0,
    lever: '2026-10-06T05:41',
    coucher: '2026-10-06T17:19'
  });
});

test("preparer : les 24 heures commencent à l'heure courante du lieu", () => {
  const p = Meteo.preparer(reponseExemple());
  assert.equal(p.heures.length, 24);
  assert.equal(p.heures[0].heure, '2026-10-06T06:00');
  assert.equal(p.heures[23].heure, '2026-10-07T05:00');
  assert.deepEqual(p.heures[0], { heure: '2026-10-06T06:00', temp: 13, code: 61, pluie: 12, jour: true });
});

test('preparer : une probabilité de pluie absente reste null', () => {
  const p = Meteo.preparer(reponseExemple());
  assert.equal(p.heures[1].heure, '2026-10-06T07:00');
  assert.equal(p.heures[1].pluie, null);
  assert.equal(p.jours[2].pluie, null);
});

test('preparer : les jours', () => {
  const p = Meteo.preparer(reponseExemple());
  assert.equal(p.jours.length, 3);
  assert.deepEqual(p.jours[1], { date: '2026-10-07', code: 80, max: 19.9, min: 14.3, pluie: 95 });
});

test('preparer : moins de 24 heures disponibles', () => {
  const r = reponseExemple();
  r.current.time = '2026-10-08T20:30';
  const p = Meteo.preparer(r);
  assert.equal(p.heures.length, 4);
  assert.equal(p.heures[0].heure, '2026-10-08T20:00');
});
