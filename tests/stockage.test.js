'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Stockage = require('../app/src/main/assets/js/stockage.js');

function magasin(initial) {
  const donnees = Object.assign({}, initial);
  return {
    donnees: donnees,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(donnees, k) ? donnees[k] : null),
    setItem: (k, v) => { donnees[k] = String(v); },
    removeItem: (k) => { delete donnees[k]; }
  };
}

const PARIS = { nom: 'Paris', region: 'Île-de-France', pays: 'France', latitude: 48.85, longitude: 2.35 };
const LYON = { nom: 'Lyon', region: 'Auvergne-Rhône-Alpes', pays: 'France', latitude: 45.74906, longitude: 4.84789 };
const NICE = { nom: 'Nice', region: '', pays: 'France', latitude: 43.7, longitude: 7.26 };

test('lireVille : Paris par défaut', () => {
  assert.deepEqual(Stockage.creer(magasin()).lireVille(), PARIS);
});

test('ecrireVille puis lireVille, y compris après redémarrage', () => {
  const m = magasin();
  Stockage.creer(m).ecrireVille(LYON);
  assert.deepEqual(Stockage.creer(m).lireVille(), LYON);
});

test('favoris : ajout, état, retrait', () => {
  const s = Stockage.creer(magasin());
  assert.deepEqual(s.lireFavoris(), []);
  assert.equal(s.estFavori(LYON), false);

  assert.equal(s.basculerFavori(LYON), true);
  assert.equal(s.basculerFavori(NICE), true);
  assert.equal(s.estFavori(LYON), true);
  assert.deepEqual(s.lireFavoris(), [LYON, NICE]);

  assert.equal(s.basculerFavori(LYON), false);
  assert.deepEqual(s.lireFavoris(), [NICE]);
});

test('favoris : même lieu à des coordonnées légèrement différentes', () => {
  const s = Stockage.creer(magasin());
  s.basculerFavori(LYON);
  const presque = Object.assign({}, LYON, { latitude: 45.751, longitude: 4.849 });
  assert.equal(s.estFavori(presque), true);
  assert.equal(s.basculerFavori(presque), false);
  assert.deepEqual(s.lireFavoris(), []);
});

test('prévisions : aller-retour pour la même ville', () => {
  const m = magasin();
  Stockage.creer(m).ecrirePrevisions(LYON, { current: { time: 't' } }, 1700000000000);
  assert.deepEqual(Stockage.creer(m).lirePrevisions(LYON), {
    donnees: { current: { time: 't' } },
    recuLe: 1700000000000
  });
});

test("prévisions : rien pour une autre ville que celle en mémoire", () => {
  const s = Stockage.creer(magasin());
  s.ecrirePrevisions(LYON, { a: 1 }, 1);
  assert.equal(s.lirePrevisions(NICE), null);
});

test('prévisions : rien en mémoire', () => {
  assert.equal(Stockage.creer(magasin()).lirePrevisions(PARIS), null);
});

test('données corrompues : valeurs par défaut, sans exception', () => {
  for (const pourri of ['{pas du json', 'null', '42', '"texte"', '[]', '{"nom":"X"}']) {
    const s = Stockage.creer(magasin({
      'meteo.ville': pourri,
      'meteo.favoris': pourri,
      'meteo.previsions': pourri
    }));
    assert.deepEqual(s.lireVille(), PARIS, 'ville : ' + pourri);
    assert.deepEqual(s.lireFavoris(), [], 'favoris : ' + pourri);
    assert.equal(s.lirePrevisions(PARIS), null, 'prévisions : ' + pourri);
  }
});

test('favoris : les entrées invalides sont écartées, les autres gardées', () => {
  const s = Stockage.creer(magasin({
    'meteo.favoris': JSON.stringify([LYON, null, { nom: 'Sans coordonnées' }, 'x', NICE])
  }));
  assert.deepEqual(s.lireFavoris(), [LYON, NICE]);
});

test('magasin en panne : aucune exception', () => {
  const casse = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('SecurityError'); }
  };
  const s = Stockage.creer(casse);
  assert.deepEqual(s.lireVille(), PARIS);
  assert.deepEqual(s.lireFavoris(), []);
  assert.equal(s.lirePrevisions(PARIS), null);
  assert.doesNotThrow(() => s.ecrireVille(LYON));
  assert.doesNotThrow(() => s.ecrirePrevisions(LYON, {}, 1));
  assert.equal(s.basculerFavori(LYON), true);
});

test('magasin absent : aucune exception', () => {
  const s = Stockage.creer(null);
  assert.deepEqual(s.lireVille(), PARIS);
  assert.doesNotThrow(() => s.ecrireVille(LYON));
});
