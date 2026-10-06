'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Vue = require('../app/src/main/assets/js/vue.js');

const VILLE = { nom: 'Lyon', region: 'Auvergne-Rhône-Alpes', pays: 'France', latitude: 45.75, longitude: 4.85 };

function previsions() {
  const heures = [];
  for (let h = 0; h < 24; h++) {
    heures.push({
      heure: '2026-10-06T' + String(h).padStart(2, '0') + ':00',
      temp: 10 + h, code: 61, pluie: h === 1 ? null : 40, jour: h > 6
    });
  }
  const jours = [];
  for (let j = 0; j < 7; j++) {
    jours.push({ date: '2026-10-' + String(6 + j).padStart(2, '0'), code: 3, max: 20 + j, min: 10 + j, pluie: j === 2 ? null : 30 });
  }
  return {
    fuseau: 'Europe/Paris',
    actuel: {
      heure: '2026-10-06T06:15', temp: 12.4, ressenti: 11.5, humidite: 74, vent: 12.6,
      direction: 326, code: 0, jour: true, pluieJour: 20,
      lever: '2026-10-06T07:57', coucher: '2026-10-06T19:19'
    },
    heures: heures,
    jours: jours
  };
}

const OPTIONS = { recuLe: Date.UTC(2026, 9, 6, 4, 15), maintenant: Date.UTC(2026, 9, 6, 4, 20), horsLigne: false, favori: false, enCours: false };

function compter(texte, motif) {
  return texte.split(motif).length - 1;
}

test('echapper : caractères dangereux en HTML', () => {
  assert.equal(Vue.echapper('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
  assert.equal(Vue.echapper('a "b" & \'c\''), 'a &quot;b&quot; &amp; &#39;c&#39;');
  assert.equal(Vue.echapper(null), '');
  assert.equal(Vue.echapper(12), '12');
});

test('icone : SVG pour un nom connu, repli pour un nom inconnu', () => {
  assert.match(Vue.icone('soleil'), /^<svg[\s\S]*<\/svg>$/);
  assert.equal(Vue.icone('nimporte'), Vue.icone('nuage'));
  assert.notEqual(Vue.icone('soleil'), Vue.icone('lune'));
});

test('rendreMeteo : affiche la ville, les conditions et la source', () => {
  const html = Vue.rendreMeteo(VILLE, previsions(), OPTIONS);
  assert.ok(html.includes('Lyon'));
  assert.ok(html.includes('Auvergne-Rhône-Alpes, France'));
  assert.ok(html.includes('12°'));
  assert.ok(html.includes('Ciel dégagé'));
  assert.ok(html.includes('Ressenti 12°'));
  assert.ok(html.includes('13 km/h'));
  assert.ok(html.includes('Nord-ouest'));
  assert.ok(html.includes('74 %'));
  assert.ok(html.includes('07:57'));
  assert.ok(html.includes('19:19'));
  assert.ok(html.includes('Open-Meteo.com'));
});

test('rendreMeteo : 24 heures et 7 jours', () => {
  const html = Vue.rendreMeteo(VILLE, previsions(), OPTIONS);
  assert.equal(compter(html, 'class="heure"'), 24);
  assert.equal(compter(html, 'class="jour"'), 7);
  assert.ok(html.includes("Aujourd'hui") || html.includes('Aujourd&#39;hui'));
  assert.ok(html.includes('Demain'));
  assert.ok(html.includes('jeudi'));
});

test('rendreMeteo : un nom de ville hostile est échappé', () => {
  const ville = { nom: '<b>x</b>', region: '<script>alert(1)</script>', pays: '"><img src=x>', latitude: 1, longitude: 2 };
  const html = Vue.rendreMeteo(ville, previsions(), OPTIONS);
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('rendreMeteo : les valeurs absentes donnent un tiret', () => {
  const p = previsions();
  p.actuel.temp = null;
  p.actuel.ressenti = null;
  p.actuel.humidite = null;
  p.actuel.vent = null;
  p.actuel.direction = null;
  p.actuel.pluieJour = null;
  p.actuel.lever = null;
  p.actuel.code = null;
  p.jours[3].max = null;
  p.jours[3].min = null;
  const html = Vue.rendreMeteo(VILLE, p, OPTIONS);
  assert.ok(!/null|NaN|undefined/.test(html), 'aucune valeur brute dans la page');
  assert.ok(html.includes('–'));
});

test('rendreMeteo : prévisions vides', () => {
  const p = previsions();
  p.heures = [];
  p.jours = [];
  const html = Vue.rendreMeteo(VILLE, p, OPTIONS);
  assert.ok(!/null|NaN|undefined/.test(html));
  assert.equal(compter(html, 'class="heure"'), 0);
});

test('rendreMeteo : bandeau hors connexion seulement hors ligne', () => {
  assert.ok(!Vue.rendreMeteo(VILLE, previsions(), OPTIONS).includes('Hors connexion'));
  const hors = Vue.rendreMeteo(VILLE, previsions(), Object.assign({}, OPTIONS, { horsLigne: true }));
  assert.ok(hors.includes('Hors connexion'));
});

test('rendreMeteo : état du bouton favori', () => {
  assert.ok(Vue.rendreMeteo(VILLE, previsions(), OPTIONS).includes('aria-pressed="false"'));
  const fav = Vue.rendreMeteo(VILLE, previsions(), Object.assign({}, OPTIONS, { favori: true }));
  assert.ok(fav.includes('aria-pressed="true"'));
});

test('formaterRecu : heure seule le jour même, date au-delà', () => {
  const recu = new Date(2026, 9, 6, 6, 5).getTime();
  assert.equal(Vue.formaterRecu(recu, new Date(2026, 9, 6, 9, 0).getTime()), '06:05');
  assert.equal(Vue.formaterRecu(recu, new Date(2026, 9, 8, 9, 0).getTime()), 'le 06/10 à 06:05');
});

test('rendreVilles : une ligne par ville, noms échappés', () => {
  const html = Vue.rendreVilles([VILLE, { nom: '<i>y</i>', region: '', pays: 'France', latitude: 1, longitude: 2 }], { vide: 'Rien' });
  assert.equal(compter(html, 'data-action="choisir"'), 2);
  assert.ok(html.includes('data-index="0"') && html.includes('data-index="1"'));
  assert.ok(!html.includes('<i>y</i>'));
  assert.ok(!html.includes('Rien'));
  assert.ok(!html.includes('data-action="retirer"'));
});

test('rendreVilles : liste vide et bouton de retrait', () => {
  assert.ok(Vue.rendreVilles([], { vide: 'Aucune ville trouvée' }).includes('Aucune ville trouvée'));
  const html = Vue.rendreVilles([VILLE], { vide: 'Rien', retirable: true });
  assert.equal(compter(html, 'data-action="retirer"'), 1);
});

test('rendreErreur et rendreChargement', () => {
  const e = Vue.rendreErreur(VILLE, '<Pas de connexion>');
  assert.ok(e.includes('&lt;Pas de connexion&gt;'));
  assert.ok(e.includes('data-action="actualiser"'));
  assert.ok(e.includes('Lyon'));
  assert.ok(Vue.rendreChargement(VILLE).includes('Lyon'));
});
